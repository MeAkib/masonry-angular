import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * Every route is rendered once at build time and written as a static HTML file.
 *
 * `RenderMode.Prerender` is what keeps this a static deployment: there is no
 * server in production, and Vercel serves the generated files from its CDN. The
 * alternative, `RenderMode.Server`, would need a Node process per request —
 * which this site has no reason to pay for, because none of these pages depend
 * on anything that changes between requests.
 */
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Prerender }];
