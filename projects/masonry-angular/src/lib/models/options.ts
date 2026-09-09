/**
 * The library's configuration surface: every option type, plus the shape of a
 * single validation issue.
 *
 * These types are hand-written rather than derived from a validation schema.
 * That is a deliberate trade: a schema would keep the types, the defaults and
 * the validation rules in a single declaration that cannot drift, but it also
 * ships its own runtime to every user of the library — and the only thing that
 * runtime does is catch mistakes the application developer makes while writing
 * their own TypeScript. Validation therefore lives in `../schemas/parse`,
 * hand-written and guarded by `ngDevMode`, so production builds drop it
 * entirely.
 *
 * `DEFAULT_MASONRY_GRID_OPTIONS` in `../schemas/defaults` is the single source
 * of truth for defaults; `parse.ts` fills unset fields from it, and a test
 * asserts the two stay in step with `ResolvedMasonryGridOptions`.
 */

/** A single Web Animations API keyframe. */
export type MasonryKeyframe = Record<string, string | number>;

/** The breakpoint names defined out of the box. */
export type MasonryBreakpointName = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * A breakpoint key: a name from the scale, or a raw minimum width in px.
 *
 * `string & {}` keeps editor autocomplete for the built-in names while still
 * accepting any name an application has added to its own `breakpoints` scale.
 */
export type MasonryBreakpointKey = MasonryBreakpointName | (string & {}) | number;

/**
 * Named minimum widths in px. Applications override any subset of these through
 * the `breakpoints` option; unnamed entries keep their default.
 */
export type MasonryBreakpointScale = Partial<Record<MasonryBreakpointKey, number>>;

/**
 * Column counts keyed by breakpoint.
 *
 * `{ sm: 1, lg: 3, xl: 4 }` reads as "one column from `sm` up, three from `lg`,
 * four from `xl`". Raw pixel widths work as well, and the two can be mixed:
 * `{ 0: 1, 640: 2 }` and `{ xs: 1, sm: 2, 1440: 5 }` are both valid.
 *
 * Whichever form is used, the count that applies is the one for the largest
 * breakpoint at or below the measured width.
 */
export type MasonryBreakpoints = Partial<Record<MasonryBreakpointKey, number>>;

export interface MasonryEntryAnimation {
  /**
   * At least a from- and a to-keyframe.
   *
   * Keyframes must not animate `transform` — that property is owned by the
   * layout engine. Use the independent `translate`, `scale` and `rotate`
   * properties instead, which compose with it rather than replacing it.
   */
  readonly keyframes: readonly MasonryKeyframe[];
  readonly duration: number;
  readonly easing: string;
  /** Delay added per item within a single batch, in milliseconds. */
  readonly stagger: number;
  /** Upper bound on the accumulated stagger, so large batches stay snappy. */
  readonly maxStagger: number;
  /**
   * Animate the first batch of items. Turn this off when server-rendering with
   * the `'columns'` fallback, where items are already painted before hydration.
   */
  readonly animateInitial: boolean;
}

/**
 * Effect played as an item leaves the grid.
 *
 * An item is removed from the DOM by Angular the moment its directive is
 * destroyed, so there is no original element left to animate. The grid instead
 * animates a static clone parked at the item's last position and discards it
 * when the effect finishes — see `exitAnimation` in the README for what that
 * implies.
 */
export interface MasonryExitAnimation {
  /**
   * At least a from- and a to-keyframe. As with entry keyframes, `transform`
   * is reserved for positioning; use `translate`, `scale` or `rotate`.
   */
  readonly keyframes: readonly MasonryKeyframe[];
  readonly duration: number;
  readonly easing: string;
}

export interface MasonryTransition {
  /** Duration of the position transition. `0` disables it. */
  readonly duration: number;
  readonly easing: string;
}

export interface MasonrySsr {
  /**
   * `'columns'` renders a CSS multi-column approximation before hydration so
   * server output is usable and hydration causes no layout shift. `'none'`
   * leaves items in normal flow until the first client layout.
   */
  readonly fallback: 'columns' | 'none';
  /** Column count used by the pre-hydration fallback. */
  readonly columns: number;
}

/** Fully defaulted, validated options as consumed internally. */
export interface ResolvedMasonryGridOptions {
  /**
   * Fixed column count, or a responsive breakpoint map. Mutually exclusive
   * with `columnWidth`. Left unset when neither is given, in which case the
   * column resolver falls back to three columns.
   */
  readonly columns?: number | MasonryBreakpoints;
  /**
   * Target minimum column width in px; the column count is derived from the
   * available width. Mutually exclusive with `columns`.
   */
  readonly columnWidth?: number;
  /**
   * Minimum widths the breakpoint names in `columns` resolve to. Overrides are
   * merged over the defaults, so naming one does not drop the rest, and new
   * names can be added alongside them.
   */
  readonly breakpoints: MasonryBreakpointScale;
  /** When deriving columns from `columnWidth`, grow columns to fill the row. */
  readonly stretchColumns: boolean;
  readonly minColumns: number;
  readonly maxColumns?: number;

