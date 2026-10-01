/**
 * Turns the `__SITE_URL__` placeholders in the built site into the real deployed
 * origin, and gives every prerendered page its own canonical URL.
 *
 * Open Graph needs an *absolute* URL for `og:image` — a relative one is ignored
 * without complaint, and the result is a shared link that shows no preview at
 * all. Since the origin is not known until the site is deployed, the source
 * keeps a placeholder and this fills it in after the build.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the right variable: Vercel documents it as
 * always set, even on preview deployments, specifically so that OG image URLs
 * point at production. It carries no scheme, so `https://` is added here.
 *
 * Since the demo became a prerendered site there is one HTML file per route, not
 * one in total. Each gets the origin, and — this is the part a blanket replace
 * would get wrong — `canonical` and `og:url` are pointed at that page rather
 * than at the home page. Five pages all claiming to be the same canonical URL is
 * a way to ask a search engine to index one of them.
 *
 * `robots.txt` is patched too, because it has to name the sitemap absolutely.
 *
 * npm runs this automatically after `npm run build`.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isFallback, origin } from './site-origin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist/demo/browser');
const PLACEHOLDER = '__SITE_URL__';

if (!existsSync(OUT)) {
  console.error(`inject-meta — no build output at ${OUT}. Run "npm run build" first.`);
  process.exit(1);
}

/** Every `.html` file under the output directory, as paths relative to it. */
function htmlFiles(dir = OUT) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...htmlFiles(full));
    else if (name.endsWith('.html')) found.push(relative(OUT, full));
  }
  return found.sort();
}

/**
 * The URL path a prerendered file is served at. `index.html` in a directory is
 * served as that directory, so `gallery/index.html` is `/gallery`.
 */
function routeOf(file) {
  const parts = file.split(sep);
  const last = parts.pop();
  // The client-side-rendering shell is not a page; it must not claim a canonical
  // URL of its own, or it becomes a second indexable copy of the home page.
  if (last === 'index.csr.html') return '/';
  if (last !== 'index.html') return `/${[...parts, last].join('/')}`;
  return parts.length ? `/${parts.join('/')}` : '/';
}

const files = htmlFiles();
if (files.length === 0) {
  console.error('inject-meta — the build produced no HTML at all.');
  process.exit(1);
}

console.log(`inject-meta — ${origin}${isFallback ? '  (VERCEL_PROJECT_PRODUCTION_URL unset)' : ''}\n`);

let total = 0;
const withoutPlaceholders = [];

for (const file of files) {
  const full = join(OUT, file);
  const before = readFileSync(full, 'utf8');
  const count = before.split(PLACEHOLDER).length - 1;

  if (count === 0) {
    withoutPlaceholders.push(file);
    continue;
  }

  const route = routeOf(file);
  const self = route === '/' ? `${origin}/` : `${origin}${route}`;

  // The self-referencing tags first, while they still carry the root form, then
  // everything left over (og:image, og:site_name) gets the bare origin.
  const after = before
    .replaceAll(`content="${PLACEHOLDER}/"`, `content="${self}"`)
    .replaceAll(`href="${PLACEHOLDER}/"`, `href="${self}"`)
    .replaceAll(PLACEHOLDER, origin);

  writeFileSync(full, after);
  total += count;
  console.log(`  ${route.padEnd(14)} ${String(count).padStart(2)} placeholder(s)  canonical ${self}`);
}

// robots.txt has to name the sitemap with an absolute URL.
const robots = join(OUT, 'robots.txt');
if (existsSync(robots)) {
  const before = readFileSync(robots, 'utf8');
  const count = before.split(PLACEHOLDER).length - 1;
  if (count > 0) {
    writeFileSync(robots, before.replaceAll(PLACEHOLDER, origin));
    total += count;
    console.log(`  robots.txt     ${String(count).padStart(2)} placeholder(s)`);
  }
} else {
  console.error('\ninject-meta — robots.txt is missing from the build output.');
  console.error('  It lives in projects/demo/public and names the sitemap. Without it,');
  console.error('  AI crawlers get no sitemap and no explicit permission.');
  process.exit(1);
}

if (total === 0) {
  console.error(
    `\ninject-meta — found no ${PLACEHOLDER} placeholders anywhere in the build.\n` +
      '  The social preview tags are probably missing or renamed; a shared link\n' +
      '  would show no preview card. Check projects/demo/src/index.html.',
  );
  process.exit(1);
}

if (withoutPlaceholders.length > 0) {
  // Not fatal: index.csr.html is a bare shell by design. Worth naming, because a
  // real page without the tags is a page that shares badly.
  console.log(`\n  no placeholders (expected for the CSR shell): ${withoutPlaceholders.join(', ')}`);
}

console.log(`\ninject-meta — ${total} placeholder(s) replaced across ${files.length} page(s).`);
