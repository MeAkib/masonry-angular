import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'gallery' },
  {
    path: 'gallery',
    title: 'Gallery — masonry-angular',
    loadComponent: () => import('./examples/gallery').then((m) => m.GalleryExample),
  },
  {
    path: 'spans',
    title: 'Spans & stamps — masonry-angular',
    loadComponent: () => import('./examples/spans').then((m) => m.SpansExample),
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
  { path: '**', redirectTo: 'gallery' },
];
