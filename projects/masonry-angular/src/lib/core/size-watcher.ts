/**
 * How big everything is.
 *
 * Every measurement the grid uses comes from here, and all of it from a single
 * `ResizeObserver` watching the container, the items, the stamps and the sizer
 * at once. One observer with many targets is much cheaper than one observer per
 * item, and — the part that really matters — the sizes it hands us have already
 * been computed by the browser. Reading them costs nothing.
 *
 * That is the difference between this and asking each element for its
 * `offsetHeight`. A single `offsetHeight` read after a style write forces the
 * browser to stop and re-run layout on the spot ("layout thrashing"), and doing
 * that once per item is the classic way to make a grid of a few hundred items
 * janky. Here the browser volunteers the numbers and we never ask.
 */

import type { ResolvedMasonryGridOptions } from '../models';

/** Content-box width from an observer entry, without touching the DOM. */
export function contentWidthOf(entry: ResizeObserverEntry): number {
  const box = entry.contentBoxSize?.[0];
  return box ? box.inlineSize : entry.contentRect.width;
}

/** Border-box height from an observer entry, without touching the DOM. */
export function blockSizeOf(entry: ResizeObserverEntry): number {
  const box = entry.borderBoxSize?.[0];
  return box ? box.blockSize : (entry.target as HTMLElement).offsetHeight;
}

/**
 * What the watcher needs back from the grid.
 *
 * Kept as a small interface so this file never imports the component: it can be
 * read, and tested, without knowing anything about Angular.
 */
export interface SizeWatcherHost {
  /** The options in effect right now. Read fresh each time — they can change. */
  options(): ResolvedMasonryGridOptions;
  /** A new measured height arrived for this item element. */
  setItemHeight(element: HTMLElement, height: number): void;
  /**
   * Something moved; please schedule a pass.
   *
   * @param geometryChanged `true` when the container or the sizer resized, which
   *   may change the column count. Those are debounced by `resizeDebounce`.
   *   Item heights are not: they must land on the very next frame, or newly
   *   added content visibly lags behind.
   */
  onChange(geometryChanged: boolean): void;
}

export class SizeWatcher {
  private observer: ResizeObserver | undefined;
  private stopViewportListener: (() => void) | undefined;

  /**
   * The element whose width decides the column geometry — usually the container
   * itself. See `syncWidthSource` for the one exception.
   */
  private widthSource: HTMLElement | undefined;
  /** Tracked by identity so `onResize` can tell the sizer from an item. */
  private sizerElement: HTMLElement | undefined;

  /**
   * The three measurements the rest of the library reads. Written only by this
   * class; treat them as read-only from anywhere else.
   */
  containerWidth = 0;
  /** Window width, used when `breakpointBasis` is `'viewport'`. */
  viewportWidth = 0;
  /** Width of the `masonryGridSizer` element, or `0` if there is none. */
  sizerWidth = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: SizeWatcherHost,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Begin observing.
   *
   * Call this from inside `NgZone.runOutsideAngular`. An observer callback that
   * ran inside the zone would trigger change detection on every frame of a
   * resize, which is exactly the cost this class exists to avoid.
   */
  start(): void {
    if (this.observer) return;
    this.viewportWidth = window.innerWidth;
    this.observer = new ResizeObserver((entries) => this.onResize(entries));

    if (this.host.options().breakpointBasis === 'viewport') {
      const listener = (): void => {
        this.viewportWidth = window.innerWidth;
        this.host.onChange(true);
      };
      window.addEventListener('resize', listener, { passive: true });
      this.stopViewportListener = () => window.removeEventListener('resize', listener);
    }
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.stopViewportListener?.();
    this.stopViewportListener = undefined;
    this.widthSource = undefined;
    this.sizerElement = undefined;
  }

  // ---------------------------------------------------------------------------
  // Choosing what to watch
  // ---------------------------------------------------------------------------

  /** Watch an item's border-box, which is the height the solver stacks. */
  watchItem(element: HTMLElement): void {
    this.observer?.observe(element, { box: 'border-box' });
  }

  /** Watch a stamp's border-box, the region items must flow around. */
  watchStamp(element: HTMLElement): void {
    this.observer?.observe(element, { box: 'border-box' });
  }

  /** Watch the sizer's content-box, whose width *is* the column width. */
  watchSizer(element: HTMLElement): void {
    this.sizerElement = element;
    this.sizerWidth = element.offsetWidth;
    this.observer?.observe(element, { box: 'content-box' });
  }

  /** Stop watching one element, whatever kind it was. */
  unwatch(element: HTMLElement): void {
    this.observer?.unobserve(element);
    if (element === this.sizerElement) {
      this.sizerElement = undefined;
      this.sizerWidth = 0;
    }
    if (element === this.widthSource) this.widthSource = undefined;
  }

  /**
   * Point the width measurement at the right element.
   *
   * Normally that is the container. But `fitWidth` makes the grid shrink itself
   * to the width its columns actually occupy — so measuring the container would
   * mean measuring our own last write, which would change the geometry, which
   * would change the write, and so on forever. Watching the *parent* instead
   * breaks the loop, because nothing the grid does can change the parent.
   */
  syncWidthSource(options: ResolvedMasonryGridOptions): void {
    const wanted = (options.fitWidth ? this.element.parentElement : this.element) ?? this.element;
    if (wanted === this.widthSource) return;

    if (this.widthSource) this.observer?.unobserve(this.widthSource);
    this.widthSource = wanted;
    this.containerWidth = wanted.clientWidth;
    this.observer?.observe(wanted, { box: 'content-box' });
  }

  /**
   * Watch the container and nothing else. Used only by native layout.
   *
   * The browser is doing the work in that case, so no item is ever measured.
   * The one thing still worth knowing is the container width, and only when the
   * column count comes from a breakpoint map.
   */
  watchContainerOnly(): void {
    this.widthSource = this.element;
    this.containerWidth = this.element.clientWidth;
    this.observer?.observe(this.element, { box: 'content-box' });
  }

  // ---------------------------------------------------------------------------
  // Receiving measurements
  // ---------------------------------------------------------------------------

  private onResize(entries: readonly ResizeObserverEntry[]): void {
    let geometryChanged = false;

    for (const entry of entries) {
      const target = entry.target as HTMLElement;

      if (target === this.widthSource) {
        // `observeResize: false` pins the layout to the width it first saw.
        if (!this.host.options().observeResize) continue;
        this.containerWidth = contentWidthOf(entry);
        geometryChanged = true;
      } else if (target === this.sizerElement) {
        this.sizerWidth = contentWidthOf(entry);
        geometryChanged = true;
      } else {
        this.host.setItemHeight(target, blockSizeOf(entry));
      }
    }

    this.host.onChange(geometryChanged);
  }
}
