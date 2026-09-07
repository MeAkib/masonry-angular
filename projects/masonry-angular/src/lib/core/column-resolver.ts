import type { ResolvedColumnGeometry } from '../models/geometry';
import type { ResolvedMasonryGridOptions } from '../models/options';

/** Column count fixed when neither `columns` nor `columnWidth` is configured. */
const DEFAULT_COLUMN_COUNT = 3;

/** Breakpoint keys are parsed once per map object and cached by identity. */
const sortedBreakpointCache = new WeakMap<object, readonly number[]>();

function sortedBreakpoints(map: Record<number, number>): readonly number[] {
  let sorted = sortedBreakpointCache.get(map);
  if (!sorted) {
    sorted = Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b);
    sortedBreakpointCache.set(map, sorted);
  }
  return sorted;
}

/** The column count for the largest breakpoint at or below `width`. */
function matchBreakpoint(map: Record<number, number>, width: number): number {
  const breakpoints = sortedBreakpoints(map);
  let matched = breakpoints[0];
  for (const breakpoint of breakpoints) {
    if (breakpoint > width) break;
    matched = breakpoint;
  }
  return matched === undefined ? DEFAULT_COLUMN_COUNT : (map[matched] ?? DEFAULT_COLUMN_COUNT);
}

function clampColumns(count: number, options: ResolvedMasonryGridOptions): number {
  const upper = options.maxColumns ?? Number.POSITIVE_INFINITY;
  return Math.max(1, Math.min(Math.max(count, options.minColumns), upper));
}

/**
 * Turn the available width into a concrete column count and column width.
 *
 * @param availableWidth Content-box width of the grid container, in px.
 * @param basisWidth Width that breakpoints are matched against — the container
 *   itself, or the viewport, per `breakpointBasis`.
 * @param sizerWidth Measured width of an `masonryGridSizer` element, when one is
 *   present. It takes precedence over both `columns` and `columnWidth`, which is
 *   what lets a stylesheet own the column width.
 */
export function resolveColumnGeometry(
  availableWidth: number,
  basisWidth: number,
  options: ResolvedMasonryGridOptions,
  sizerWidth?: number,
): ResolvedColumnGeometry {
  const { gutterX } = options;
  const width = Math.max(0, availableWidth);

  const fixedWidth = sizerWidth !== undefined && sizerWidth > 0 ? sizerWidth : options.columnWidth;
  if (fixedWidth !== undefined) {
    const track = fixedWidth + gutterX;
    const fitted = track > 0 ? Math.floor((width + gutterX) / track) : 1;
    const columns = clampColumns(fitted, options);
    // A sizer states the width explicitly, so stretching would contradict it.
    const columnWidth =
      options.stretchColumns && sizerWidth === undefined
        ? (width - (columns - 1) * gutterX) / columns
        : fixedWidth;
    return { columns, columnWidth: Math.max(0, columnWidth) };
  }

  const requested =
    typeof options.columns === 'number'
      ? options.columns
      : options.columns !== undefined
        ? matchBreakpoint(options.columns, basisWidth)
        : DEFAULT_COLUMN_COUNT;

  const columns = clampColumns(requested, options);
  return { columns, columnWidth: Math.max(0, (width - (columns - 1) * gutterX) / columns) };
}

/** Column count used by the pre-hydration CSS fallback. */
export function resolveFallbackColumns(options: ResolvedMasonryGridOptions): number {
  if (typeof options.columns === 'number') return clampColumns(options.columns, options);
  return clampColumns(options.ssr.columns, options);
}
