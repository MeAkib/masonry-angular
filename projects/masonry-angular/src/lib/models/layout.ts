/**
 * The solver's input and output shapes.
 *
 * Nothing here references Angular or the DOM: the layout engine takes measured
 * boxes in and returns coordinates out, which is what makes it reusable from a
 * worker, a test, or another framework's renderer.
 */

/** A single measured grid item. Only the height and span affect placement. */
export interface MasonryMeasuredItem {
  /** Outer (border-box) height in CSS pixels. */
  readonly height: number;
  /** How many columns the item occupies. Clamped to `[1, columns]`. */
  readonly colSpan: number;
}

/** A fixed region that items must flow around, in container content-box space. */
export interface MasonryStampBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MasonryLayoutRequest {
  readonly items: readonly MasonryMeasuredItem[];
  readonly stamps: readonly MasonryStampBox[];
  /** Number of columns. Always `>= 1`. */
  readonly columns: number;
  /** Width of a single column in CSS pixels. */
  readonly columnWidth: number;
  /** Horizontal gap between columns. */
  readonly gutterX: number;
  /** Vertical gap between stacked items. */
  readonly gutterY: number;
  /** Content-box width of the container, used for right-anchoring in RTL. */
  readonly containerWidth: number;
  /** Fill row-by-row instead of always choosing the shortest column. */
  readonly horizontalOrder: boolean;
  /** Lay out from the right edge. */
  readonly rtl: boolean;
  /**
   * Stack upward from the bottom edge instead of downward from the top.
   *
   * The solve itself is unchanged — the same column choices produce the same
   * shape — and the finished coordinates are mirrored about `contentHeight`.
   * Mirroring after the fact is exact rather than approximate: reflecting a
   * packing produces the packing you would get by filling from the other edge.
   */
  readonly originBottom: boolean;
}

export interface MasonryLayoutSolution {
  /**
   * Flat `[x0, y0, x1, y1, ...]` coordinate pairs, one per item, in the same
   * order as `request.items`. Valid for `items.length * 2` entries; the backing
   * buffer may be longer and is reused between passes.
   */
  readonly positions: Float64Array;
  /** Per-item resolved width in CSS pixels. Valid for `items.length` entries. */
  readonly widths: Float64Array;
  /** Total height of the laid-out content, excluding any trailing gutter. */
  readonly contentHeight: number;
  /** Width actually occupied by non-empty columns — used by `fitWidth`. */
  readonly contentWidth: number;
  /** Resolved column heights after the pass. Length equals `columns`. */
  readonly columnHeights: Float64Array;
}
