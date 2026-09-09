/**
 * The `<masonry-grid>` component: the piece everything else hangs off.
 *
 * This file is deliberately mostly *wiring*. The real work lives in `core/`,
 * one job per file, and the job of this component is to hold them together and
 * expose them to Angular. If you are reading the library for the first time,
 * read `runLayout()` below — it is the whole story in about forty lines — and
 * then follow it into whichever collaborator you care about.
 *
 * A layout pass, start to finish:
 *
 *   1. `ItemRegistry`   — which items are in the grid, in page order
 *   2. `SizeWatcher`    — how wide the container is, how tall each item is
 *   3. `column-resolver`— turn that width into a column count and width
 *   4. `ItemStyles`     — give every item its width
 *   5. `layoutSignature`— would this pass change anything? if not, stop here
 *   6. `MasonryLayoutEngine` — the pure solver: heights in, coordinates out
 *   7. `ItemStyles`     — write the coordinates as transforms
 *   8. `Motion`         — play entry effects, arm movement transitions
 *
 * Steps 1-3 only read from the DOM and steps 4-8 only write to it. Keeping the
 * two apart is what stops the browser having to re-run layout mid-pass, which
 * is the single biggest thing separating a smooth grid from a janky one.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  type Signal,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { MasonryGridHost } from './core/host';
import { GridOptionsResolver, coerceShorthand } from './core/grid-options';
import { ItemRegistry } from './core/item-registry';
import { ItemStyles } from './core/item-styles';
import { MasonryLayoutEngine } from './core/layout-engine';
import { Motion } from './core/motion';
import { SizeWatcher } from './core/size-watcher';
import { FrameScheduler } from './core/scheduler';
import { FORCE_NEXT_LAYOUT, layoutSignature } from './core/layout-signature';
import { resolveColumnGeometry, resolveFallbackColumns } from './core/column-resolver';
import {
  nativeColumnsAreStatic,
  nativeTemplateColumns,
  nativeUnsupportedOptions,
  supportsNativeMasonry,
} from './core/native';
import { resolveNativeColumns } from './core/native-grid';
import { NG_MASONRY_GRID_DEFAULTS } from './providers';
import type {
  ItemRecord,
  MasonryBreakpoints,
  MasonryGridOptions,
  MasonryGridState,
  MasonryItemHandle,
  MasonryLayoutEvent,
  MasonryLayoutSolution,
  MasonryRemoveEvent,
  ResolvedColumnGeometry,
  ResolvedMasonryGridOptions,
} from './models';

declare const ngDevMode: boolean | undefined;

const INITIAL_STATE: MasonryGridState = Object.freeze({
  columns: 0,
  columnWidth: 0,
  contentHeight: 0,
  itemCount: 0,
  pass: 0,
});

/** Applied before the first pass, and removed the moment one runs. */
const FALLBACK_CLASS = 'masonry-grid--fallback';

/**
 * Warn once about a configuration where two features contradict each other.
 *
 * This is a module-level function, not a method, and that is deliberate: a
 * bundler cannot prove a class method is unreachable — it is a property on a
 * prototype and could in principle be called by name — so a method's body
 * survives into production even when its only caller sits behind
 * `if (ngDevMode)`. A free function called from inside that branch is dropped
 * along with the branch, taking these strings with it.
 *
 * The flags are module-level too, so each warning is printed once per
 * application rather than once per grid. Twenty grids with the same mistake is
 * one mistake.
 */
let warnedSizerConflict = false;
let warnedBottomStamp = false;

function warnAboutConflicts(
  options: ResolvedMasonryGridOptions,
  hasSizer: boolean,
  hasStamps: boolean,
): void {
  if (
    hasSizer &&
    !warnedSizerConflict &&
    (options.columns !== undefined || options.columnWidth !== undefined)
  ) {
    warnedSizerConflict = true;
    console.warn(
      '[masonry-angular] A `masonryGridSizer` element takes precedence over the `columns` and ' +
        '`columnWidth` options, which are being ignored. Remove one or the other.',
    );
  }

  if (hasStamps && !warnedBottomStamp && options.verticalOrigin === 'bottom') {
    warnedBottomStamp = true;
    console.warn(
      "[masonry-angular] `verticalOrigin: 'bottom'` does not support stamps. Stamps are " +
        'resolved against the top edge and then mirrored with the rest of the layout, so items ' +
        'will flow around the wrong region. Use one or the other.',
    );
  }
}

