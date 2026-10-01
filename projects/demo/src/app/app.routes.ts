import type { Routes } from '@angular/router';

export const routes: Routes = [
  /*
   * The gallery is the home page, not a redirect to one. `redirectTo` prerenders
   * as a meta-refresh stub with no content and no social tags, which would leave
   * the site's main URL with no preview card and nothing for a crawler to read.
   * `/gallery` is kept working by a permanent redirect in vercel.json.
   */
  {
    path: '',
    pathMatch: 'full',
    title: 'masonry-angular — cascading grid layout for Angular',
    loadComponent: () => import('./examples/gallery').then((m) => m.GalleryExample),
  },
  {
    path: 'spans',
    title: 'Spans & stamps — masonry-angular',
    loadComponent: () => import('./examples/spans').then((m) => m.SpansExample),
  },
  {
    path: 'dashboard',
    title: 'Dashboard — masonry-angular',
    loadComponent: () => import('./examples/dashboard').then((m) => m.DashboardExample),
  },
  {
    path: 'dynamic',
    title: 'Dynamic items — masonry-angular',
    loadComponent: () => import('./examples/dynamic').then((m) => m.DynamicExample),
  },
  {
    path: 'performance',
    title: 'Performance — masonry-angular',
    loadComponent: () => import('./examples/performance').then((m) => m.PerformanceExample),
  },
  { path: '**', redirectTo: '' },
];
