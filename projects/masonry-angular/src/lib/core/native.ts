/**
 * Native CSS masonry support — `display: grid-lanes`.
 *
 * The CSS Working Group settled on `grid-lanes` as the display type for masonry
 * (CSS Grid Level 3). Safari 26.4 ships it unflagged; Chrome and Firefox have
 * older prototypes behind flags. Where it is available the browser does the
 * whole layout: no measurement, no ResizeObserver on items, no transforms, and
 * — because the decision is made by an `@supports` rule in the stylesheet —
 * server-rendered HTML is already laid out correctly before any JS runs.
 *
 * Detection lives here rather than inline so it is computed once per document
 * and so the SSR guard sits in exactly one place.
 */

import type { ResolvedMasonryGridOptions } from '../models/options';

/** `undefined` until first asked, so the check costs nothing when unused. */
let supported: boolean | undefined;

/**
 * Whether this browser lays the grid out natively.
 *
 * Two spellings are accepted, and they behave identically for everything this
 * library asks of them — `grid-template-columns` defines the strict axis, `gap`
 * spaces the tracks, and `grid-column: span n` widens an item:
 *
 * - `display: grid-lanes` — the syntax the CSS Working Group settled on, and
 *   what Safari 26.4 ships. This is what every browser ends up on.
 * - `display: masonry` — Chromium's earlier prototype, still what Chrome and
 *   Edge expose behind their flag while they migrate to the final name.
 *
 * Firefox's much older `grid-template-rows: masonry` is deliberately not
 * accepted: it is a different mechanism on a regular grid, it is behind a
 * non-default flag, and it is being replaced by `grid-lanes` rather than
 * shipped. Those browsers get the JavaScript engine, which is correct anyway.
 *
 * Always `false` on the server: there is no `CSS` object there, and the answer
 * would be about the wrong machine. The stylesheet's `@supports` rules are what
 * make server output correct — this function only decides whether the
 * JavaScript engine has to step in.
 */
export function supportsNativeMasonry(): boolean {
  if (supported !== undefined) return supported;
  supported =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('display', 'grid-lanes') || CSS.supports('display', 'masonry'));
  return supported;
}

/** @internal Test seam. Pass `undefined` to restore real feature detection. */
export function setNativeMasonrySupportForTesting(value: boolean | undefined): void {
  supported = value;
}

/**
 * The `grid-template-columns` value for a native grid.
 *
 * `columnWidth` maps straight onto `auto-fill` + `minmax`, which is the whole
 * responsive story in one declaration — no breakpoints, no measurement, and it
 * keeps working while the container resizes without JS being involved at all.
 * A fixed count maps onto `repeat(n, 1fr)`.
 *
 * `resolvedColumns` is only consulted for a breakpoint map, where the count
 * cannot be expressed in a single static declaration; the grid measures the
 * container and passes the matched count in.
 */
export function nativeTemplateColumns(
  options: ResolvedMasonryGridOptions,
  resolvedColumns: number,
): string {
  const { columnWidth, columns } = options;

  if (columnWidth !== undefined) {
    // `min(100%, …)` keeps a single narrow column from overflowing its container.
    return `repeat(auto-fill, minmax(min(100%, ${columnWidth}px), 1fr))`;
  }
  const count = typeof columns === 'number' ? columns : resolvedColumns;
  return `repeat(${Math.max(1, Math.round(count))}, 1fr)`;
}

/**
 * Whether a native grid's column count can change without JS.
 *
 * A `columnWidth` grid and a fixed-count grid are both fully described by their
 * `grid-template-columns` declaration. A breakpoint map is not, so the grid
 * keeps one container observer alive to re-evaluate it.
 */
export function nativeColumnsAreStatic(options: ResolvedMasonryGridOptions): boolean {
  return options.columnWidth !== undefined || typeof options.columns !== 'object';
}

/**
 * Options that the native layout cannot honour, as a dev-mode message, or
 * `undefined` when the configuration maps cleanly.
 *
 * These are not errors: the grid still renders, it just ignores the option. The
 * warning exists so nobody spends an afternoon wondering why `fitWidth` stopped
 * doing anything after they turned `native` on.
 */
export function nativeUnsupportedOptions(
  options: ResolvedMasonryGridOptions,
  hasStamps: boolean,
): string | undefined {
  const ignored: string[] = [];
  if (options.horizontalOrder) ignored.push('`horizontalOrder`');
  if (options.verticalOrigin === 'bottom') ignored.push("`verticalOrigin: 'bottom'`");
  if (options.fitWidth) ignored.push('`fitWidth`');
  if (options.stretchColumns === false) ignored.push('`stretchColumns: false`');
  if (hasStamps) ignored.push('`masonryGridStamp`');
  if (ignored.length === 0) return undefined;
  return (
    `[masonry-angular] The browser is laying this grid out natively (\`display: grid-lanes\`), ` +
    `which does not support ${ignored.join(', ')}. ` +
    'Set `native: false` to force the JavaScript engine, which does.'
  );
}