/**
 * A masonry grid that positions its projected children into balanced columns.
 *
 * The common case is plain attributes — no binding, no object literal:
 *
 * ```html
 * <masonry-grid columns="3" gutter="20">
 *   @for (photo of photos(); track photo.id) {
 *     <article masonryGridItem>…</article>
 *   }
 * </masonry-grid>
 * ```
 *
 * Responsive grids take a breakpoint map, or a target column width instead:
 *
 * ```html
 * <masonry-grid [columns]="{ 0: 1, 768: 2, 1200: 4 }" gutter="20">…</masonry-grid>
 * <masonry-grid columnWidth="260" gutter="20">…</masonry-grid>
 * ```
 *
 * Anything beyond those five shorthands lives on `[options]`, and the two
 * compose — a shorthand wins over the same field in `[options]`.
 */
@Component({
  selector: 'masonry-grid',
  exportAs: 'masonryGrid',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MasonryGridHost, useExisting: forwardRef(() => MasonryGrid) }],
  host: {
    class: 'masonry-grid',
    '[class.masonry-grid--ready]': 'ready()',
    '[class.masonry-grid--fallback]': 'usesFallback()',
    '[class.masonry-grid--native]': 'options().native',
    '[style.--masonry-fallback-columns]': 'fallbackColumns()',
    '[style.--masonry-gutter-x]': 'gutterXPx()',
    '[style.--masonry-gutter-y]': 'gutterYPx()',
    '[style.--masonry-native-columns]': 'nativeTemplate()',
  },
  styles: `
    :host {
      display: block;
      position: relative;
    }

    /*
     * Pre-hydration and no-JS rendering. CSS multi-column is not true masonry,
     * but it fills columns top to bottom with the right gaps, so the server
     * response is useful and hydration swaps in the real layout without a jump.
     */
    :host(.masonry-grid--fallback) {
      column-count: var(--masonry-fallback-columns, 2);
      column-gap: var(--masonry-gutter-x, 16px);
      column-fill: balance;
    }

    /*
     * Native CSS masonry, opted into with \`native: true\`.
     *
     * The decision is made here, by the browser, rather than in JavaScript —
     * which is the whole point: server-rendered HTML is already laid out
     * correctly on first paint, with no measuring pass and nothing to hydrate.
     * A browser that matches neither rule keeps the multi-column fallback above
     * and hands over to the JavaScript engine.
     *
     * Two spellings, because the feature was renamed mid-flight:
     * \`grid-lanes\` is the final syntax and what Safari ships; \`masonry\` is
     * Chromium's earlier prototype, still what its flag exposes. They take the
     * same \`grid-template-columns\` and \`gap\`, so the declarations are
     * identical and a browser simply drops the block it cannot parse.
     *
     * Multi-column properties do not apply to a grid container, so the
     * fallback's \`column-count\` goes inert on its own once either rule wins.
     */
    @supports (display: grid-lanes) {
      :host(.masonry-grid--native) {
        display: grid-lanes;
        grid-template-columns: var(--masonry-native-columns, repeat(3, 1fr));
        column-gap: var(--masonry-gutter-x, 16px);
        row-gap: var(--masonry-gutter-y, 16px);
      }
    }

    @supports (display: masonry) and (not (display: grid-lanes)) {
      :host(.masonry-grid--native) {
        display: masonry;
        grid-template-columns: var(--masonry-native-columns, repeat(3, 1fr));
        column-gap: var(--masonry-gutter-x, 16px);
        row-gap: var(--masonry-gutter-y, 16px);
      }
    }
  `,
})
export class MasonryGrid implements MasonryGridHost {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  // ---------------------------------------------------------------------------
  // Inputs
  //
  // The five fields almost every grid sets are top-level inputs, so the common
  // case is a plain HTML attribute and never an object literal. Everything else
  // lives on `[options]`. See `core/grid-options.ts` for how they merge.
  // ---------------------------------------------------------------------------

