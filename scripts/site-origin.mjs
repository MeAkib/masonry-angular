/**
 * The origin the built site is deployed at.
 *
 * Two scripts need this — `inject-meta.mjs` for the social and canonical tags,
 * `make-sitemap.mjs` for the sitemap — and a URL rule kept in two places is a
 * URL rule that will eventually disagree with itself.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is documented as always set, including on
 * preview deployments, precisely so that absolute URLs point at production. It
 * carries no scheme.
 */

/** Used when building outside Vercel, so local builds still produce valid URLs. */
const FALLBACK = 'https://masonry-angular.vercel.app';

export const domain = process.env['VERCEL_PROJECT_PRODUCTION_URL'];
export const origin = domain ? `https://${domain}` : FALLBACK;
export const isFallback = !domain;
