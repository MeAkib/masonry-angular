/**
 * Turns the `__SITE_URL__` placeholders in the built `index.html` into the real
 * deployed origin.
 *
 * Open Graph needs an *absolute* URL for `og:image` — a relative one is ignored
 * without complaint, and the result is a shared link that shows no preview at
 * all. Since the URL is not known until the site is deployed, the source keeps
 * a placeholder and this fills it in after the build.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the right variable: Vercel documents it as
 * always set, even on preview deployments, specifically so that OG image URLs
 * point at production. It carries no scheme, so `https://` is added here.
 *
 * npm runs this automatically after `npm run build`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = resolve(ROOT, 'dist/demo/browser/index.html');

/** Only used when building outside Vercel, so local builds still produce valid URLs. */
const FALLBACK = 'https://masonry-angular.vercel.app';

const domain = process.env['VERCEL_PROJECT_PRODUCTION_URL'];
const origin = domain ? `https://${domain}` : FALLBACK;

if (!existsSync(INDEX)) {
  console.error(`inject-meta — no build output at ${INDEX}. Run "npm run build" first.`);
  process.exit(1);
}

const before = readFileSync(INDEX, 'utf8');
const after = before.replaceAll('__SITE_URL__', origin);
const replaced = before.split('__SITE_URL__').length - 1;

if (replaced === 0) {
  console.error(
    'inject-meta — found no __SITE_URL__ placeholders in the built index.html.\n' +
      '  The social preview tags are probably missing or renamed; a shared link\n' +
      '  would show no preview card. Check projects/demo/src/index.html.',
  );
  process.exit(1);
}

writeFileSync(INDEX, after);
console.log(
  `inject-meta — ${replaced} placeholder(s) -> ${origin}` +
    (domain ? '' : '  (VERCEL_PROJECT_PRODUCTION_URL unset, used the fallback)'),
);