  /**
   * Fixed column count, or column counts keyed by breakpoint.
   *
   * `columns="3"`, `[columns]="3"` and `[columns]="{ 0: 1, 768: 2, 1200: 4 }"`
   * are all accepted. Mutually exclusive with `columnWidth`.
   */
  readonly columns = input<
    number | MasonryBreakpoints | undefined,
    number | string | MasonryBreakpoints | undefined
  >(undefined, { transform: coerceShorthand });

  /**
   * Target minimum column width in px; the count follows the available width.
   * `columnWidth="260"` is the whole responsive story for most grids — no
   * breakpoint table to maintain.
   */
  readonly columnWidth = input<number | undefined, number | string | undefined>(undefined, {
    transform: coerceShorthand,
  });

  /** Gap in px, on both axes. `gutterX` and `gutterY` override it per axis. */
  readonly gutter = input<number | undefined, number | string | undefined>(undefined, {
    transform: coerceShorthand,
  });
  /** Horizontal gap in px. Falls back to `gutter`. */
  readonly gutterX = input<number | undefined, number | string | undefined>(undefined, {
    transform: coerceShorthand,
  });
  /** Vertical gap in px. Falls back to `gutter`. */
  readonly gutterY = input<number | undefined, number | string | undefined>(undefined, {
    transform: coerceShorthand,
  });

  /**
   * Everything the shorthands above do not cover — animations, SSR, RTL,
   * stamps, escape hatches.
   *
   * This is the raw `[options]` input, public only because Angular requires a
   * bound input to be. Read `options()` instead: that is the merged, validated,
   * fully defaulted value actually in effect.
   */
  readonly optionsInput = input<MasonryGridOptions | undefined>(undefined, { alias: 'options' });

  // ---------------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------------

  readonly layoutComplete = output<MasonryLayoutEvent>();
  /** Fires once every item removed in a batch has finished its exit effect. */
  readonly removeComplete = output<MasonryRemoveEvent>();
  /**
   * Fires when the last item waiting on `awaitImages` has decoded, carrying the
   * number of registered items. Never fires when no item had to wait.
   */
  readonly itemsLoaded = output<number>();

  // ---------------------------------------------------------------------------
  // Reading the grid
  // ---------------------------------------------------------------------------

  /** `true` once the browser has completed its first real layout pass. */
  readonly ready = signal(false);

  /**
   * What the last pass produced: column count, column width, content height,
   * item count and pass number. One signal rather than five, because these are
   * written together and almost always read together — and because it leaves
   * `columns`, `columnWidth` and `gutter` free to mean what a reader expects
   * them to mean, which is the grid's inputs.
   */
  readonly state = signal<MasonryGridState>(INITIAL_STATE);

  /**
   * `true` when the browser is laying this grid out itself with native CSS
   * masonry, so no measuring, positioning or observing is happening at all.
   *
   * Always `false` on the server and in browsers without `display: grid-lanes`.
   */
  readonly nativeActive = computed(() => this.options().native && supportsNativeMasonry());

  /**
   * The elements registered as items, in DOM order — the replacement for
   * `masonry-layout`'s `getItemElements()`. Ignored and not-yet-measured items
   * are included; this is the registry, not the last pass's output.
   */
  items(): readonly HTMLElement[] {
    return this.registry.elementsInDomOrder();
  }

  // ---------------------------------------------------------------------------
  // Options
  // ---------------------------------------------------------------------------

  private readonly optionsResolver = new GridOptionsResolver(inject(NG_MASONRY_GRID_DEFAULTS));

  /** The merged, validated, fully defaulted options in effect right now. */
  readonly options: Signal<ResolvedMasonryGridOptions> = computed(() =>
    this.optionsResolver.resolve(this.optionsInput(), {
      columns: this.columns(),
      columnWidth: this.columnWidth(),
      gutter: this.gutter(),
      gutterX: this.gutterX(),
      gutterY: this.gutterY(),
    }),
  );

