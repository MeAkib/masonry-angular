/**
 * Turning what the developer wrote into what the grid reads.
 *
 * A grid can be configured from three places at once, and they layer:
 *
 *   1. application defaults, from `provideNgMasonryGrid(...)`
 *   2. the `[options]` input on this grid
 *   3. the shorthand inputs: `columns`, `columnWidth`, `gutter`, `gutterX`, `gutterY`
 *
 * Later sources win. This file merges those three, validates the result (in
 * development only), and fills in every unset field from the defaults — so the
 * rest of the library never has to think about `undefined` or precedence again.
 */

import type { MasonryGridOptions, ResolvedMasonryGridOptions } from '../models';
import {
  DEFAULT_MASONRY_GRID_OPTIONS,
  masonryOptionsEqual,
  mergeMasonryGridOptions,
  parseMasonryGridOptions,
} from '../schemas/parse';

/**
 * Accept a shorthand input written as a plain HTML attribute.
 *
 * `columns="3"` gives us the string `"3"`, while `[columns]="3"` gives us the
 * number `3` and `[columns]="{ '0': 1, '768': 3 }"` gives us an object. All three
 * have to end up as something the validator understands, and that is all this
 * does.
 *
 * A string that is not a number is passed through untouched on purpose. It is
 * a mistake, but reporting it here would mean a vague message with no field
 * name; letting it reach the validator gets the developer a precise one.
 */
export function coerceShorthand<T>(value: T | string | undefined | null): T | number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : (value as unknown as number);
}

/**
 * Merges the three configuration sources, and remembers its last answer.
 *
 * The remembering matters more than it looks. Writing `[options]="{ gutter: 16 }"`
 * in a template creates a **brand new object on every change detection run**,
 * even though nothing about it changed. Without the cache, every run would look
 * like a configuration change and queue a pointless layout pass.
 *
 * So `resolve()` compares the merged input field by field, and when nothing has
 * really changed it returns *the exact same object it returned last time*.
 * Angular's signals compare with `Object.is`, so an identical reference reads
 * as "no change" and nothing downstream recomputes.
 */
export class GridOptionsResolver {
  private lastMerged: MasonryGridOptions | undefined;
  private hasResolvedOnce = false;
  private lastResolved: ResolvedMasonryGridOptions = DEFAULT_MASONRY_GRID_OPTIONS;

  constructor(private readonly applicationDefaults: MasonryGridOptions) {}

  /**
   * @param fromOptionsInput The `[options]` input, if the developer set one.
   * @param fromShorthands The five shorthand inputs, unset ones left `undefined`.
   */
  resolve(
    fromOptionsInput: MasonryGridOptions | undefined,
    fromShorthands: MasonryGridOptions,
  ): ResolvedMasonryGridOptions {
    const merged = mergeMasonryGridOptions(
      this.applicationDefaults,
      fromOptionsInput,
      fromShorthands,
    );

    if (this.hasResolvedOnce && masonryOptionsEqual(this.lastMerged, merged)) {
      return this.lastResolved;
    }

    this.lastMerged = merged;
    this.hasResolvedOnce = true;
    // Throws in development if anything is wrong; does not run in production.
    this.lastResolved = parseMasonryGridOptions(merged);
    return this.lastResolved;
  }
}
