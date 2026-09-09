import { describe, expect, it } from 'vitest';

import { FORCE_NEXT_LAYOUT, layoutSignature } from './layout-signature';
import { parseMasonryGridOptions } from '../schemas/parse';
import type {
  MasonryGridOptions,
  MasonryStampBox,
  MeasuredSlot,
  ResolvedColumnGeometry,
} from '../models';

const GEOMETRY: ResolvedColumnGeometry = { columns: 3, columnWidth: 100 };
const ITEMS: readonly MeasuredSlot[] = [
  { height: 80, colSpan: 1 },
  { height: 40, colSpan: 2 },
];

function sign(
  overrides: {
    geometry?: ResolvedColumnGeometry;
    options?: MasonryGridOptions;
    items?: readonly MeasuredSlot[];
    stamps?: readonly MasonryStampBox[];
    containerWidth?: number;
    sizerWidth?: number;
  } = {},
): number {
  return layoutSignature(
    overrides.geometry ?? GEOMETRY,
    parseMasonryGridOptions(overrides.options ?? {}),
    overrides.items ?? ITEMS,
    overrides.stamps ?? [],
    overrides.containerWidth ?? 320,
    overrides.sizerWidth ?? 0,
  );
}

describe('layoutSignature', () => {
  it('is stable for identical input', () => {
    expect(sign()).toBe(sign());
  });

  it('never collides with the force sentinel', () => {
    // Sampled broadly rather than proved: the guarantee is a branch in the
    // function, and this is here to notice if that branch is ever removed.
    for (let i = 0; i < 500; i++) {
      expect(sign({ items: [{ height: i * 7.3, colSpan: (i % 3) + 1 }] })).not.toBe(
        FORCE_NEXT_LAYOUT,
      );
    }
  });

  describe('changes when the layout would change', () => {
    it('on a different column count', () => {
      expect(sign({ geometry: { columns: 4, columnWidth: 100 } })).not.toBe(sign());
    });

    it('on a different column width', () => {
      expect(sign({ geometry: { columns: 3, columnWidth: 101 } })).not.toBe(sign());
    });

    it('on a changed item height', () => {
      expect(sign({ items: [{ height: 81, colSpan: 1 }, ITEMS[1]!] })).not.toBe(sign());
    });

    it('on a changed span', () => {
      expect(sign({ items: [{ height: 80, colSpan: 2 }, ITEMS[1]!] })).not.toBe(sign());
    });

    it('on an added item', () => {
      expect(sign({ items: [...ITEMS, { height: 20, colSpan: 1 }] })).not.toBe(sign());
    });

    it('on a reordered list of identical items', () => {
      const same: MeasuredSlot[] = [
        { height: 10, colSpan: 1 },
        { height: 20, colSpan: 1 },
      ];
      expect(sign({ items: same })).not.toBe(sign({ items: [...same].reverse() }));
    });

    it('on a changed gutter', () => {
      expect(sign({ options: { gutter: 20 } })).not.toBe(sign({ options: { gutter: 16 } }));
      expect(sign({ options: { gutterY: 20 } })).not.toBe(sign({ options: { gutterY: 16 } }));
    });

    it('on a changed packing option', () => {
      expect(sign({ options: { horizontalOrder: true } })).not.toBe(sign());
      expect(sign({ options: { direction: 'rtl' } })).not.toBe(sign());
      expect(sign({ options: { verticalOrigin: 'bottom' } })).not.toBe(sign());
    });

    it('on a moved stamp', () => {
      const stamp = { x: 0, y: 0, width: 50, height: 50 };
      expect(sign({ stamps: [stamp] })).not.toBe(sign({ stamps: [{ ...stamp, y: 10 }] }));
    });

    it('on a changed sizer width', () => {
      expect(sign({ sizerWidth: 120 })).not.toBe(sign({ sizerWidth: 100 }));
    });

    it('on a container resize that leaves the geometry alone', () => {
      // This is the case a naive signature misses. An RTL grid anchors items to
      // the right edge, so a wider container moves every item even though the
      // column count and column width have not changed at all.
      expect(sign({ containerWidth: 400, options: { direction: 'rtl' } })).not.toBe(
        sign({ containerWidth: 320, options: { direction: 'rtl' } }),
      );
    });
  });

  describe('ignores what cannot change the layout', () => {
    it('animation and transition settings', () => {
      expect(sign({ options: { entryAnimation: false } })).toBe(sign());
      expect(sign({ options: { transition: { duration: 0 } } })).toBe(sign());
    });

    it('sub-pixel jitter below the rounding threshold', () => {
      // 1/100th of a pixel is noise from a measurement, not a real move.
      expect(sign({ items: [{ height: 80.0001, colSpan: 1 }, ITEMS[1]!] })).toBe(sign());
    });
  });
});
