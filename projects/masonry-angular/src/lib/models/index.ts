/**
 * Every data shape the library defines, in one place.
 *
 * The folder holds type declarations only — no runtime code — so importing
 * from here costs nothing at all in the emitted bundle. Behaviour lives in
 * `core/` and `schemas/`; the frozen option defaults live in
 * `../schemas/defaults`.
 */
export type {
  MasonryBreakpointKey,
  MasonryBreakpointName,
  MasonryBreakpointScale,
  MasonryBreakpoints,
  MasonryEntryAnimation,
  MasonryExitAnimation,
  MasonryGridOptions,
  MasonryKeyframe,
  MasonryOptionIssue,
  MasonrySsr,
  MasonryTransition,
  ResolvedMasonryGridOptions,
} from './options';
export type {
  MasonryGridState,
  MasonryLayoutRequest,
  MasonryLayoutSolution,
  MasonryMeasuredItem,
  MasonryStampBox,
} from './layout';
export type { ResolvedColumnGeometry } from './geometry';
export type { MasonryLayoutEvent, MasonryRemoveEvent } from './events';
export type { ItemRecord, MasonryItemHandle, MeasuredSlot } from './item';
