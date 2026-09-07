import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideNgMasonryGrid } from 'masonry-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),

    // Application-wide grid defaults. Individual grids layer their own options
    // on top; these are validated eagerly, so a typo fails at bootstrap.
    provideNgMasonryGrid({
      gutter: 16,
      transition: { duration: 260 },
    }),
  ],
};
