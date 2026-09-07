import { describe, expect, it } from 'vitest';
import type { MasonryGridOptions, MasonryOptionIssue } from '../models';
import { DEFAULT_MASONRY_GRID_OPTIONS } from './defaults';
import {
  MasonryGridOptionsError,
  masonryOptionsEqual,
  mergeMasonryGridOptions,
  parseMasonryGridOptions,
} from './parse';

/** Every issue raised for an options object, or `[]` when it is valid. */
function issuesFor(options: MasonryGridOptions): readonly MasonryOptionIssue[] {
  try {
    parseMasonryGridOptions(options);
    return [];
  } catch (error) {
    if (error instanceof MasonryGridOptionsError) return error.issues;
    throw error;
  }
}

function isValid(options: MasonryGridOptions): boolean {
  return issuesFor(options).length === 0;
}

describe('DEFAULT_MASONRY_GRID_OPTIONS', () => {
  it('is frozen, so a consumer cannot mutate the shared defaults', () => {
    expect(Object.isFrozen(DEFAULT_MASONRY_GRID_OPTIONS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MASONRY_GRID_OPTIONS.ssr)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MASONRY_GRID_OPTIONS.transition)).toBe(true);
  });

  /**
   * The types, the defaults and the validator are three hand-written things
   * that could drift apart. This pins the first two together: resolving an
   * empty object has to reproduce the defaults exactly, key for key.
   */
  it('is exactly what an empty configuration resolves to', () => {
    expect(parseMasonryGridOptions({})).toEqual(DEFAULT_MASONRY_GRID_OPTIONS);
    expect(Object.keys(parseMasonryGridOptions({})).sort()).toEqual(
      Object.keys(DEFAULT_MASONRY_GRID_OPTIONS).sort(),
    );
  });
});

describe('parseMasonryGridOptions', () => {
  it('fills a complete configuration from an empty object', () => {
    const parsed = parseMasonryGridOptions({});

    expect(parsed.gutter).toBe(16);
    expect(parsed.direction).toBe('ltr');
    expect(parsed.breakpointBasis).toBe('container');
  });

  it('fills nested groups rather than leaving them empty', () => {
    const parsed = parseMasonryGridOptions({});

    expect(parsed.transition).toEqual({ duration: 300, easing: expect.any(String) });
    expect(parsed.ssr).toEqual({ fallback: 'columns', columns: 2 });
    expect(parsed.entryAnimation).toMatchObject({
      duration: 280,
      stagger: 24,
      animateInitial: true,
    });
  });

  it('keeps partial overrides of a nested group', () => {
    const parsed = parseMasonryGridOptions({ transition: { duration: 0 } });

    expect(parsed.transition.duration).toBe(0);
    expect(parsed.transition.easing).toBe(DEFAULT_MASONRY_GRID_OPTIONS.transition.easing);
  });

  it('keeps `entryAnimation: false` rather than filling it in', () => {
    expect(parseMasonryGridOptions({ entryAnimation: false }).entryAnimation).toBe(false);
  });

  it('treats a missing value as all defaults', () => {
    expect(parseMasonryGridOptions(undefined)).toEqual(DEFAULT_MASONRY_GRID_OPTIONS);
  });

  it('throws a readable, path-annotated error in development', () => {
    expect(() => parseMasonryGridOptions({ gutter: -5 })).toThrow(MasonryGridOptionsError);
    expect(() => parseMasonryGridOptions({ gutter: -5 })).toThrow(/gutter/);
    expect(() => parseMasonryGridOptions({ gutter: -5 })).toThrow(/→ at gutter/);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const issues = issuesFor({ gutter: -5, direction: 'sideways' as never, minColumns: 0 });

    expect(issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['gutter', 'direction', 'minColumns']),
    );
  });

  describe('gutter shorthand', () => {
    it('applies to both axes', () => {
      const parsed = parseMasonryGridOptions({ gutter: 24 });

      expect([parsed.gutterX, parsed.gutterY]).toEqual([24, 24]);
    });

    it('yields to an explicit per-axis value', () => {
      const parsed = parseMasonryGridOptions({ gutter: 24, gutterY: 8 });

      expect([parsed.gutterX, parsed.gutterY]).toEqual([24, 8]);
    });
  });

  describe('validation', () => {
    it('rejects setting both columns and columnWidth', () => {
      const issues = issuesFor({ columns: 3, columnWidth: 200 });

      expect(issues[0]?.message).toContain('not both');
    });

    it('rejects maxColumns below minColumns', () => {
      expect(isValid({ minColumns: 4, maxColumns: 2 })).toBe(false);
    });

    it('rejects a negative gutter', () => {
      expect(isValid({ gutter: -1 })).toBe(false);
    });

    it('rejects a fractional column count', () => {
      expect(isValid({ columns: 2.5 })).toBe(false);
    });

    it('rejects a non-numeric breakpoint key', () => {
      expect(isValid({ columns: { small: 2 } as never })).toBe(false);
    });

    it('rejects an empty breakpoint map', () => {
      expect(isValid({ columns: {} })).toBe(false);
    });

    it('rejects a non-numeric breakpoint value', () => {
      expect(isValid({ columns: { 0: 'two' } as never })).toBe(false);
    });

    it('rejects an unknown enum value', () => {
      expect(isValid({ direction: 'sideways' as never })).toBe(false);
      expect(isValid({ ssr: { fallback: 'nope' as never } })).toBe(false);
    });

    it('rejects entry keyframes that would clobber item positioning', () => {
      const issues = issuesFor({
        entryAnimation: { keyframes: [{ transform: 'scale(0)' }, { transform: 'none' }] },
      });

      expect(issues[0]?.message).toContain('transform');
    });

    it('rejects a single entry keyframe', () => {
      expect(isValid({ entryAnimation: { keyframes: [{ opacity: 0 }] } })).toBe(false);
    });

    it('accepts a valid breakpoint map', () => {
      expect(isValid({ columns: { 0: 1, 768: 2, 1200: 4 } })).toBe(true);
    });
  });
});

