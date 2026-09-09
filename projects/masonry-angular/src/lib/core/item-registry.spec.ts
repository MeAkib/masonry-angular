import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ItemRegistry } from './item-registry';
import type { ItemRecord, MasonryItemHandle } from '../models';

/** A stand-in for the item directive, with all three flags controllable. */
function handleFor(
  element: HTMLElement,
  { colSpan = 1, measurable = true, ignored = false } = {},
): MasonryItemHandle {
  return { element, colSpan: () => colSpan, measurable: () => measurable, ignored: () => ignored };
}

describe('ItemRegistry', () => {
  let container: HTMLElement;
  let registry: ItemRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    registry = new ItemRegistry(container);
  });

  /** Append an element to the container and register it as an item. */
  function addItem(id: string, options?: Parameters<typeof handleFor>[1]): ItemRecord {
    const element = document.createElement('div');
    element.dataset['id'] = id;
    container.appendChild(element);
    return registry.addItem(handleFor(element, options))!;
  }

  function idsOf(records: readonly ItemRecord[]): string[] {
    return records.map((record) => record.handle.element.dataset['id']!);
  }

  describe('membership', () => {
    it('registers an item once', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      const handle = handleFor(element);

      expect(registry.addItem(handle)).toBeDefined();
      expect(registry.addItem(handle)).toBeUndefined();
      expect(registry.itemCount).toBe(1);
    });

    it('returns the record it removed, so the grid can animate it out', () => {
      const record = addItem('a');
      const removed = registry.removeItem(record.handle);

      expect(removed).toBe(record);
      expect(registry.itemCount).toBe(0);
      expect(registry.removeItem(record.handle)).toBeUndefined();
    });

    it('reports whether a stamp was new, so observers are not double-attached', () => {
      const stamp = document.createElement('aside');
      expect(registry.addStamp(stamp)).toBe(true);
      expect(registry.addStamp(stamp)).toBe(false);
      expect(registry.hasStamps).toBe(true);

      expect(registry.removeStamp(stamp)).toBe(true);
      expect(registry.removeStamp(stamp)).toBe(false);
      expect(registry.hasStamps).toBe(false);
    });
  });

  describe('ordering', () => {
    it('reads order from the DOM, not from registration order', () => {
      addItem('b');
      addItem('c');

      // Prepend a third item, as `@for` does when a list gains an entry at the
      // front. It registers last but belongs first.
      const first = document.createElement('div');
      first.dataset['id'] = 'a';
      container.insertBefore(first, container.firstChild);
      registry.addItem(handleFor(first));

      for (const record of registry.allRecords()) record.measured = true;

      expect(idsOf(registry.collectOrdered(() => {}))).toEqual(['a', 'b', 'c']);
    });

    it('survives a reorder with no method call', () => {
      const a = addItem('a');
      const b = addItem('b');
      a.measured = true;
      b.measured = true;

      container.insertBefore(b.handle.element, a.handle.element);

      expect(idsOf(registry.collectOrdered(() => {}))).toEqual(['b', 'a']);
    });

    it('ignores elements inside the container that were never registered', () => {
      const stray = document.createElement('p');
      container.appendChild(stray);
      const a = addItem('a');
      a.measured = true;

      expect(idsOf(registry.collectOrdered(() => {}))).toEqual(['a']);
    });

    it('lists registered elements in DOM order for items()', () => {
      const a = addItem('a');
      const b = addItem('b');
      container.insertBefore(b.handle.element, a.handle.element);

      expect(registry.elementsInDomOrder()).toEqual([b.handle.element, a.handle.element]);
    });
  });

  describe('who takes part in a pass', () => {
    it('holds back items that have never been measured', () => {
      const a = addItem('a');
      addItem('b');
      a.measured = true;

      expect(idsOf(registry.collectOrdered(() => {}))).toEqual(['a']);
    });

    it('holds back items still waiting on an image', () => {
      const a = addItem('a');
      const b = addItem('b', { measurable: false });
      a.measured = true;
      b.measured = true;

      expect(idsOf(registry.collectOrdered(() => {}))).toEqual(['a']);
    });

    it('skips ignored items, and reports the ones already positioned', () => {
      const a = addItem('a', { ignored: true });
      const b = addItem('b');
      a.measured = true;
      a.placed = true;
      b.measured = true;

      const onIgnored = vi.fn();
      expect(idsOf(registry.collectOrdered(onIgnored))).toEqual(['b']);
      // Only the one that had been positioned needs handing back to normal flow.
      expect(onIgnored).toHaveBeenCalledTimes(1);
      expect(onIgnored).toHaveBeenCalledWith(a);
    });
  });

  describe('what it hands the solver', () => {
    it('copies heights and spans into reusable slots', () => {
      const a = addItem('a', { colSpan: 2 });
      const b = addItem('b');
      a.measured = true;
      a.height = 80;
      b.measured = true;
      b.height = 40;

      const ordered = registry.collectOrdered(() => {});
      expect(registry.measuredSlots(ordered)).toEqual([
        { height: 80, colSpan: 2 },
        { height: 40, colSpan: 1 },
      ]);
    });

    it('reuses the same slot objects between passes', () => {
      const a = addItem('a');
      a.measured = true;
      a.height = 10;

      const first = registry.measuredSlots(registry.collectOrdered(() => {}));
      const firstSlot = first[0];

      a.height = 20;
      const second = registry.measuredSlots(registry.collectOrdered(() => {}));

      // Same object, new value — this is what keeps a steady-state relayout
      // from allocating.
      expect(second[0]).toBe(firstSlot);
      expect(second[0]!.height).toBe(20);
    });

    it('shrinks the slot list when items go away', () => {
      const a = addItem('a');
      const b = addItem('b');
      a.measured = true;
      b.measured = true;
      expect(registry.measuredSlots(registry.collectOrdered(() => {}))).toHaveLength(2);

      registry.removeItem(b.handle);
      b.handle.element.remove();
      expect(registry.measuredSlots(registry.collectOrdered(() => {}))).toHaveLength(1);
    });

    it('returns no stamp boxes when there are no stamps', () => {
      expect(registry.stampBoxes()).toEqual([]);
    });
  });

  it('drops everything on clear', () => {
    addItem('a');
    registry.addStamp(document.createElement('aside'));
    registry.setSizer(document.createElement('div'));

    registry.clear();

    expect(registry.itemCount).toBe(0);
    expect(registry.hasStamps).toBe(false);
    expect(registry.sizer).toBeUndefined();
  });
});
