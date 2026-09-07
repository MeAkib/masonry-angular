/** Emitted after every completed layout pass. */
export interface MasonryLayoutEvent {
  readonly columns: number;
  readonly columnWidth: number;
  /** Items that were positioned. Excludes items still waiting to be measured. */
  readonly itemCount: number;
  readonly height: number;
  readonly width: number;
  /** Wall-clock cost of the pass, in milliseconds. */
  readonly durationMs: number;
  /** Monotonic pass counter, starting at 1. */
  readonly pass: number;
}

/** Emitted once a batch of removed items has finished leaving. */
export interface MasonryRemoveEvent {
  /** How many items completed their removal since the last emission. */
  readonly removed: number;
}
