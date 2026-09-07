import { describe, expect, it } from 'vitest';
import { MasonryLayoutEngine } from './layout-engine';
import type { MasonryLayoutRequest } from '../models';

function request(overrides: Partial<MasonryLayoutRequest> = {}): MasonryLayoutRequest {
  return {
    items: [],
    stamps: [],
    columns: 3,
    columnWidth: 100,
    gutterX: 10,
    gutterY: 10,
    containerWidth: 320,
    horizontalOrder: false,
    rtl: false,
    originBottom: false,
    ...overrides,
  };
}

/** Read the solution back as `[x, y]` pairs, for readable assertions. */
function coordinates(positions: Float64Array, count: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => [positions[i * 2]!, positions[i * 2 + 1]!]);
}

const item = (height: number, colSpan = 1) => ({ height, colSpan });

describe('MasonryLayoutEngine', () => {
  const engine = new MasonryLayoutEngine();

  it('fills empty columns left to right before stacking', () => {
    const solution = engine.solve(request({ items: [item(50), item(50), item(50)] }));

    expect(coordinates(solution.positions, 3)).toEqual([
      [0, 0],
      [110, 0],
      [220, 0],
    ]);
  });

  it('places each item in the shortest column', () => {
    // Columns end at 100, 40 and 70; the fourth item belongs in the middle one.
    const solution = engine.solve(request({ items: [item(100), item(40), item(70), item(20)] }));

    expect(coordinates(solution.positions, 4)[3]).toEqual([110, 50]);
  });

  it('adds the gutter between stacked items but never after the last one', () => {
    const solution = engine.solve(request({ columns: 1, items: [item(50), item(30)] }));

    expect(coordinates(solution.positions, 2)).toEqual([
      [0, 0],
      [0, 60],
    ]);
    expect(solution.contentHeight).toBe(90);
  });

  it('breaks ties toward the leftmost column', () => {
    const solution = engine.solve(request({ items: [item(50), item(50), item(50), item(10)] }));

    expect(coordinates(solution.positions, 4)[3]).toEqual([0, 60]);
  });

  describe('column spans', () => {
    it('widens an item across the gutter it bridges', () => {
      const solution = engine.solve(request({ items: [item(50, 2)] }));

      // Two 100px columns plus the 10px gutter between them.
      expect(solution.widths[0]).toBe(210);
    });

    it('starts a spanning item below the tallest column in the group it lands on', () => {
      const solution = engine.solve(
        request({ items: [item(80), item(20), item(30), item(40, 2)] }),
      );

      // The three columns end at 90, 30 and 40 (heights plus one gutter each).
      // A 2-wide item can start at columns 0 or 1, clearing max(90, 30) = 90 or
      // max(30, 40) = 40 respectively, so the second group wins.
      expect(coordinates(solution.positions, 4)[3]).toEqual([110, 40]);
    });

    it('raises every column the item covers', () => {
      const solution = engine.solve(request({ items: [item(50, 3)] }));

      expect(Array.from(solution.columnHeights.slice(0, 3))).toEqual([60, 60, 60]);
    });

    it('clamps a span wider than the grid', () => {
      const solution = engine.solve(request({ columns: 2, items: [item(50, 9)] }));

      expect(solution.widths[0]).toBe(210);
      expect(coordinates(solution.positions, 1)[0]).toEqual([0, 0]);
    });
  });

  describe('horizontalOrder', () => {
    it('fills row by row regardless of column heights', () => {
      const solution = engine.solve(
        request({ horizontalOrder: true, items: [item(200), item(10), item(10), item(10)] }),
      );

      // Without horizontalOrder the fourth item would go to a short column;
      // here it must start the second row.
      expect(coordinates(solution.positions, 4)).toEqual([
        [0, 0],
        [110, 0],
        [220, 0],
        [0, 210],
      ]);
    });

    it('wraps an item that cannot fit in the remaining row', () => {
      const solution = engine.solve(
        request({ horizontalOrder: true, items: [item(10), item(10), item(10, 2)] }),
      );

      expect(coordinates(solution.positions, 3)[2]).toEqual([0, 20]);
    });
  });

  describe('rtl', () => {
    it('anchors the first column to the right edge', () => {
      const solution = engine.solve(request({ rtl: true, items: [item(50), item(50)] }));

      expect(coordinates(solution.positions, 2)).toEqual([
        [220, 0],
        [110, 0],
      ]);
    });

    it('right-aligns a spanning item', () => {
      const solution = engine.solve(request({ rtl: true, items: [item(50, 2)] }));

      expect(coordinates(solution.positions, 1)[0]).toEqual([110, 0]);
    });
  });

  describe('stamps', () => {
    it('pushes items below a stamp in the columns it covers', () => {
      const solution = engine.solve(
        request({ stamps: [{ x: 0, y: 0, width: 100, height: 80 }], items: [item(10)] }),
      );

      expect(coordinates(solution.positions, 1)[0]).toEqual([110, 0]);
    });

    it('does not claim the next column when it ends on a boundary', () => {
      // The stamp spans exactly column 0, ending where column 1's track begins.
      const solution = engine.solve(
        request({ stamps: [{ x: 0, y: 0, width: 110, height: 80 }], items: [item(10)] }),
      );

      expect(coordinates(solution.positions, 1)[0]).toEqual([110, 0]);
    });

    it('covers every column a wide stamp overlaps', () => {
      const solution = engine.solve(
        request({ stamps: [{ x: 0, y: 0, width: 210, height: 80 }], items: [item(10)] }),
      );

      expect(coordinates(solution.positions, 1)[0]).toEqual([220, 0]);
    });
  });

  describe('content box', () => {
    it('reports the tallest column as the height', () => {
      const solution = engine.solve(request({ items: [item(100), item(40), item(70)] }));

      expect(solution.contentHeight).toBe(100);
    });

    it('reports only the width of columns that received items', () => {
      const solution = engine.solve(request({ items: [item(50), item(50)] }));

      // Two occupied 100px columns and the single gutter between them.
      expect(solution.contentWidth).toBe(210);
    });

    it('is empty for an empty grid', () => {
      const solution = engine.solve(request());

      expect(solution.contentHeight).toBe(0);
      expect(solution.contentWidth).toBe(0);
    });
  });

  it('reuses its buffers across passes without leaking stale results', () => {
    const many = engine.solve(request({ items: [item(10), item(10), item(10), item(10)] }));
    const capacity = many.positions.length;
    const few = engine.solve(request({ items: [item(20)] }));

    expect(few.positions).toBe(many.positions);
    expect(few.positions.length).toBe(capacity);
    expect(coordinates(few.positions, 1)).toEqual([[0, 0]]);
    expect(few.contentHeight).toBe(20);
  });
});

