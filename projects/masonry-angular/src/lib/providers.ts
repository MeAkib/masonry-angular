import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import type { MasonryGridOptions } from './models';
import { parseMasonryGridOptions } from './schemas/parse';

/**
 * Application-wide grid defaults. Component-level `[options]` layer on top of
 * whatever is provided here.
 */
export const NG_MASONRY_GRID_DEFAULTS = new InjectionToken<MasonryGridOptions>(
  'NG_MASONRY_GRID_DEFAULTS',
  {
    providedIn: 'root',
    factory: (): MasonryGridOptions => ({}),
  },
);

/**
 * Register default options for every grid in the application.
 *
 * The defaults are validated eagerly, so a typo surfaces at bootstrap with a
 * precise message rather than as a silently ignored option at render time.
 *
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [provideNgMasonryGrid({ gutter: 24, columns: { 0: 1, 768: 2, 1200: 4 } })],
 * });
 * ```
 */
export function provideNgMasonryGrid(defaults: MasonryGridOptions): EnvironmentProviders {
  parseMasonryGridOptions(defaults);
  return makeEnvironmentProviders([{ provide: NG_MASONRY_GRID_DEFAULTS, useValue: defaults }]);
}