  // ---------------------------------------------------------------------------
  // Host bindings
  // ---------------------------------------------------------------------------

  /**
   * Whether the CSS multi-column fallback is currently painting the grid.
   *
   * A `native` grid always keeps it on until the first pass, whatever
   * `ssr.fallback` says: in a browser with `grid-lanes` the `@supports` rule
   * overrides it on first paint, and in one without it this *is* the
   * pre-hydration rendering.
   */
  readonly usesFallback = computed(() => {
    const options = this.options();
    return !this.ready() && (options.native || options.ssr.fallback === 'columns');
  });

  /** Column count used by that fallback. */
  readonly fallbackColumns = computed(() => resolveFallbackColumns(this.options()));

  protected readonly gutterXPx = computed(() => `${this.options().gutterX}px`);
  protected readonly gutterYPx = computed(() => `${this.options().gutterY}px`);

  /**
   * Column count for a native grid whose `columns` is a breakpoint map — the
   * one native case a single static declaration cannot express. Fixed counts
   * and `columnWidth` grids never read it, and never observe anything.
   */
  private readonly nativeBreakpointColumns = signal(0);

  /** `grid-template-columns` for a native grid, or `null` when not opted in. */
  protected readonly nativeTemplate = computed(() => {
    const options = this.options();
    if (!options.native) return null;
    const measured = this.nativeBreakpointColumns();
    return nativeTemplateColumns(
      options,
      measured > 0 ? measured : resolveFallbackColumns(options),
    );
  });

  // ---------------------------------------------------------------------------
  // Collaborators
  // ---------------------------------------------------------------------------

  private readonly registry = new ItemRegistry(this.element);
  private readonly styles = new ItemStyles();
  private readonly engine = new MasonryLayoutEngine();
  private readonly scheduler = new FrameScheduler(() => this.runLayout());
  private readonly motion = new Motion(this.element, () => this.onExitSettled());
  private readonly sizes = new SizeWatcher(this.element, {
    options: () => this.options(),
    setItemHeight: (element, height) => this.onItemMeasured(element, height),
    onChange: (geometryChanged) => this.onSizeChange(geometryChanged),
  });

  /** Items placed for the first time during the current pass. */
  private readonly entering: ItemRecord[] = [];

  // ---------------------------------------------------------------------------
  // Pass bookkeeping
  // ---------------------------------------------------------------------------

  private signature = FORCE_NEXT_LAYOUT;
  private pass = 0;
  private initialized = false;
  private destroyed = false;
  private removedSinceEmit = 0;
  private awaitingImages = 0;

  /**
   * Set while `autoLayout: false` holds the grid back. Measurements and option
   * changes still schedule passes — the `ResizeObserver` does not know about the
   * option — so the gate has to sit on the pass itself, not just on the first
   * schedule. `layout()` opens it.
   */
  private layoutBlocked = false;

  private warnedNativeConflict = false;

