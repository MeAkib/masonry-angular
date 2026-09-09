/**
 * Deciding whether a layout pass would change anything.
 *
 * The grid is asked to lay out far more often than the answer actually changes.
 * Dragging a window edge fires the `ResizeObserver` on every frame, but if the
 * container is wide enough that the column count has not moved, every one of
 * those passes would compute the same positions and write the same styles.
 *
 * So before solving, we fold every input the solver reads into a single number.
 * If that number matches the last pass, the result would match too, and the
 * whole pass — the solve and all the DOM writes — is skipped.
 *
 * This is a hash, so in principle two different layouts could collide and
 * produce the same number. In practice the inputs are a handful of rounded
 * measurements, and the cost of a collision is one stale frame, not corruption:
 * the next real change produces a different number and repairs it.
 */

import type {
  MasonryStampBox,
  MeasuredSlot,
  ResolvedColumnGeometry,
  ResolvedMasonryGridOptions,
} from '../models';

/**
 * Lengths are rounded to this many parts of a pixel before hashing, so that
 * sub-pixel jitter in a measurement does not read as a real change.
 */
const PRECISION = 100;

/** Fold one number into a running hash. `| 0` keeps it a 32-bit integer. */
function mix(hash: number, value: number): number {
  return (hash * 31 + value) | 0;
}

/** Fold one rounded length into a running hash. */
function mixLength(hash: number, value: number): number {
  return mix(hash, Math.round(value * PRECISION));
}

/**
 * A number that changes whenever the next layout would differ.
 *
 * Never returns `0`. The grid uses `0` as a sentinel meaning "force the next
 * pass", so a real signature must never be mistaken for it.
 *
 * The arguments are passed positionally rather than as one options object
 * because this runs on the hot path — including on passes that are about to be
 * skipped — and an object literal here would mean an allocation on every frame
 * of a window resize, which is exactly the cost this function exists to avoid.
 */
export function layoutSignature(
  geometry: ResolvedColumnGeometry,
  options: ResolvedMasonryGridOptions,
  items: readonly MeasuredSlot[],
  stamps: readonly MasonryStampBox[],
  containerWidth: number,
  sizerWidth: number,
): number {
  let hash = 17;
  hash = mix(hash, geometry.columns);
  hash = mixLength(hash, geometry.columnWidth);

  // The container width is not redundant with the geometry above, even though
  // the geometry is derived from it. An RTL grid anchors items to the *right*
  // edge, so with a fixed `columnWidth` the container can grow — moving every
  // item — while the column count and column width stay exactly the same.
  hash = mixLength(hash, containerWidth);
  hash = mixLength(hash, sizerWidth);

  hash = mixLength(hash, options.gutterX);
  hash = mixLength(hash, options.gutterY);
  hash = mix(hash, options.horizontalOrder ? 1 : 0);
  hash = mix(hash, options.direction === 'rtl' ? 1 : 0);
  hash = mix(hash, options.verticalOrigin === 'bottom' ? 1 : 0);

  hash = mix(hash, items.length);
  for (const item of items) {
    hash = mixLength(hash, item.height);
    hash = mix(hash, item.colSpan);
  }

  for (const stamp of stamps) {
    hash = mixLength(hash, stamp.x + stamp.y + stamp.width + stamp.height);
  }

  return hash === 0 ? 1 : hash;
}

/** The sentinel that forces the next pass to run whatever the inputs say. */
export const FORCE_NEXT_LAYOUT = 0;
