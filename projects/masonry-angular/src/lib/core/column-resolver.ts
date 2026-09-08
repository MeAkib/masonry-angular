import type { ResolvedColumnGeometry } from '../models/geometry';
import type {
  MasonryBreakpointScale,
  MasonryBreakpoints,
  ResolvedMasonryGridOptions,
} from '../models/options';

/** Column count fixed when neither `columns` nor `columnWidth` is configured. */
const DEFAULT_COLUMN_COUNT = 3;

/** A breakpoint resolved to `[minimum width in px, column count]`. */
type Stop = readonly [width: number, columns: number];

interface CachedStops {
  /** The scale the stops were resolved against, compared by identity. */
  readonly scale: MasonryBreakpointScale;
  readonly stops: readonly Stop[];
}

/**
 * Resolved stops are cached per map object, so a `columns` literal costs one
 * parse and sort for its lifetime rather than one per layout pass. The scale is
 * held alongside because a name means nothing without it: if the `breakpoints`
 * option changes, the cached stops are stale and are rebuilt.
 */
const stopsCache = new WeakMap<object, CachedStops>();

function resolveStops(map: MasonryBreakpoints, scale: MasonryBreakpointScale): readonly Stop[] {
  const cached = stopsCache.get(map);
  if (cached && cached.scale === scale) return cached.stops;

  const stops: Stop[] = [];
  for (const [key, count] of Object.entries(map)) {
    if (count === undefined) continue;
    // A key is either a width in px or a name in the scale. Unknown names are
    // dropped here and reported by the development-mode validator.
    const width = key.trim() !== '' && Number.isFinite(Number(key)) ? Number(key) : scale[key];
    if (width === undefined) continue;
    stops.push([width, count]);
  }
  stops.sort((a, b) => a[0] - b[0]);

  stopsCache.set(map, { scale, stops });
  return stops;
}

/** The column count for the largest breakpoint at or below `width`. */
function matchBreakpoint(
  map: MasonryBreakpoints,
  scale: MasonryBreakpointScale,
  width: number,
): number {
  const stops = resolveStops(map, scale);
  if (stops.length === 0) return DEFAULT_COLUMN_COUNT;

  // Below the smallest stop, the smallest one still applies — a map that omits
  // a zero-width entry should not leave narrow containers unstyled.
  let matched = stops[0]![1];
  for (const [stopWidth, count] of stops) {
    if (stopWidth > width) break;
    matched = count;
  }
  return matched;
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
        ? matchBreakpoint(options.columns, options.breakpoints, basisWidth)
        : DEFAULT_COLUMN_COUNT;

  const columns = clampColumns(requested, options);
  return { columns, columnWidth: Math.max(0, (width - (columns - 1) * gutterX) / columns) };
}

/** Column count used by the pre-hydration CSS fallback. */
export function resolveFallbackColumns(options: ResolvedMasonryGridOptions): number {
  if (typeof options.columns === 'number') return clampColumns(options.columns, options);
  return clampColumns(options.ssr.columns, options);
}
