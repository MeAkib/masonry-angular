import { describe, expect, it } from 'vitest';
import { resolveColumnGeometry, resolveFallbackColumns } from './column-resolver';
import type { MasonryGridOptions } from '../models';
import { parseMasonryGridOptions } from '../schemas/parse';

const options = (overrides: MasonryGridOptions = {}) => parseMasonryGridOptions(overrides);

describe('resolveColumnGeometry', () => {
  it('defaults to three columns when nothing is configured', () => {
    const geometry = resolveColumnGeometry(1000, 1000, options());

    expect(geometry.columns).toBe(3);
  });

  it('divides the container evenly, discounting the gutters', () => {
    const geometry = resolveColumnGeometry(320, 320, options({ columns: 3, gutter: 10 }));

    expect(geometry).toEqual({ columns: 3, columnWidth: 100 });
  });

  describe('breakpoints', () => {
    const responsive = options({ columns: { 0: 1, 600: 2, 900: 4 }, gutter: 0 });

    it('picks the largest breakpoint at or below the basis width', () => {
      expect(resolveColumnGeometry(700, 700, responsive).columns).toBe(2);
      expect(resolveColumnGeometry(900, 900, responsive).columns).toBe(4);
      expect(resolveColumnGeometry(1600, 1600, responsive).columns).toBe(4);
    });

    it('falls back to the smallest breakpoint below the first one', () => {
      const narrow = options({ columns: { 600: 2, 900: 4 }, gutter: 0 });

      expect(resolveColumnGeometry(320, 320, narrow).columns).toBe(2);
    });

    it('matches against the basis width, not the container width', () => {
      // A narrow container inside a wide viewport, under `breakpointBasis: 'viewport'`.
      expect(resolveColumnGeometry(300, 1200, responsive).columns).toBe(4);
    });
  });

  describe('columnWidth', () => {
    it('derives the count from how many columns fit', () => {
      const geometry = resolveColumnGeometry(640, 640, options({ columnWidth: 200, gutter: 20 }));

      // 200 + 20 fits three times in 640 + 20.
      expect(geometry.columns).toBe(3);
    });

    it('stretches columns to fill the row by default', () => {
      const geometry = resolveColumnGeometry(640, 640, options({ columnWidth: 200, gutter: 20 }));

      expect(geometry.columnWidth).toBeCloseTo(200);
      expect(geometry.columns * geometry.columnWidth + 2 * 20).toBeCloseTo(640);
    });

    it('keeps the requested width when stretching is off', () => {
      const geometry = resolveColumnGeometry(
        700,
        700,
        options({ columnWidth: 200, gutter: 20, stretchColumns: false }),
      );

      expect(geometry.columnWidth).toBe(200);
    });

    it('never drops below a single column in a narrow container', () => {
      const geometry = resolveColumnGeometry(50, 50, options({ columnWidth: 300 }));

      expect(geometry.columns).toBe(1);
    });
  });

  describe('clamping', () => {
    it('respects maxColumns', () => {
      const geometry = resolveColumnGeometry(
        2000,
        2000,
        options({ columnWidth: 100, maxColumns: 4 }),
      );

      expect(geometry.columns).toBe(4);
    });

    it('respects minColumns even when the container is too narrow', () => {
      const geometry = resolveColumnGeometry(
        120,
        120,
        options({ columnWidth: 300, minColumns: 2 }),
      );

      expect(geometry.columns).toBe(2);
    });
  });

  it('never produces a negative column width', () => {
    const geometry = resolveColumnGeometry(10, 10, options({ columns: 6, gutter: 40 }));

    expect(geometry.columnWidth).toBe(0);
  });
});

describe('resolveFallbackColumns', () => {
  it('uses a fixed column count directly', () => {
    expect(resolveFallbackColumns(options({ columns: 5 }))).toBe(5);
  });

  it('uses the configured SSR count for responsive and width-driven grids', () => {
    expect(resolveFallbackColumns(options({ columns: { 0: 1, 900: 4 } }))).toBe(2);
    expect(resolveFallbackColumns(options({ columnWidth: 240, ssr: { columns: 3 } }))).toBe(3);
  });
});
