/**
 * Who is in the grid, and in what order.
 *
 * Three kinds of element can be inside a `<masonry-grid>`, and each directive
 * announces itself here when Angular creates it:
 *
 * - **items** (`masonryGridItem`) get positioned,
 * - **stamps** (`masonryGridStamp`) stay where you put them and items flow around,
 * - the **sizer** (`masonryGridSizer`) is measured to decide the column width.
 *
 * The important idea in this file is `collectOrdered()`. The registry is a
 * `Map`, and a `Map` remembers *insertion* order — the order Angular happened to
 * create the directives in, which is not the order they appear on the page once
 * you prepend an item or reorder a `@for`. So on every pass we walk the
 * container's real child list instead and rebuild the order from the DOM.
 *
 * That is why this library has no `reloadItems()` method. Other masonry
 * wrappers make you call one after changing your list; here the DOM is always
 * the source of truth, so there is nothing to remember to call.
 */

import type { ItemRecord, MasonryItemHandle, MasonryStampBox, MeasuredSlot } from '../models';

/** A fresh record for a newly registered item, with nothing measured yet. */
function newRecord(handle: MasonryItemHandle): ItemRecord {
  return {
    handle,
    height: 0,
    measured: false,
    placed: false,
    transitioned: false,
    lastWidth: -1,
    lastX: Number.NaN,
    lastY: Number.NaN,
    lastIntrinsicWidth: -1,
    lastIntrinsicHeight: -1,
  };
}

export class ItemRegistry {
  private readonly records = new Map<HTMLElement, ItemRecord>();
  private readonly stampElements = new Set<HTMLElement>();
  private sizerElement: HTMLElement | undefined;

  /**
   * Reused between passes rather than reallocated. A grid that re-lays-out
   * sixty times a second should not create sixty new arrays a second.
   */
  private readonly orderedBuffer: ItemRecord[] = [];
  private readonly measuredBuffer: MeasuredSlot[] = [];
  private readonly stampBoxBuffer: MasonryStampBox[] = [];

  constructor(private readonly container: HTMLElement) {}

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------

  /** Registers an item. Returns its record, or `undefined` if already known. */
  addItem(handle: MasonryItemHandle): ItemRecord | undefined {
    if (this.records.has(handle.element)) return undefined;
    const record = newRecord(handle);
    this.records.set(handle.element, record);
    return record;
  }

  /** Unregisters an item. Returns the record it had, if any. */
  removeItem(handle: MasonryItemHandle): ItemRecord | undefined {
    const record = this.records.get(handle.element);
    if (record) this.records.delete(handle.element);
    return record;
  }

  /** Returns `true` if this stamp was not already registered. */
  addStamp(element: HTMLElement): boolean {
    if (this.stampElements.has(element)) return false;
    this.stampElements.add(element);
    return true;
  }

  /** Returns `true` if this stamp was registered and has now been removed. */
  removeStamp(element: HTMLElement): boolean {
    return this.stampElements.delete(element);
  }

  setSizer(element: HTMLElement | undefined): void {
    this.sizerElement = element;
  }

  get sizer(): HTMLElement | undefined {
    return this.sizerElement;
  }

  get stamps(): ReadonlySet<HTMLElement> {
    return this.stampElements;
  }

  get itemCount(): number {
    return this.records.size;
  }

  get hasStamps(): boolean {
    return this.stampElements.size > 0;
  }

  recordFor(element: HTMLElement): ItemRecord | undefined {
    return this.records.get(element);
  }

  /** Every record, in registration order. Used for writes that ignore order. */
  allRecords(): Iterable<ItemRecord> {
    return this.records.values();
  }

  /** Every registered element, in registration order. */
  allElements(): Iterable<HTMLElement> {
    return this.records.keys();
  }

  clear(): void {
    this.records.clear();
    this.stampElements.clear();
    this.sizerElement = undefined;
    this.orderedBuffer.length = 0;
    this.measuredBuffer.length = 0;
    this.stampBoxBuffer.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Reading the grid, once per pass
  // ---------------------------------------------------------------------------

  /** The registered elements in the order they appear on the page. */
  elementsInDomOrder(): readonly HTMLElement[] {
    const result: HTMLElement[] = [];
    const children = this.container.children;
    for (let i = 0; i < children.length; i++) {
      const element = children[i] as HTMLElement;
      if (this.records.has(element)) result.push(element);
    }
    return result;
  }

  /**
   * The items to lay out this pass, in page order.
   *
   * Two kinds of item are left out:
   *
   * - those with `masonryIgnore`, which have opted out entirely. `onIgnored` is
   *   called for any that we had already positioned, so the caller can put them
   *   back into normal flow.
   * - those that have not been measured yet, or are still waiting on an image.
   *   They keep their place in the DOM and drop in on a later pass, so nothing
   *   ever jumps out of source order.
   */
  collectOrdered(onIgnored: (record: ItemRecord) => void): readonly ItemRecord[] {
    const ordered = this.orderedBuffer;
    ordered.length = 0;

    const children = this.container.children;
    for (let i = 0; i < children.length; i++) {
      const record = this.records.get(children[i] as HTMLElement);
      if (!record) continue;

      if (record.handle.ignored()) {
        if (record.placed) onIgnored(record);
        continue;
      }

      if (record.measured && record.handle.measurable()) ordered.push(record);
    }
    return ordered;
  }

  /**
   * The heights and spans of `ordered`, in the shape the solver wants.
   *
   * The slot objects are reused between passes and overwritten in place, which
   * is why the solver is careful never to hold on to one.
   */
  measuredSlots(ordered: readonly ItemRecord[]): readonly MeasuredSlot[] {
    const slots = this.measuredBuffer;
    for (let i = 0; i < ordered.length; i++) {
      const record = ordered[i]!;
      const slot = (slots[i] ??= { height: 0, colSpan: 1 });
      slot.height = record.height;
      slot.colSpan = record.handle.colSpan();
    }
    slots.length = ordered.length;
    return slots;
  }

  /**
   * Where the stamps currently sit, in container coordinates.
   *
   * This is the one place the grid reads geometry straight from the DOM rather
   * than from the `ResizeObserver` — a stamp's *position* matters, not just its
   * size, and an observer never reports position. It happens in the pass's read
   * phase, before any write, so it still costs at most one reflow.
   */
  stampBoxes(): readonly MasonryStampBox[] {
    const boxes = this.stampBoxBuffer;
    boxes.length = 0;
    for (const element of this.stampElements) {
      boxes.push({
        x: element.offsetLeft,
        y: element.offsetTop,
        width: element.offsetWidth,
        height: element.offsetHeight,
      });
    }
    return boxes;
  }
}
