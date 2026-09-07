/** Everything the grid reads from a registered item, resolved at layout time. */
export interface MasonryItemHandle {
  readonly element: HTMLElement;
  /** Number of columns the item spans. */
  readonly colSpan: () => number;
  /**
   * Whether the item can be positioned yet. Items still decoding images report
   * `false` and are held back — they keep their DOM position and slide into
   * place once ready, so source order is never lost.
   */
  readonly measurable: () => boolean;
  /**
   * Whether the item opts out of layout entirely. An ignored item is returned
   * to normal flow and takes no part in a pass — the equivalent of outlayer's
   * `ignore()`, but declarative and reversible.
   */
  readonly ignored: () => boolean;
}

/** @internal Per-item bookkeeping owned by the grid. */
export interface ItemRecord {
  readonly handle: MasonryItemHandle;
  /** Latest border-box height, fed by the shared `ResizeObserver`. */
  height: number;
  /** Set once the observer has reported a size at least once. */
  measured: boolean;
  /** Whether the item has been positioned and revealed. */
  placed: boolean;
  /** Whether the position transition has been enabled on this element. */
  transitioned: boolean;
  /** Last values written to the DOM, so unchanged passes write nothing. */
  lastWidth: number;
  lastX: number;
  lastY: number;
  /**
   * Last size published as `contain-intrinsic-size`. Tracked separately from
   * `lastWidth` because it depends on the measured height too, and `-1` means
   * nothing has been written yet.
   */
  lastIntrinsicWidth: number;
  lastIntrinsicHeight: number;
}

/** @internal Mutable mirror of `MasonryMeasuredItem`, reused across passes. */
export interface MeasuredSlot {
  height: number;
  colSpan: number;
}
