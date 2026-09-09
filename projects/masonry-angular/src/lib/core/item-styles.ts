/**
 * Every style the grid writes onto an item.
 *
 * Nothing else in the library touches an item's `style`, which makes this the
 * one file to read when an item looks wrong on screen.
 *
 * An item goes through two states:
 *
 * - **in flow** — how it starts, and how it renders on the server. The item sits
 *   in the normal document flow (or in the multi-column fallback), so the page
 *   is readable before any JavaScript has run.
 * - **placed** — `position: absolute` with a `transform` putting it where the
 *   solver said. `promote()` moves an item from the first state to the second;
 *   `demote()` moves it back, which is what `masonryIgnore` uses.
 *
 * Two decisions worth knowing about:
 *
 * **Position is a `transform`, not `top`/`left`.** Changing `top` makes the
 * browser redo layout and paint for that element. Changing a `transform` only
 * asks the compositor to move an already-painted layer, which is far cheaper and
 * is what lets a few thousand items reposition smoothly.
 *
 * **It is 2D `translate()`, not `translate3d()`.** `translate3d` would promote
 * every single item to its own GPU layer. That is a win for five items and a
 * memory problem for five thousand.
 */

import type { ItemRecord, ResolvedColumnGeometry, ResolvedMasonryGridOptions } from '../models';

export class ItemStyles {
  /**
   * The geometry the widths were last written for. If it has not moved and no
   * item was added, removed or re-spanned, `writeWidths` can skip the whole walk.
   */
  private lastColumns = -1;
  private lastColumnWidth = -1;
  private lastGutterX = -1;
  private dirty = true;

  /** Call when an item is added, removed, or changes its span. */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Give every item its width.
   *
   * This runs before the solver, not after, and that ordering is load-bearing:
   * an item cannot report the height it will actually be until it knows how wide
   * it is. So each pass writes widths, the browser re-measures, and the *next*
   * pass positions using those heights. That is why the very first layout takes
   * two passes.
   *
   * @param onWidthChanged Called for each item whose width actually changed, so
   *   the caller can react. Nothing is called for items that were already right.
   */
  writeWidths(
    records: Iterable<ItemRecord>,
    geometry: ResolvedColumnGeometry,
    options: ResolvedMasonryGridOptions,
  ): void {
    const { columns, columnWidth } = geometry;

    const geometryUnchanged =
      columns === this.lastColumns &&
      columnWidth === this.lastColumnWidth &&
      options.gutterX === this.lastGutterX;

    // `contentVisibility` is the exception to the skip: it publishes each item's
    // measured *height*, which changes far more often than the geometry does.
    if (geometryUnchanged && !this.dirty && !options.contentVisibility) return;

    this.lastColumns = columns;
    this.lastColumnWidth = columnWidth;
    this.lastGutterX = options.gutterX;
    this.dirty = false;

    for (const record of records) {
      if (record.handle.ignored()) continue;

      const span = clampSpan(record.handle.colSpan(), columns);
      const width = span * columnWidth + (span - 1) * options.gutterX;
      const style = record.handle.element.style;

      if (record.lastWidth !== width) {
        record.lastWidth = width;
        style.width = `${width}px`;
      }

      if (options.contentVisibility) {
        this.writeIntrinsicSize(record, width, style);
      } else if (record.lastIntrinsicWidth !== -1) {
        // The option was switched off after we had already opted this item in.
        record.lastIntrinsicWidth = -1;
        record.lastIntrinsicHeight = -1;
        style.contentVisibility = '';
        style.containIntrinsicSize = '';
      }
    }
  }

  /**
   * Let the browser skip rendering this item while it is off-screen.
   *
   * `content-visibility: auto` is only safe if the browser is also told roughly
   * how big the skipped element is — otherwise it collapses to nothing and the
   * page height, and the scrollbar, jump around as you scroll. Feeding back the
   * height we just measured is exactly that hint.
   *
   * Deliberately not guarded by the width check above: the hint encodes the
   * height, and an item whose content grows keeps the same column width.
   */
  private writeIntrinsicSize(record: ItemRecord, width: number, style: CSSStyleDeclaration): void {
    if (record.height <= 0) return;
    if (record.lastIntrinsicWidth === width && record.lastIntrinsicHeight === record.height) return;

    record.lastIntrinsicWidth = width;
    record.lastIntrinsicHeight = record.height;
    style.contentVisibility = 'auto';
    style.containIntrinsicSize = `${width}px ${record.height}px`;
  }

  /** Move one item to `(x, y)`, skipping the write if it is already there. */
  writePosition(record: ItemRecord, x: number, y: number): void {
    if (record.lastX === x && record.lastY === y) return;
    record.lastX = x;
    record.lastY = y;
    record.handle.element.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
  }

  /** Take an item out of normal flow so the grid can position it. */
  promote(record: ItemRecord): void {
    record.placed = true;
    const style = record.handle.element.style;
    style.position = 'absolute';
    style.top = '0';
    style.left = '0';
    style.margin = '0';
    // Clear the multi-column fallback styling the item directive applied.
    style.breakInside = '';
    style.visibility = 'visible';
  }

  /** Undo `promote`, handing the element back to normal flow. */
  demote(record: ItemRecord): void {
    record.placed = false;
    record.transitioned = false;
    record.lastWidth = -1;
    record.lastX = Number.NaN;
    record.lastY = Number.NaN;
    record.lastIntrinsicWidth = -1;
    record.lastIntrinsicHeight = -1;

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
  }
}

/** A span is at least one column and never wider than the grid. */
export function clampSpan(span: number, columns: number): number {
  return Math.min(columns, Math.max(1, Math.round(span) || 1));
}
