import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { MasonryLayoutEngine } from './core/layout-engine';
import { resolveColumnGeometry, resolveFallbackColumns } from './core/column-resolver';
import { FrameScheduler } from './core/scheduler';
import { MasonryGridHost } from './core/host';
import { NG_MASONRY_GRID_DEFAULTS } from './providers';
import type {
  ItemRecord,
  MasonryGridOptions,
  MasonryItemHandle,
  MasonryLayoutEvent,
  MasonryRemoveEvent,
  MasonryStampBox,
  MeasuredSlot,
  ResolvedColumnGeometry,
  ResolvedMasonryGridOptions,
} from './models';
import {
  DEFAULT_MASONRY_GRID_OPTIONS,
  masonryOptionsEqual,
  mergeMasonryGridOptions,
  parseMasonryGridOptions,
} from './schemas/parse';

declare const ngDevMode: boolean | undefined;

const HASH_PRECISION = 100;

/**
 * A masonry grid that positions its projected children into balanced columns.
 *
 * ```html
 * <masonry-grid [options]="{ columns: { 0: 1, 768: 2, 1200: 4 }, gutter: 20 }">
 *   @for (photo of photos(); track photo.id) {
 *     <article masonryGridItem>…</article>
 *   }
 * </masonry-grid>
 * ```
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
    '[style.--masonry-fallback-columns]': 'fallbackColumns()',
    '[style.--masonry-gutter-x]': 'gutterX()',
    '[style.--masonry-gutter-y]': 'gutterY()',
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
  `,
})
export class MasonryGrid implements MasonryGridHost {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly globalDefaults = inject(NG_MASONRY_GRID_DEFAULTS);

  /**
   * Grid configuration. Merged over any application-wide defaults and validated
   * and filled from the defaults, so the value read internally is always complete.
   *
   * Structural equality is applied to the resolved result, which means an inline
   * `[options]="{ gutter: 16 }"` literal — a fresh object on every change
   * detection run — does not retrigger layout.
   */
  readonly options = input<ResolvedMasonryGridOptions, MasonryGridOptions | undefined>(
    DEFAULT_MASONRY_GRID_OPTIONS,
    { transform: (value) => this.resolveOptions(value) },
  );

  private lastRawOptions: MasonryGridOptions | undefined;
  private hasLastRawOptions = false;
  private lastResolvedOptions = DEFAULT_MASONRY_GRID_OPTIONS;

  /**
   * Validate options, reusing the previous result when the incoming value is
   * structurally unchanged.
   *
   * Returning the identical object reference is what makes an inline
   * `[options]="{ gutter: 16 }"` literal — a fresh object on every change
   * detection run — free: the input signal sees no change, so nothing
   * downstream recomputes and no layout is queued.
   */
  private resolveOptions(value: MasonryGridOptions | undefined): ResolvedMasonryGridOptions {
    if (this.hasLastRawOptions && masonryOptionsEqual(this.lastRawOptions, value)) {
      return this.lastResolvedOptions;
    }
    this.lastRawOptions = value;
    this.hasLastRawOptions = true;
    this.lastResolvedOptions = parseMasonryGridOptions(
      mergeMasonryGridOptions(this.globalDefaults, value),
    );
    return this.lastResolvedOptions;
  }

  readonly layoutComplete = output<MasonryLayoutEvent>();
  /** Fires once every item removed in a batch has finished its exit effect. */
  readonly removeComplete = output<MasonryRemoveEvent>();
  /**
   * Fires when the last item waiting on `awaitImages` has decoded, carrying the
   * number of registered items. Never fires when no item had to wait.
   */
  readonly itemsLoaded = output<number>();

  /** `true` once the browser has completed its first real layout pass. */
  readonly ready = signal(false);
  /** Resolved column count for the current container width. */
  readonly columns = signal(0);
  /** Resolved width of a single column, in CSS pixels. */
  readonly columnWidth = signal(0);
  /** Height of the laid-out content, in CSS pixels. */
  readonly contentHeight = signal(0);
  /** Number of items positioned by the most recent pass. */
  readonly itemCount = signal(0);

  /**
   * The elements registered as items, in DOM order — the replacement for
   * `masonry-layout`'s `getItemElements()`. Ignored and not-yet-measured items
   * are included; this is the registry, not the last pass's output.
   */
  items(): readonly HTMLElement[] {
    const registered = this.records;
    const result: HTMLElement[] = [];
    const children = this.element.children;
    for (let i = 0; i < children.length; i++) {
      const element = children[i] as HTMLElement;
      if (registered.has(element)) result.push(element);
    }
    return result;
  }

  /** Whether the CSS multi-column fallback is currently painting the grid. */
  readonly usesFallback = computed(
    () => !this.ready() && this.options().ssr.fallback === 'columns',
  );
  /** Column count used by that fallback. */
  readonly fallbackColumns = computed(() => resolveFallbackColumns(this.options()));

  protected readonly gutterX = computed(() => `${this.options().gutterX}px`);
  protected readonly gutterY = computed(() => `${this.options().gutterY}px`);

  private readonly engine = new MasonryLayoutEngine();
  private readonly scheduler = new FrameScheduler(() => this.runLayout());
  private readonly records = new Map<HTMLElement, ItemRecord>();
  private readonly stamps = new Set<HTMLElement>();

  private sizer: HTMLElement | undefined;
  private sizerWidth = 0;
  private warnedSizerConflict = false;
  private resizeObserver: ResizeObserver | undefined;
  /** Element whose width drives column geometry — the host, or its parent when `fitWidth`. */
  private widthSource: HTMLElement | undefined;
  private teardownViewport: (() => void) | undefined;
  private containerWidth = 0;
  private viewportWidth = 0;
  private signature = 0;
  private pass = 0;
  private initialized = false;
  private destroyed = false;
  /**
   * Set while `autoLayout: false` holds the grid back. Measurements and option
   * changes still schedule passes — the ResizeObserver does not know about the
   * option — so the gate has to sit on the pass itself, not just on the first
   * schedule. `layout()` opens it.
   */
  private layoutBlocked = false;

  /** Geometry the item widths were last written for, and an explicit override. */
  private widthsColumns = -1;
  private widthsColumnWidth = -1;
  private widthsGutterX = -1;
  private widthsDirty = true;

  /** Clones standing in for removed items, keyed by the animation playing them. */
  private readonly leaving = new Map<Animation, HTMLElement>();
  private removedSinceEmit = 0;
  private awaitingImages = 0;
  private warnedBottomStamp = false;

  /** Items whose position transition is enabled on the next frame. */
  private readonly transitionQueue: ItemRecord[] = [];
  private transitionFrame = 0;

  /** Scratch buffers reused across passes to keep the steady state allocation-free. */
  private readonly ordered: ItemRecord[] = [];
  private readonly measured: MeasuredSlot[] = [];
  private readonly stampBoxes: MasonryStampBox[] = [];
  private readonly entering: ItemRecord[] = [];

  constructor() {
    // `afterNextRender` is browser-only, which doubles as the SSR guard: the
    // server renders the multi-column fallback and never touches observers.
    afterNextRender(() => this.initialize());

    // Options have to drive layout on their own. Most changes alter an item's
    // size and would come back through the ResizeObserver anyway, but plenty do
    // not — `direction`, `fitWidth` and `contentVisibility` change the result
    // without changing a single measurement — so the pass is forced.
    effect(() => {
      this.options();
      this.signature = 0;
      this.widthsDirty = true;
      this.requestLayout();
    });

    inject(DestroyRef).onDestroy(() => {
      // Flagged first so an animation cancelled below cannot emit on the way out.
      this.destroyed = true;
      this.scheduler.destroy();
      this.resizeObserver?.disconnect();
      this.resizeObserver = undefined;
      this.teardownViewport?.();
      if (this.transitionFrame !== 0) {
        cancelAnimationFrame(this.transitionFrame);
        this.transitionFrame = 0;
      }
      for (const [animation, clone] of [...this.leaving]) {
        animation.cancel();
        clone.remove();
      }
      this.leaving.clear();
      this.transitionQueue.length = 0;
      this.records.clear();
      this.stamps.clear();
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
    this.signature = 0;
    this.runLayout();
  }

  /** Discard cached measurements, re-read every item, and lay out again. */
  remeasure(): void {
    // One batched read pass; no writes are interleaved, so this costs a single
    // reflow rather than one per item.
    for (const record of this.records.values()) {
      record.height = record.handle.element.offsetHeight;
      record.measured = true;
    }
    this.layout();
  }

  // ---------------------------------------------------------------------------
  // Registration — called by the item and stamp directives
  // ---------------------------------------------------------------------------

  addItem(item: MasonryItemHandle): void {
    if (this.records.has(item.element)) return;
    this.widthsDirty = true;
    this.records.set(item.element, {
      handle: item,
      height: 0,
      measured: false,
      placed: false,
      transitioned: false,
      lastWidth: -1,
      lastX: Number.NaN,
      lastY: Number.NaN,
      lastIntrinsicWidth: -1,
      lastIntrinsicHeight: -1,
    });
    this.resizeObserver?.observe(item.element, { box: 'border-box' });
    this.requestLayout();
  }

  removeItem(item: MasonryItemHandle): void {
    const record = this.records.get(item.element);
    if (!record) return;
    this.records.delete(item.element);
    this.resizeObserver?.unobserve(item.element);
    this.widthsDirty = true;

    // An item that was never placed has nothing on screen to animate away.
    if (!record.placed || !this.animateExit(record)) this.removedSinceEmit++;
    this.requestLayout();
  }

  setSizer(element: HTMLElement): void {
    if (this.sizer === element) return;
    if (this.sizer) this.resizeObserver?.unobserve(this.sizer);
    this.sizer = element;
    this.sizerWidth = element.offsetWidth;
    this.resizeObserver?.observe(element, { box: 'content-box' });
    this.signature = 0;
    this.requestLayout();
  }

  clearSizer(element: HTMLElement): void {
    if (this.sizer !== element) return;
    this.resizeObserver?.unobserve(element);
    this.sizer = undefined;
    this.sizerWidth = 0;
    this.signature = 0;
    this.requestLayout();
  }

  /** @internal Part of the host contract; see `MasonryGridHost`. */
  invalidateItemGeometry(): void {
    this.widthsDirty = true;
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
    const count = this.records.size;
    this.zone.run(() => this.itemsLoaded.emit(count));
  }

  /**
   * Play the exit effect for a removed item, reporting whether it started.
   *
   * Angular detaches the real element as soon as the item directive is
   * destroyed, so there is nothing left to animate by the time this runs. A
   * static clone, parked at the item's last position by the inline styles it
   * inherits, stands in for it and is discarded when the effect ends.
   */
  private animateExit(record: ItemRecord): boolean {
    const config = this.options().exitAnimation;
    const source = record.handle.element;
    if (
      config === false ||
      config.duration === 0 ||
      !this.initialized ||
      this.destroyed ||
      typeof Element === 'undefined' ||
      typeof Element.prototype.animate !== 'function'
    ) {
      return false;
    }

    // Angular detaches the element before it runs destroy hooks, so `source` is
    // already out of the document by now. Cloning still works, and the clone
    // carries the inline position, width and transform the grid wrote — which
    // is exactly what makes it land where the item was.
    const clone = source.cloneNode(true) as HTMLElement;
    clone.classList.add('masonry-item--leaving');
    clone.setAttribute('aria-hidden', 'true');
    // The clone is scenery: it must not take pointer input, and it must not
    // inherit the position transition that would fight its own keyframes.
    clone.style.pointerEvents = 'none';
    clone.style.transition = '';
    this.element.appendChild(clone);

    const animation = clone.animate(config.keyframes as Keyframe[], {
      duration: config.duration,
      easing: config.easing,
      fill: 'forwards',
    });
    this.leaving.set(animation, clone);

    const settle = (): void => {
      if (!this.leaving.delete(animation)) return;
      clone.remove();
      if (this.destroyed) return;
      this.removedSinceEmit++;
      if (this.leaving.size === 0) this.emitRemoveComplete();
    };
    animation.addEventListener('finish', settle);
    animation.addEventListener('cancel', settle);
    return true;
  }

  private emitRemoveComplete(): void {
    const removed = this.removedSinceEmit;
    if (removed === 0 || this.destroyed) return;
    this.removedSinceEmit = 0;
    this.zone.run(() => this.removeComplete.emit({ removed }));
  }

  addStamp(element: HTMLElement): void {
    if (this.stamps.has(element)) return;
    this.stamps.add(element);
    this.resizeObserver?.observe(element, { box: 'border-box' });
    this.requestLayout();
  }

  removeStamp(element: HTMLElement): void {
    if (!this.stamps.delete(element)) return;
    this.resizeObserver?.unobserve(element);
    this.requestLayout();
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private initialize(): void {
    this.initialized = true;
    this.viewportWidth = window.innerWidth;

    // Everything below is plumbing that must never schedule change detection.
    this.zone.runOutsideAngular(() => {
      // One observer for the container and every item. A single observer with
      // many targets is markedly cheaper than one observer per item, and its
      // entries carry sizes the browser has already computed — reading them
      // costs no forced reflow.
      this.resizeObserver = new ResizeObserver((entries) => this.onResize(entries));
      this.syncWidthSource(this.options());
      for (const element of this.records.keys()) {
        this.resizeObserver.observe(element, { box: 'border-box' });
      }
      for (const element of this.stamps) {
        this.resizeObserver.observe(element, { box: 'border-box' });
      }
      if (this.sizer) this.resizeObserver.observe(this.sizer, { box: 'content-box' });

      if (this.options().breakpointBasis === 'viewport') {
        const onViewportResize = () => {
          this.viewportWidth = window.innerWidth;
          this.scheduler.schedule(this.options().resizeDebounce);
        };
        window.addEventListener('resize', onViewportResize, { passive: true });
        this.teardownViewport = () => window.removeEventListener('resize', onViewportResize);
      }
    });

    // `autoLayout: false` holds the grid on its pre-layout rendering until the
    // application calls `layout()` itself.
    if (this.options().autoLayout) this.scheduler.schedule();
    else this.layoutBlocked = true;
  }

  /**
   * `fitWidth` shrinks the host to the occupied width, so measuring the host
   * would feed our own write back in as the next pass's input. Observe the
   * parent instead and the loop cannot form.
   */
  private syncWidthSource(options: ResolvedMasonryGridOptions): void {
    const desired = (options.fitWidth ? this.element.parentElement : this.element) ?? this.element;
    if (desired === this.widthSource) return;

    if (this.widthSource) this.resizeObserver?.unobserve(this.widthSource);
    this.widthSource = desired;
    this.containerWidth = desired.clientWidth;
    this.resizeObserver?.observe(desired, { box: 'content-box' });
  }

  private onResize(entries: readonly ResizeObserverEntry[]): void {
    let containerChanged = false;
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      if (target === this.widthSource) {
        if (!this.options().observeResize) continue;
        this.containerWidth = contentWidthOf(entry);
        containerChanged = true;
        continue;
      }
      if (target === this.sizer) {
        this.sizerWidth = contentWidthOf(entry);
        containerChanged = true;
        continue;
      }
      const record = this.records.get(target);
      if (record) {
        record.height = blockSizeOf(entry);
        record.measured = true;
      }
    }
    // Only container resizes are debounced; item measurements must land on the
    // very next frame or newly added content would visibly lag.
    this.scheduler.schedule(containerChanged ? this.options().resizeDebounce : 0);
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private runLayout(): void {
    if (!this.initialized || this.layoutBlocked) return;

    const started = performance.now();
    const options = this.options();
    this.syncWidthSource(options);

    // ---- Read phase -------------------------------------------------------
    // Item heights and the container width already arrived through the
    // ResizeObserver, so the only DOM reads here are the child list and, when
    // stamps are present, their offsets. Nothing is written until reads finish.
    this.collectOrdered();
    this.collectStampBoxes();

    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      if (
        this.sizer &&
        (options.columns !== undefined || options.columnWidth !== undefined) &&
        !this.warnedSizerConflict
      ) {
        this.warnedSizerConflict = true;
        console.warn(
          '[masonry-angular] A `masonryGridSizer` element takes precedence over the `columns` and ' +
            '`columnWidth` options, which are being ignored. Remove one or the other.',
        );
      }
      if (
        options.verticalOrigin === 'bottom' &&
        this.stampBoxes.length > 0 &&
        !this.warnedBottomStamp
      ) {
        this.warnedBottomStamp = true;
        console.warn(
          "[masonry-angular] `verticalOrigin: 'bottom'` does not support stamps. Stamps are " +
            'resolved against the top edge and then mirrored with the rest of the layout, so items ' +
            'will flow around the wrong region. Use one or the other.',
        );
      }
    }

    const basisWidth =
      options.breakpointBasis === 'viewport' ? this.viewportWidth : this.containerWidth;
    const sizerWidth = this.sizer ? this.sizerWidth : undefined;
    const geometry = resolveColumnGeometry(this.containerWidth, basisWidth, options, sizerWidth);

    // ---- Write phase ------------------------------------------------------
    // Widths go out first and unconditionally: an item cannot report its real
    // height until it has been given its column width, so this write is what
    // unblocks the measurement that the next pass consumes.
    this.writeWidths(geometry, options);

    if (this.records.size > 0 && this.ordered.length === 0) {
      // Items exist but none have been measured yet. Stay on the fallback
      // rendering rather than flashing an empty grid.
      return;
    }

    this.fillMeasured();
    const signature = this.computeSignature(geometry, options);
    if (signature === this.signature) return;
    this.signature = signature;

    const solution = this.engine.solve({
      items: this.measured,
      stamps: this.stampBoxes,
      columns: geometry.columns,
      columnWidth: geometry.columnWidth,
      gutterX: options.gutterX,
      gutterY: options.gutterY,
      containerWidth: this.containerWidth,
      horizontalOrder: options.horizontalOrder,
      rtl: options.direction === 'rtl',
      originBottom: options.verticalOrigin === 'bottom',
    });

    this.entering.length = 0;
    const { positions } = solution;

    // Leaving the multi-column fallback has to happen in this same synchronous
    // write, not via a change-detected host class: a frame in which items are
    // transformed but still in normal flow reads as a visible jump.
    if (this.pass === 0) this.element.classList.remove('masonry-grid--fallback');

    for (let i = 0; i < this.ordered.length; i++) {
      const record = this.ordered[i]!;
      const x = positions[i * 2]!;
      const y = positions[i * 2 + 1]!;

      if (record.lastX !== x || record.lastY !== y) {
        record.lastX = x;
        record.lastY = y;
        // A transform keeps repositioning off the layout and paint path — the
        // browser only has to update the compositor. 2D `translate` is used
        // rather than `translate3d` so a very long grid does not promote every
        // item to its own GPU layer.
        record.handle.element.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      }

      if (!record.placed) this.promote(record);
    }

    const style = this.element.style;
    if (options.resizeContainer) style.height = `${solution.contentHeight}px`;
    style.setProperty('--masonry-column-width', `${geometry.columnWidth}px`);
    style.setProperty('--masonry-columns', `${geometry.columns}`);
    if (options.fitWidth) style.width = `${solution.contentWidth}px`;

    this.finishPass(geometry, solution.contentHeight, solution.contentWidth, options, started);
  }

  /**
   * Move an item out of the pre-layout flow rendering and into absolute
   * positioning, then queue it for its entry animation.
   */
  private promote(record: ItemRecord): void {
    record.placed = true;
    const style = record.handle.element.style;
    style.position = 'absolute';
    style.top = '0';
    style.left = '0';
    style.margin = '0';
    // Clear the multi-column fallback styling the item directive applied.
    style.breakInside = '';
    style.visibility = 'visible';
    this.entering.push(record);
  }

  /** Undo `promote`, returning an ignored item to normal flow. */
  private demote(record: ItemRecord): void {
    record.placed = false;
    record.transitioned = false;
    record.lastWidth = -1;
    record.lastX = Number.NaN;
    record.lastY = Number.NaN;
    const style = record.handle.element.style;
    style.position = '';
    style.top = '';
    style.left = '';
    style.margin = '';
    style.width = '';
    style.transform = '';
    style.transition = '';
    style.contentVisibility = '';
    style.containIntrinsicSize = '';
    record.lastIntrinsicWidth = -1;
    record.lastIntrinsicHeight = -1;
  }

  private writeWidths(geometry: ResolvedColumnGeometry, options: ResolvedMasonryGridOptions): void {
    const { columns, columnWidth } = geometry;

    // Widths only change when the geometry moves or an item is added, removed
    // or respanned, so an otherwise unchanged pass can skip this walk entirely.
    // `contentVisibility` is the exception: it republishes each item's measured
    // height, which changes far more often than the geometry does.
    const geometryUnchanged =
      columns === this.widthsColumns &&
      columnWidth === this.widthsColumnWidth &&
      options.gutterX === this.widthsGutterX;
    if (geometryUnchanged && !this.widthsDirty && !options.contentVisibility) return;

    this.widthsColumns = columns;
    this.widthsColumnWidth = columnWidth;
    this.widthsGutterX = options.gutterX;
    this.widthsDirty = false;

    for (const record of this.records.values()) {
      if (record.handle.ignored()) continue;
      const span = Math.min(columns, Math.max(1, Math.round(record.handle.colSpan()) || 1));
      const width = span * columnWidth + (span - 1) * options.gutterX;
      const style = record.handle.element.style;

      if (record.lastWidth !== width) {
        record.lastWidth = width;
        style.width = `${width}px`;
      }

      // Intrinsic size is deliberately *not* guarded by the width check above.
      // It encodes the measured height, which changes far more often than the
      // width does — an item whose content grows keeps its column width — and a
      // stale value makes the browser mis-report the height of everything it
      // has skipped, so the scrollbar jumps as those items scroll into view.
      if (options.contentVisibility) {
        if (
          record.height > 0 &&
          (record.lastIntrinsicWidth !== width || record.lastIntrinsicHeight !== record.height)
        ) {
          record.lastIntrinsicWidth = width;
          record.lastIntrinsicHeight = record.height;
          style.contentVisibility = 'auto';
          // Feeding the measured box back as the intrinsic size lets the browser
          // skip rendering off-screen items without collapsing the layout.
          style.containIntrinsicSize = `${width}px ${record.height}px`;
        }
      } else if (record.lastIntrinsicWidth !== -1) {
        // The option was turned off after we had already opted this item in.
        record.lastIntrinsicWidth = -1;
        record.lastIntrinsicHeight = -1;
        style.contentVisibility = '';
        style.containIntrinsicSize = '';
      }
    }
  }

  /**
   * Rebuild the layout order from the container's child list.
   *
   * Deriving order from the DOM rather than from registration order is what
   * keeps items in source order through insertions, removals and `@for`
   * reorderings — the class of bug that forces other masonry wrappers to expose
   * a manual `reloadItems()`.
   */
  private collectOrdered(): void {
    this.ordered.length = 0;
    const children = this.element.children;
    for (let i = 0; i < children.length; i++) {
      const record = this.records.get(children[i] as HTMLElement);
      if (!record) continue;
      if (record.handle.ignored()) {
        // Opted out: hand the element back to normal flow if we had taken it.
        if (record.placed) this.demote(record);
        continue;
      }
      // Items that are unmeasured, or still decoding images, sit this pass out.
      // They keep their DOM slot and drop into place once ready.
      if (record.measured && record.handle.measurable()) this.ordered.push(record);
    }
  }

  private collectStampBoxes(): void {
    this.stampBoxes.length = 0;
    if (this.stamps.size === 0) return;
    for (const element of this.stamps) {
      this.stampBoxes.push({
        x: element.offsetLeft,
        y: element.offsetTop,
        width: element.offsetWidth,
        height: element.offsetHeight,
      });
    }
  }

  /** Refresh the measurement slots in place, reusing the objects from last pass. */
  private fillMeasured(): void {
    const count = this.ordered.length;
    for (let i = 0; i < count; i++) {
      const record = this.ordered[i]!;
      const slot = (this.measured[i] ??= { height: 0, colSpan: 1 });
      slot.height = record.height;
      slot.colSpan = record.handle.colSpan();
    }
    this.measured.length = count;
  }

  /**
   * Fold every layout input into one integer. An unchanged signature means an
   * unchanged result, which lets repeated observer callbacks — the common case
   * during a resize drag — skip the solve and the DOM writes entirely.
   */
  private computeSignature(
    geometry: ResolvedColumnGeometry,
    options: ResolvedMasonryGridOptions,
  ): number {
    let hash = 17;
    hash = (hash * 31 + geometry.columns) | 0;
    hash = (hash * 31 + Math.round(geometry.columnWidth * HASH_PRECISION)) | 0;
    // Every input to `solve()` has to be folded in, including the ones that
    // usually only reach it through the geometry. The container width is not
    // redundant: an RTL pass anchors items to the right edge, so with a fixed
    // `columnWidth` the container can resize — moving every item — while the
    // column count and column width stay exactly the same.
    hash = (hash * 31 + Math.round(this.containerWidth * HASH_PRECISION)) | 0;
    hash = (hash * 31 + Math.round(this.sizerWidth * HASH_PRECISION)) | 0;
    hash = (hash * 31 + Math.round(options.gutterX * HASH_PRECISION)) | 0;
    hash = (hash * 31 + Math.round(options.gutterY * HASH_PRECISION)) | 0;
    hash = (hash * 31 + (options.horizontalOrder ? 1 : 0)) | 0;
    hash = (hash * 31 + (options.direction === 'rtl' ? 1 : 0)) | 0;
    hash = (hash * 31 + (options.verticalOrigin === 'bottom' ? 1 : 0)) | 0;
    hash = (hash * 31 + this.measured.length) | 0;
    for (const slot of this.measured) {
      hash = (hash * 31 + Math.round(slot.height * HASH_PRECISION)) | 0;
      hash = (hash * 31 + slot.colSpan) | 0;
    }
    for (const stamp of this.stampBoxes) {
      hash =
        (hash * 31 +
          Math.round((stamp.x + stamp.y + stamp.width + stamp.height) * HASH_PRECISION)) |
        0;
    }
    // Never collide with the sentinel that `layout()` uses to force a pass.
    return hash === 0 ? 1 : hash;
  }

  private finishPass(
    geometry: ResolvedColumnGeometry,
    height: number,
    width: number,
    options: ResolvedMasonryGridOptions,
    started: number,
  ): void {
    const isFirstPass = this.pass === 0;
    this.pass++;

    if (this.entering.length > 0) {
      this.animateEntry(options, isFirstPass);
      this.enableTransitionsNextFrame(options);
    }

    const itemCount = this.ordered.length;
    const durationMs = performance.now() - started;

    // Signals first: updating them is what notifies a zoneless application.
    this.columns.set(geometry.columns);
    this.columnWidth.set(geometry.columnWidth);
    this.contentHeight.set(height);
    this.itemCount.set(itemCount);
    this.ready.set(true);

    // Removals that had no exit effect to wait for are reported here, once the
    // pass that closed their gap has actually run.
    if (this.leaving.size === 0) this.emitRemoveComplete();

    // `run` is a no-op under zoneless change detection and the correct bridge
    // back into Angular for zone-based applications.
    this.zone.run(() => {
      this.layoutComplete.emit({
        columns: geometry.columns,
        columnWidth: geometry.columnWidth,
        itemCount,
        height,
        width: options.fitWidth ? width : this.containerWidth,
        durationMs,
        pass: this.pass,
      });
    });
  }

  private animateEntry(options: ResolvedMasonryGridOptions, isFirstPass: boolean): void {
    const config = options.entryAnimation;
    if (config === false || config.duration === 0) return;
    if (isFirstPass && !config.animateInitial) return;
    if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return;

    for (let i = 0; i < this.entering.length; i++) {
      const delay = Math.min(i * config.stagger, config.maxStagger);
      // `fill: 'backwards'` holds the first keyframe through the stagger delay
      // and then releases every property, so nothing the animation touched
      // lingers to override later layout writes.
      this.entering[i]!.handle.element.animate(config.keyframes as Keyframe[], {
        duration: config.duration,
        easing: config.easing,
        delay,
        fill: 'backwards',
      });
    }
  }

  /**
   * Enable the position transition one frame *after* an item's first placement,
   * so it appears at its target position instead of sliding in from the origin.
   */
  private enableTransitionsNextFrame(options: ResolvedMasonryGridOptions): void {
    const { duration, easing } = options.transition;
    if (duration === 0) return;

    for (const record of this.entering) this.transitionQueue.push(record);
    if (this.transitionFrame !== 0) return;

    this.transitionFrame = requestAnimationFrame(() => {
      this.transitionFrame = 0;
      // Transform only: transitioning `width` would relayout every item on
      // every frame of a resize.
      const value = `transform ${duration}ms ${easing}`;
      for (const record of this.transitionQueue) {
        if (record.transitioned) continue;
        record.transitioned = true;
        record.handle.element.style.transition = value;
      }
      this.transitionQueue.length = 0;
    });
  }
}

/** Content-box width from an observer entry, without touching the DOM. */
function contentWidthOf(entry: ResizeObserverEntry): number {
  const box = entry.contentBoxSize?.[0];
  return box ? box.inlineSize : entry.contentRect.width;
}

/** Border-box height from an observer entry, without touching the DOM. */
function blockSizeOf(entry: ResizeObserverEntry): number {
  const box = entry.borderBoxSize?.[0];
  return box ? box.blockSize : (entry.target as HTMLElement).offsetHeight;
}