  constructor() {
    // `afterNextRender` is browser-only, which doubles as the SSR guard: the
    // server renders the multi-column fallback and never touches an observer.
    afterNextRender(() => this.initialize());

    // Options have to drive layout on their own. Most changes alter an item's
    // size and would come back through the `ResizeObserver` anyway, but plenty
    // do not — `direction`, `fitWidth` and `contentVisibility` change the result
    // without changing a single measurement — so the pass is forced.
    effect(() => {
      this.options();
      this.signature = FORCE_NEXT_LAYOUT;
      this.styles.invalidate();
      this.requestLayout();
    });

    inject(DestroyRef).onDestroy(() => {
      // Flagged first, so an animation cancelled below cannot emit on the way out.
      this.destroyed = true;
      this.scheduler.destroy();
      this.sizes.stop();
      this.motion.destroy();
      this.registry.clear();
      this.entering.length = 0;
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Queue a layout pass on the next animation frame. Any number of calls within
   * one frame collapse into a single pass, so this is cheap to call liberally.
   */
  requestLayout(): void {
    this.scheduler.schedule();
  }

  /**
   * Run a pass immediately, bypassing the dirty check and the frame queue.
   * Reach for this after mutating item content in a way the observers cannot
   * see; ordinary size, option and collection changes are picked up already.
   */
  layout(): void {
    this.scheduler.cancel();
    this.layoutBlocked = false;
    this.signature = FORCE_NEXT_LAYOUT;
    this.runLayout();
  }

  /** Discard cached measurements, re-read every item, and lay out again. */
  remeasure(): void {
    // One batched read pass; no writes are interleaved, so this costs a single
    // reflow rather than one per item.
    for (const record of this.registry.allRecords()) {
      record.height = record.handle.element.offsetHeight;
      record.measured = true;
    }
    this.layout();
  }

  // ---------------------------------------------------------------------------
  // Registration — called by the item, stamp and sizer directives
  // ---------------------------------------------------------------------------

  addItem(handle: MasonryItemHandle): void {
    if (!this.registry.addItem(handle)) return;

    // Under native layout the item is registered so `items()` and
    // `state().itemCount` stay truthful, but it is never measured: the browser
    // reflows on its own.
    if (!this.nativeActive()) {
      this.styles.invalidate();
      this.sizes.watchItem(handle.element);
    }
    this.requestLayout();
  }

  removeItem(handle: MasonryItemHandle): void {
    const record = this.registry.removeItem(handle);
    if (!record) return;

    this.sizes.unwatch(handle.element);
    this.styles.invalidate();

    // An item that was never placed has nothing on screen to animate away, and
    // an exit effect that does not start is counted here instead of on finish.
    if (!record.placed || !this.motion.playExit(record, this.options())) {
      this.removedSinceEmit++;
    }
    this.requestLayout();
  }

  addStamp(element: HTMLElement): void {
    if (!this.registry.addStamp(element)) return;
    // Native layout has no concept of a stamp; `initializeNative` warns.
    if (!this.nativeActive()) this.sizes.watchStamp(element);
    this.requestLayout();
  }

  removeStamp(element: HTMLElement): void {
    if (!this.registry.removeStamp(element)) return;
    this.sizes.unwatch(element);
    this.requestLayout();
  }

  setSizer(element: HTMLElement): void {
    if (this.registry.sizer === element) return;
    if (this.registry.sizer) this.sizes.unwatch(this.registry.sizer);
    this.registry.setSizer(element);
    this.sizes.watchSizer(element);
    this.signature = FORCE_NEXT_LAYOUT;
    this.requestLayout();
  }

  clearSizer(element: HTMLElement): void {
    if (this.registry.sizer !== element) return;
    this.sizes.unwatch(element);
    this.registry.setSizer(undefined);
    this.signature = FORCE_NEXT_LAYOUT;
    this.requestLayout();
  }

  /** @internal Part of the host contract; see `MasonryGridHost`. */
  invalidateItemGeometry(): void {
    this.styles.invalidate();
    this.requestLayout();
  }

  /** @internal Part of the host contract; see `MasonryGridHost`. */
  noteImagesPending(): void {
    this.awaitingImages++;
  }

  /** @internal Part of the host contract; see `MasonryGridHost`. */
  noteImagesSettled(): void {
    if (this.awaitingImages === 0) return;
    this.awaitingImages--;
    if (this.awaitingImages > 0 || this.destroyed) return;
    const count = this.registry.itemCount;
    this.zone.run(() => this.itemsLoaded.emit(count));
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private initialize(): void {
    this.initialized = true;

    if (this.nativeActive()) {
      this.initializeNative();
      return;
    }

    // Everything here is plumbing that must never schedule change detection.
    this.zone.runOutsideAngular(() => {
      this.sizes.start();
      this.sizes.syncWidthSource(this.options());
      for (const element of this.registry.allElements()) this.sizes.watchItem(element);
      for (const element of this.registry.stamps) this.sizes.watchStamp(element);
      if (this.registry.sizer) this.sizes.watchSizer(this.registry.sizer);
    });

    // `autoLayout: false` holds the grid on its pre-layout rendering until the
    // application calls `layout()` itself.
    if (this.options().autoLayout) this.scheduler.schedule();
    else this.layoutBlocked = true;
  }

  /**
   * Hand the grid over to the browser.
   *
   * Nothing to measure, nothing to position, and — for a fixed count or a
   * `columnWidth` grid — nothing to observe either: `grid-template-columns`
   * already describes the whole responsive behaviour. A breakpoint map is the
   * one case that cannot be written as a single declaration, so it keeps one
   * container observer alive to re-evaluate the count.
   */
  private initializeNative(): void {
    const options = this.options();

    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      const message = nativeUnsupportedOptions(options, this.registry.hasStamps);
      if (message !== undefined && !this.warnedNativeConflict) {
        this.warnedNativeConflict = true;
        console.warn(message);
      }
    }

    if (!nativeColumnsAreStatic(options)) {
      this.zone.runOutsideAngular(() => {
        this.sizes.start();
        this.sizes.watchContainerOnly();
      });
    }

    this.element.classList.remove(FALLBACK_CLASS);
    this.runNativeLayout();
  }

  private onItemMeasured(element: HTMLElement, height: number): void {
    const record = this.registry.recordFor(element);
    if (!record) return;
    record.height = height;
    record.measured = true;
  }

  private onSizeChange(geometryChanged: boolean): void {
    // Only container and sizer resizes are debounced. Item measurements must
    // land on the very next frame, or newly added content visibly lags.
    this.scheduler.schedule(geometryChanged ? this.options().resizeDebounce : 0);
  }

  // ---------------------------------------------------------------------------
  // The layout pass
  // ---------------------------------------------------------------------------

  private runLayout(): void {
    if (!this.initialized || this.layoutBlocked) return;
    if (this.nativeActive()) {
      this.runNativeLayout();
      return;
    }

    const started = performance.now();
    const options = this.options();
    this.sizes.syncWidthSource(options);

    // ---- Read phase -------------------------------------------------------
    // Item heights and the container width already arrived through the
    // ResizeObserver, so the only DOM reads here are the child list and, when
    // stamps are present, their offsets. Nothing is written until reads finish.
    const ordered = this.registry.collectOrdered((record) => this.styles.demote(record));
    const stamps = this.registry.stampBoxes();

    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      warnAboutConflicts(options, this.registry.sizer !== undefined, stamps.length > 0);
    }

    const basisWidth =
      options.breakpointBasis === 'viewport' ? this.sizes.viewportWidth : this.sizes.containerWidth;
    const sizerWidth = this.registry.sizer ? this.sizes.sizerWidth : undefined;
    const geometry = resolveColumnGeometry(
      this.sizes.containerWidth,
      basisWidth,
      options,
      sizerWidth,
    );

    // ---- Write phase ------------------------------------------------------
    // Widths go out first and unconditionally: an item cannot report its real
    // height until it has been given its column width, so this write is what
    // unblocks the measurement that the next pass consumes.
    this.styles.writeWidths(this.registry.allRecords(), geometry, options);

    if (this.registry.itemCount > 0 && ordered.length === 0) {
      // Items exist but none have been measured yet. Stay on the fallback
      // rendering rather than flashing an empty grid.
      return;
    }

    const measured = this.registry.measuredSlots(ordered);

    const signature = layoutSignature(
      geometry,
      options,
      measured,
      stamps,
      this.sizes.containerWidth,
      this.sizes.sizerWidth,
    );
    if (signature === this.signature) return;
    this.signature = signature;

    const solution = this.engine.solve({
      items: measured,
      stamps,
      columns: geometry.columns,
      columnWidth: geometry.columnWidth,
      gutterX: options.gutterX,
      gutterY: options.gutterY,
      containerWidth: this.sizes.containerWidth,
      horizontalOrder: options.horizontalOrder,
      rtl: options.direction === 'rtl',
      originBottom: options.verticalOrigin === 'bottom',
    });

    // Leaving the multi-column fallback has to happen in this same synchronous
    // write, not via a change-detected host class: a frame in which items are
    // transformed but still in normal flow reads as a visible jump.
    if (this.pass === 0) this.element.classList.remove(FALLBACK_CLASS);

    this.entering.length = 0;
    const { positions } = solution;
    for (let i = 0; i < ordered.length; i++) {
      const record = ordered[i]!;
      this.styles.writePosition(record, positions[i * 2]!, positions[i * 2 + 1]!);
      if (!record.placed) {
        this.styles.promote(record);
        this.entering.push(record);
      }
    }

    const style = this.element.style;
    if (options.resizeContainer) style.height = `${solution.contentHeight}px`;
    style.setProperty('--masonry-column-width', `${geometry.columnWidth}px`);
    style.setProperty('--masonry-columns', `${geometry.columns}`);
    if (options.fitWidth) style.width = `${solution.contentWidth}px`;

    this.finishPass(geometry, solution, options, ordered.length, started);
  }

  /**
   * A "pass" under native layout: re-evaluate the column count if it is
   * breakpoint-driven, publish the state, and stop. No solve, no writes.
   */
  private runNativeLayout(): void {
    const options = this.options();
    const started = performance.now();

    const columns = resolveNativeColumns(
      this.element,
      options,
      this.sizes.containerWidth,
      this.sizes.viewportWidth,
    );
    if (!nativeColumnsAreStatic(options)) this.nativeBreakpointColumns.set(columns);

    const itemCount = this.registry.itemCount;
    const height = this.element.offsetHeight;
    this.pass++;

    // `columnWidth` is reported as `0` on purpose: the browser owns the track
    // sizes and never tells us what it chose, and a number we did not compute
    // would be a lie that is worse than an obvious zero.
    this.state.set({ columns, columnWidth: 0, contentHeight: height, itemCount, pass: this.pass });
    this.ready.set(true);

    this.zone.run(() => {
      this.layoutComplete.emit({
        columns,
        columnWidth: 0,
        itemCount,
        height,
        width: this.sizes.containerWidth || this.element.clientWidth,
        durationMs: performance.now() - started,
        pass: this.pass,
      });
    });
  }

  /** Publish what the pass produced, and start any effects it earned. */
  private finishPass(
    geometry: ResolvedColumnGeometry,
    solution: MasonryLayoutSolution,
    options: ResolvedMasonryGridOptions,
    itemCount: number,
    started: number,
  ): void {
    const isFirstPass = this.pass === 0;
    this.pass++;

    if (this.entering.length > 0) {
      this.motion.playEntry(this.entering, options, isFirstPass);
      this.motion.enableTransitions(this.entering, options);
    }

    const { columns, columnWidth } = geometry;
    const height = solution.contentHeight;
    const durationMs = performance.now() - started;

    // Signals first: updating them is what notifies a zoneless application.
    this.state.set({ columns, columnWidth, contentHeight: height, itemCount, pass: this.pass });
    this.ready.set(true);

    // Removals that had no exit effect to wait for are reported here, once the
    // pass that closed their gap has actually run.
    if (!this.motion.hasLeavingItems) this.emitRemoveComplete();

    // `run` is a no-op under zoneless change detection and the correct bridge
    // back into Angular for zone-based applications.
    this.zone.run(() => {
      this.layoutComplete.emit({
        columns,
        columnWidth,
        itemCount,
        height,
        width: options.fitWidth ? solution.contentWidth : this.sizes.containerWidth,
        durationMs,
        pass: this.pass,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Removal accounting
  // ---------------------------------------------------------------------------

  private onExitSettled(): void {
    this.removedSinceEmit++;
    if (!this.motion.hasLeavingItems) this.emitRemoveComplete();
  }

  private emitRemoveComplete(): void {
    const removed = this.removedSinceEmit;
    if (removed === 0 || this.destroyed) return;
    this.removedSinceEmit = 0;
    this.zone.run(() => this.removeComplete.emit({ removed }));
  }
}
