/**
 * Writes `sitemap.xml` from the pages the build actually prerendered.
 *
 * Deriving it from the output rather than from a hand-kept list is the whole
 * point: a route that was added but not prerendered cannot appear in the
 * sitemap, and a sitemap entry cannot point at a page that does not exist. Both
 * failures are silent otherwise — a crawler fetches the URL, gets a shell or a
 * 404, and nothing in the build complains.
 *
 * `index.csr.html` is excluded. It is the client-side-rendering shell Angular
 * emits for a static build, has no content of its own, and is not a page anyone
 * should land on.
 *
 * npm runs this automatically after `npm run build`.
 */
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { origin } from './site-origin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist/demo/browser');

if (!existsSync(OUT)) {
  console.error(`make-sitemap — no build output at ${OUT}. Run "npm run build" first.`);
  process.exit(1);
}

function pages(dir = OUT) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...pages(full));
    else if (name === 'index.html') found.push(relative(OUT, full));
  }
  return found;
}

/** `gallery/index.html` is served at `/gallery`; the root one at `/`. */
const routeOf = (file) => {
  const parts = file.split(sep).slice(0, -1);
  return parts.length ? `/${parts.join('/')}` : '/';
};

const routes = pages().map(routeOf).sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));

if (routes.length === 0) {
  console.error('make-sitemap — the build prerendered no pages. Is outputMode "static" still set?');
  process.exit(1);
}

/*
 * One date for the whole sitemap, taken from the most recently modified page.
 * Per-page git timestamps would be more precise but are not available on
 * Vercel, which clones at a shallow depth.
 */
const newest = pages()
  .map((f) => statSync(join(OUT, f)).mtime)
  .sort((a, b) => b - a)[0];
const lastmod = newest.toISOString().slice(0, 10);

const body = routes
  .map(
    (route) =>
      '  <url>\n' +
      `    <loc>${origin}${route === '/' ? '/' : route}</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      // The home page is the gallery itself now, so it is the one to prefer.
      `    <priority>${route === '/' ? '1.0' : '0.7'}</priority>\n` +
      '  </url>',
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

writeFileSync(join(OUT, 'sitemap.xml'), xml);

console.log(`make-sitemap — ${routes.length} page(s) at ${origin}`);
for (const route of routes) console.log(`  ${route}`);