describe('bottom origin', () => {
  it('mirrors a single column so the first item sits at the bottom', () => {
    const engine = new MasonryLayoutEngine();
    const solution = engine.solve(
      request({ columns: 1, items: [item(80), item(40)], originBottom: true }),
    );

    // Top-origin would be [0, 0] and [0, 90], with contentHeight 130.
    expect(solution.contentHeight).toBe(130);
    expect(coordinates(solution.positions, 2)).toEqual([
      [0, 50], // 130 - 0 - 80
      [0, 0], // 130 - 90 - 40
    ]);
  });

  it('leaves the x axis untouched', () => {
    const engine = new MasonryLayoutEngine();
    const top = engine.solve(request({ items: [item(80), item(40), item(60)] }));
    const topX = coordinates(top.positions, 3).map(([x]) => x);
    const bottom = engine.solve(
      request({ items: [item(80), item(40), item(60)], originBottom: true }),
    );

    expect(coordinates(bottom.positions, 3).map(([x]) => x)).toEqual(topX);
  });

  it('keeps every item inside the content box', () => {
    const engine = new MasonryLayoutEngine();
    const items = [item(80), item(40), item(60), item(120), item(30)];
    const solution = engine.solve(request({ items, originBottom: true }));

    for (const [index, [, y]] of coordinates(solution.positions, items.length).entries()) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + items[index]!.height).toBeLessThanOrEqual(solution.contentHeight);
    }
  });

  it('reports the same content height as a top-origin layout', () => {
    const engine = new MasonryLayoutEngine();
    const items = [item(80), item(40), item(60), item(120)];

    expect(engine.solve(request({ items, originBottom: true })).contentHeight).toBe(
      engine.solve(request({ items })).contentHeight,
    );
  });
});
