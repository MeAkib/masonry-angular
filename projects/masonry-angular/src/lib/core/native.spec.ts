import { afterEach, describe, expect, it } from 'vitest';

import {
  nativeColumnsAreStatic,
  nativeTemplateColumns,
  nativeUnsupportedOptions,
  setNativeMasonrySupportForTesting,
  supportsNativeMasonry,
} from './native';
import { DEFAULT_MASONRY_GRID_OPTIONS } from '../schemas/defaults';
import { parseMasonryGridOptions } from '../schemas/parse';
import type { MasonryGridOptions } from '../models';

function options(overrides: MasonryGridOptions = {}) {
  return parseMasonryGridOptions({ native: true, ...overrides });
}

describe('native CSS masonry', () => {
  afterEach(() => setNativeMasonrySupportForTesting(undefined));

  describe('supportsNativeMasonry', () => {
    it('reports whatever the browser says about display: grid-lanes', () => {
      setNativeMasonrySupportForTesting(true);
      expect(supportsNativeMasonry()).toBe(true);

      setNativeMasonrySupportForTesting(false);
      expect(supportsNativeMasonry()).toBe(false);
    });

    it('is false where CSS.supports is unavailable, as on the server', () => {
      setNativeMasonrySupportForTesting(undefined);
      // jsdom exposes no `CSS.supports`, which is the same shape the server has.
      expect(supportsNativeMasonry()).toBe(false);
    });
  });

  describe('nativeTemplateColumns', () => {
    it('turns columnWidth into an auto-fill track list, so no JS is needed', () => {
      expect(nativeTemplateColumns(options({ columnWidth: 260 }), 0)).toBe(
        'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
      );
    });

    it('turns a fixed count into an equal track list', () => {
      expect(nativeTemplateColumns(options({ columns: 4 }), 0)).toBe('repeat(4, 1fr)');
    });

    it('uses the measured count for a breakpoint map', () => {
      expect(nativeTemplateColumns(options({ columns: { 0: 1, 768: 3 } }), 3)).toBe(
        'repeat(3, 1fr)',
      );
    });

    it('never emits fewer than one column', () => {
      expect(nativeTemplateColumns(options({ columns: { 0: 1 } }), 0)).toBe('repeat(1, 1fr)');
    });
  });

  describe('nativeColumnsAreStatic', () => {
    it('is true when grid-template-columns fully describes the grid', () => {
      expect(nativeColumnsAreStatic(options({ columnWidth: 200 }))).toBe(true);
      expect(nativeColumnsAreStatic(options({ columns: 3 }))).toBe(true);
      expect(nativeColumnsAreStatic(options())).toBe(true);
    });

    it('is false for a breakpoint map, which needs the container measured', () => {
      expect(nativeColumnsAreStatic(options({ columns: { 0: 1, 768: 3 } }))).toBe(false);
    });
  });

  describe('nativeUnsupportedOptions', () => {
    it('says nothing when the configuration maps cleanly', () => {
      expect(nativeUnsupportedOptions(options({ columns: 3 }), false)).toBeUndefined();
    });

    it('names every option the browser cannot honour', () => {
      const message = nativeUnsupportedOptions(
        options({ horizontalOrder: true, verticalOrigin: 'bottom', fitWidth: true }),
        true,
      );
      expect(message).toContain('`horizontalOrder`');
      expect(message).toContain("`verticalOrigin: 'bottom'`");
      expect(message).toContain('`fitWidth`');
      expect(message).toContain('`masonryGridStamp`');
      expect(message).toContain('native: false');
    });
  });

  it('is off by default, so grids look the same in every browser until opted in', () => {
    expect(DEFAULT_MASONRY_GRID_OPTIONS.native).toBe(false);
  });
});