describe('mergeMasonryGridOptions', () => {
  it('layers later sources over earlier ones', () => {
    expect(mergeMasonryGridOptions({ gutter: 8, fitWidth: true }, { gutter: 24 })).toEqual({
      gutter: 24,
      fitWidth: true,
    });
  });

  it('merges nested groups instead of replacing them', () => {
    const merged = mergeMasonryGridOptions(
      { ssr: { fallback: 'columns', columns: 4 } },
      { ssr: { columns: 2 } },
    );

    expect(merged.ssr).toEqual({ fallback: 'columns', columns: 2 });
  });

  it('ignores undefined overrides', () => {
    expect(mergeMasonryGridOptions({ gutter: 8 }, { gutter: undefined })).toEqual({ gutter: 8 });
  });

  it('clears the opposing sizing option so the override stays valid', () => {
    const merged = mergeMasonryGridOptions({ columns: 4 }, { columnWidth: 220 });

    expect(merged).toEqual({ columnWidth: 220 });
    expect(isValid(merged)).toBe(true);
  });

  it('produces defaults that a component override can still narrow', () => {
    const merged = mergeMasonryGridOptions(
      { gutter: 24, columns: { 0: 1, 900: 3 } },
      { columns: 2 },
    );

    expect(parseMasonryGridOptions(merged)).toMatchObject({ gutter: 24, columns: 2 });
  });
});

describe('masonryOptionsEqual', () => {
  it('treats structurally identical literals as unchanged', () => {
    expect(
      masonryOptionsEqual({ gutter: 16, ssr: { columns: 2 } }, { gutter: 16, ssr: { columns: 2 } }),
    ).toBe(true);
  });

  it('detects a changed nested value', () => {
    expect(masonryOptionsEqual({ ssr: { columns: 2 } }, { ssr: { columns: 3 } })).toBe(false);
  });

  it('detects added and removed keys', () => {
    expect(masonryOptionsEqual({ gutter: 16 }, { gutter: 16, fitWidth: true })).toBe(false);
  });

  it('compares breakpoint maps by value', () => {
    expect(masonryOptionsEqual({ columns: { 0: 1, 900: 3 } }, { columns: { 0: 1, 900: 3 } })).toBe(
      true,
    );
    expect(masonryOptionsEqual({ columns: { 0: 1, 900: 3 } }, { columns: { 0: 1, 900: 4 } })).toBe(
      false,
    );
  });
});
