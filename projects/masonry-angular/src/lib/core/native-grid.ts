/**
 * The path where the browser does the layout and this library does nothing.
 *
 * CSS grew a real masonry layout — `display: grid-lanes`, from CSS Grid Level 3.
 * When the browser has it and `native: true` is set, everything in the rest of
 * this folder switches off: no measuring, no `ResizeObserver` on items, no
 * transforms, no waiting for images. The browser reflows on resize, on content
 * changes and on image loads by itself, far better than we can.
 *
 * The switch is an `@supports` rule in the component's stylesheet, not an `if`
 * in JavaScript, and that is deliberate. A CSS rule applies to server-rendered
 * HTML on first paint — so the page arrives already laid out, with nothing to
 * hydrate and nothing to shift. JavaScript feature-detects too, but only to
 * answer a different question: *should the fallback engine run?*
 *
 * This file holds the small amount of work that is left over. See `native.ts`
 * for the feature detection and the `grid-template-columns` it produces.
 */

import type { ResolvedMasonryGridOptions } from '../models';
import { resolveColumnGeometry, resolveFallbackColumns } from './column-resolver';
import { nativeColumnsAreStatic } from './native';

/**
 * How many columns a native grid actually resolved to.
 *
 * Only a `columnWidth` grid needs this. `repeat(auto-fill, ...)` means the
 * browser decides the count, and the computed `grid-template-columns` is the
 * only place that decision is visible. One read of an already-computed value,
 * once per pass, and it is reported to the application rather than acted on.
 */
export function countNativeColumns(element: HTMLElement): number {
  if (typeof getComputedStyle !== 'function') return 0;
  const template = getComputedStyle(element).gridTemplateColumns;
  if (!template || template === 'none') return 0;
  return template.split(/\s+/).filter((track) => track.length > 0).length;
}

/**
 * Work out the column count to report, by whichever route applies.
 *
 * There are three, and only the middle one costs anything:
 *
 * - a fixed `columns: 4` — we already know the answer,
 * - a breakpoint map — needs the container width, which is why that case is the
 *   only one that keeps a `ResizeObserver` alive,
 * - a `columnWidth` — the browser decided; read it back.
 */
export function resolveNativeColumns(
  element: HTMLElement,
  options: ResolvedMasonryGridOptions,
  containerWidth: number,
  viewportWidth: number,
): number {
  const fallback = resolveFallbackColumns(options);

  if (!nativeColumnsAreStatic(options)) {
    const basis = options.breakpointBasis === 'viewport' ? viewportWidth : containerWidth;
    return resolveColumnGeometry(containerWidth, basis, options).columns;
  }

  if (typeof options.columns === 'number') return options.columns;

  return countNativeColumns(element) || fallback;
}
