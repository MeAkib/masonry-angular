/**
 * The single source of truth for every option default.
 *
 * `parse.ts` fills unset fields from this object, and a test asserts it stays
 * in step with `ResolvedMasonryGridOptions` in `../models/options`.
 */
import type { MasonryBreakpointScale, ResolvedMasonryGridOptions } from '../models/options';

/**
 * The named breakpoints, in px. These are the widely used Tailwind values, so a
 * grid written against `lg` lines up with the rest of a typical application's
 * responsive design. Override any subset with the `breakpoints` option.
 */
export const DEFAULT_MASONRY_BREAKPOINTS: MasonryBreakpointScale = Object.freeze({
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
});

/** Every option at its default value. */
export const DEFAULT_MASONRY_GRID_OPTIONS: ResolvedMasonryGridOptions = Object.freeze({
  columns: undefined,
  columnWidth: undefined,
  breakpoints: DEFAULT_MASONRY_BREAKPOINTS,
  stretchColumns: true,
  minColumns: 1,
  maxColumns: undefined,

  gutter: 16,
  gutterX: 16,
  gutterY: 16,

  horizontalOrder: false,
  direction: 'ltr',
  verticalOrigin: 'top',
  fitWidth: false,
  breakpointBasis: 'container',

  transition: Object.freeze({
    duration: 300,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  }),
  entryAnimation: Object.freeze({
    keyframes: Object.freeze([
      Object.freeze({ opacity: 0, translate: '0 12px', scale: '0.98' }),
      Object.freeze({ opacity: 1, translate: 'none', scale: '1' }),
    ]),
    duration: 280,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    stagger: 24,
    maxStagger: 200,
    animateInitial: true,
  }),
  exitAnimation: Object.freeze({
    keyframes: Object.freeze([
      Object.freeze({ opacity: 1, scale: '1' }),
      Object.freeze({ opacity: 0, scale: '0.96' }),
    ]),
    duration: 200,
    easing: 'cubic-bezier(0.4, 0, 1, 1)',
  }),

  autoLayout: true,
  observeResize: true,
  resizeContainer: true,
  awaitImages: true,
  resizeDebounce: 0,
  contentVisibility: false,

  ssr: Object.freeze({
    fallback: 'columns',
    columns: 2,
  }),
} satisfies ResolvedMasonryGridOptions);
