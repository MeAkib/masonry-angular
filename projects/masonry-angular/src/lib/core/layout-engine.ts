/**
 * Pure, DOM-free masonry layout solver.
 *
 * The engine is deliberately isolated from Angular and from the DOM: it takes
 * measured boxes in, and returns coordinates out. That keeps it trivially
 * unit-testable, reusable on the server, and — most importantly — lets the
 * component split every layout pass into a single read phase followed by a
 * single write phase, so we never interleave measurement with mutation and
 * never force a synchronous reflow.
 *
 * All hot-path buffers are reused `Float64Array`s. A steady-state relayout of
 * an unchanged grid allocates nothing.
 */

import type {
  MasonryLayoutRequest,
  MasonryLayoutSolution,
  MasonryStampBox,
} from '../models/layout';

/** Tolerance used when comparing column heights, to keep ties deterministic. */
const EPSILON = 0.001;

/**
 * Reusable coordinate buffer. Pinned to `ArrayBuffer` rather than the default
 * `ArrayBufferLike`, so growing a buffer stays assignable to the field.
 */
type Buffer = Float64Array<ArrayBuffer>;

function grow(buffer: Buffer, needed: number): Buffer {
  return buffer.length >= needed ? buffer : new Float64Array(Math.max(needed, buffer.length * 2));
}

export class MasonryLayoutEngine {
  private positions: Buffer = new Float64Array(0);
  private widths: Buffer = new Float64Array(0);
  private columnHeights: Buffer = new Float64Array(0);

  solve(request: MasonryLayoutRequest): MasonryLayoutSolution {
    const { items, stamps, gutterX, gutterY, columnWidth, containerWidth, rtl } = request;
    const columns = Math.max(1, Math.floor(request.columns));
    const count = items.length;

    this.positions = grow(this.positions, count * 2);
    this.widths = grow(this.widths, count);
    this.columnHeights = grow(this.columnHeights, columns);

    const positions = this.positions;
    const widths = this.widths;
    const colYs = this.columnHeights;
    colYs.fill(0, 0, columns);

    /** Distance from one column's left edge to the next. */
    const stride = columnWidth + gutterX;
    /** Right edge used to anchor RTL layouts. */
    const rightEdge = Math.max(containerWidth, columns * stride - gutterX);

    for (const stamp of stamps) {
      this.applyStamp(colYs, stamp, columns, stride, gutterY, rightEdge, rtl);
    }

    let contentHeight = 0;
    let horizontalIndex = 0;

    for (let i = 0; i < count; i++) {
      const item = items[i]!;
      const span = Math.min(columns, Math.max(1, Math.round(item.colSpan) || 1));
      const width = span * columnWidth + (span - 1) * gutterX;

      let column: number;
      if (request.horizontalOrder) {
        column = horizontalIndex % columns;
        // An item that would overflow the current row starts a new one.
        if (column + span > columns) column = 0;
        horizontalIndex = column + span;
      } else {
        column = this.shortestColumn(colYs, columns, span);
      }

      const y = this.spanTop(colYs, column, span);
      positions[i * 2] = rtl ? rightEdge - width - column * stride : column * stride;
      positions[i * 2 + 1] = y;
      widths[i] = width;

      const bottom = y + item.height;
      // Store the *next free* offset so the gutter is baked into the column
      // height and never trails at the bottom of the grid.
      const next = bottom + gutterY;
      for (let c = column, end = column + span; c < end; c++) colYs[c] = next;
      if (bottom > contentHeight) contentHeight = bottom;
    }

    if (request.originBottom) {
      // Reflect each item about the content box: an item that sat `y` from the
      // top, `height` tall, sits `contentHeight - y - height` from the top once
      // the grid grows upward instead of downward.
      for (let i = 0; i < count; i++) {
        positions[i * 2 + 1] = contentHeight - positions[i * 2 + 1]! - items[i]!.height;
      }
    }

    return {
      positions,
      widths,
      contentHeight,
      contentWidth: this.occupiedWidth(colYs, columns, stride, gutterX),
      columnHeights: colYs,
    };
  }

  /** Index of the column group of `span` columns with the lowest top offset. */
  private shortestColumn(colYs: Buffer, columns: number, span: number): number {
    let bestColumn = 0;
    let bestY = Number.POSITIVE_INFINITY;
    for (let c = 0, last = columns - span; c <= last; c++) {
      const y = this.spanTop(colYs, c, span);
      // Strict improvement only, so equal columns resolve left-to-right.
      if (y < bestY - EPSILON) {
        bestY = y;
        bestColumn = c;
      }
    }
    return bestColumn;
  }

  /** The lowest offset an item can sit at while covering `span` columns. */
  private spanTop(colYs: Buffer, column: number, span: number): number {
    let y = colYs[column]!;
    for (let k = 1; k < span; k++) {
      const candidate = colYs[column + k]!;
      if (candidate > y) y = candidate;
    }
    return y;
  }

  private applyStamp(
    colYs: Buffer,
    stamp: MasonryStampBox,
    columns: number,
    stride: number,
    gutterY: number,
    rightEdge: number,
    rtl: boolean,
  ): void {
    if (stamp.width <= 0 || stamp.height <= 0) return;
    const left = rtl ? rightEdge - (stamp.x + stamp.width) : stamp.x;
    const first = Math.min(columns - 1, Math.max(0, Math.floor(left / stride)));
    // Nudge the right edge inwards so a stamp ending exactly on a column
    // boundary does not claim the following column.
    const last = Math.min(
      columns - 1,
      Math.max(first, Math.floor((left + stamp.width - EPSILON) / stride)),
    );
    const bottom = stamp.y + stamp.height + gutterY;
    for (let c = first; c <= last; c++) {
      if (bottom > colYs[c]!) colYs[c] = bottom;
    }
  }

  /** Width spanned by the columns that actually received content. */
  private occupiedWidth(colYs: Buffer, columns: number, stride: number, gutterX: number): number {
    let used = 0;
    for (let c = columns - 1; c >= 0; c--) {
      if (colYs[c] !== 0) {
        used = c + 1;
        break;
      }
    }
    return used === 0 ? 0 : used * stride - gutterX;
  }
}
