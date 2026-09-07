/*
 * Public API surface of masonry-angular.
 */

import { MasonryGrid } from './lib/masonry-grid';
import { MasonryGridItem } from './lib/directives/masonry-grid-item';
import { MasonryGridStamp } from './lib/directives/masonry-grid-stamp';
import { MasonryGridSizer } from './lib/directives/masonry-grid-sizer';

export { MasonryGrid } from './lib/masonry-grid';
export { MasonryGridItem } from './lib/directives/masonry-grid-item';
export { MasonryGridStamp } from './lib/directives/masonry-grid-stamp';
export { MasonryGridSizer } from './lib/directives/masonry-grid-sizer';

export { MasonryGridHost } from './lib/core/host';
export { NG_MASONRY_GRID_DEFAULTS, provideNgMasonryGrid } from './lib/providers';

// The layout solver is exported on its own because it has no Angular or DOM
// dependencies: it is just as usable from a worker, a test, or another
// framework's renderer.
export { MasonryLayoutEngine } from './lib/core/layout-engine';
export { resolveColumnGeometry, resolveFallbackColumns } from './lib/core/column-resolver';
export { FrameScheduler } from './lib/core/scheduler';

export { DEFAULT_MASONRY_GRID_OPTIONS } from './lib/schemas/defaults';
export {
  MasonryGridOptionsError,
  masonryOptionsEqual,
  mergeMasonryGridOptions,
  parseMasonryGridOptions,
} from './lib/schemas/parse';

// Every data shape the library defines. Types only — nothing here has a
// runtime representation.
export type {
  MasonryBreakpoints,
  MasonryEntryAnimation,
  MasonryExitAnimation,
  MasonryGridOptions,
  MasonryItemHandle,
  MasonryKeyframe,
  MasonryLayoutEvent,
  MasonryLayoutRequest,
  MasonryLayoutSolution,
  MasonryMeasuredItem,
  MasonryOptionIssue,
  MasonryRemoveEvent,
  MasonrySsr,
  MasonryStampBox,
  MasonryTransition,
  ResolvedColumnGeometry,
  ResolvedMasonryGridOptions,
} from './lib/models';

/**
 * Every directive in the library, for a one-line standalone import.
 *
 * ```ts
 * @Component({ imports: [NG_MASONRY_GRID] })
 * ```
 */
export const NG_MASONRY_GRID = [
  MasonryGrid,
  MasonryGridItem,
  MasonryGridStamp,
  MasonryGridSizer,
] as const;