  /** Gap in px, used for both axes unless overridden. */
  readonly gutter: number;
  readonly gutterX: number;
  readonly gutterY: number;

  /** Fill row by row instead of always seeking the shortest column. */
  readonly horizontalOrder: boolean;
  readonly direction: 'ltr' | 'rtl';
  /**
   * Which edge items stack from. `'bottom'` anchors the grid to its lower edge
   * and grows upward, the equivalent of `masonry-layout`'s `originTop: false`.
   */
  readonly verticalOrigin: 'top' | 'bottom';
  /** Shrink the container to the width actually occupied by columns. */
  readonly fitWidth: boolean;
  /** Whether breakpoints are matched against the container or the viewport. */
  readonly breakpointBasis: 'container' | 'viewport';

  /**
   * Let the browser lay the grid out with native CSS masonry
   * (`display: grid-lanes`) where it supports it, falling back to the
   * JavaScript engine where it does not.
   *
   * Native layout costs no measurement, no observers and no transforms, and it
   * is applied by an `@supports` rule — so server-rendered HTML is already
   * correct before any JavaScript runs. In exchange the browser owns the
   * packing algorithm, which means `horizontalOrder`, `verticalOrigin`,
   * `fitWidth`, `stretchColumns: false` and stamps have no effect; a
   * development build warns when one of those is set alongside it.
   *
   * Off by default, so a grid lays out identically in every browser until you
   * opt in.
   */
  readonly native: boolean;

  readonly transition: MasonryTransition;
  /** Web Animations entry effect for newly added items, or `false` to disable. */
  readonly entryAnimation: false | MasonryEntryAnimation;
  /** Web Animations exit effect for removed items, or `false` to disable. */
  readonly exitAnimation: false | MasonryExitAnimation;

  /**
   * Run the first layout as soon as the grid initialises. Set `false` to hold
   * the grid on its pre-layout rendering until `layout()` is called — the
   * equivalent of `masonry-layout`'s `initLayout: false`.
   */
  readonly autoLayout: boolean;
  /**
   * React to container resizes. Set `false` to pin the layout to the width it
   * was first measured at — `masonry-layout`'s `resize: false`. Item size
   * changes still trigger a pass.
   */
  readonly observeResize: boolean;
  /** Set the host's height to the laid-out content height. */
  readonly resizeContainer: boolean;
  /** Defer positioning an item until its images have decoded. */
  readonly awaitImages: boolean;
  /**
   * Debounce container resizes by this many ms. `0` coalesces to the next
   * animation frame, which is the right choice for most grids.
   */
  readonly resizeDebounce: number;
  /**
   * Apply `content-visibility: auto` with a measured `contain-intrinsic-size`
   * so off-screen items skip rendering. A large win for very long grids.
   */
  readonly contentVisibility: boolean;

  readonly ssr: MasonrySsr;
}

/**
 * Options as authored by consumers — every field optional, and nested groups
 * accepted partially so an override never has to restate its siblings.
 */
export interface MasonryGridOptions {
  readonly columns?: number | MasonryBreakpoints;
  readonly columnWidth?: number;
  readonly breakpoints?: MasonryBreakpointScale;
  readonly stretchColumns?: boolean;
  readonly minColumns?: number;
  readonly maxColumns?: number;

  readonly gutter?: number;
  readonly gutterX?: number;
  readonly gutterY?: number;

  readonly horizontalOrder?: boolean;
  readonly direction?: 'ltr' | 'rtl';
  readonly verticalOrigin?: 'top' | 'bottom';
  readonly fitWidth?: boolean;
  readonly breakpointBasis?: 'container' | 'viewport';
  readonly native?: boolean;

  readonly transition?: Partial<MasonryTransition>;
  readonly entryAnimation?: false | Partial<MasonryEntryAnimation>;
  readonly exitAnimation?: false | Partial<MasonryExitAnimation>;

  readonly autoLayout?: boolean;
  readonly observeResize?: boolean;
  readonly resizeContainer?: boolean;
  readonly awaitImages?: boolean;
  readonly resizeDebounce?: number;
  readonly contentVisibility?: boolean;

  readonly ssr?: Partial<MasonrySsr>;
}

/** One problem found in a configuration object. */
export interface MasonryOptionIssue {
  /** Dotted path to the offending field, e.g. `ssr.columns`. */
  readonly path: string;
  readonly message: string;
}
