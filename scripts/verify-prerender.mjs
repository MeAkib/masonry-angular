/**
 * Checks that every route was prerendered and that the HTML actually contains
 * the page's text.
 *
 * This guards a failure that is invisible from the outside. AI crawlers do not
 * execute JavaScript — GPTBot, ClaudeBot, PerplexityBot and the search-time
 * crawlers read whatever HTML the server returns and nothing more. A
 * client-rendered Angular app returns an empty `<app-root></app-root>`, so the
 * site looks complete in a browser and blank to every model. The site shipped
 * that way for weeks.
 *
 * Prerendering fixes it, but it can regress quietly in two ways, and a human
 * visiting the site would notice neither:
 *
 *   1. A route is added to `app.routes.ts` and the build does not prerender it,
 *      so that one page falls back to client rendering.
 *   2. `outputMode: 'static'` or the `server` entry is dropped from
 *      `angular.json`, and every page goes back to being a shell.
 *
 * So this reads the routes out of the source, insists on a file for each, and
 * insists that each file contains real text rather than markup alone.
 *
 *     npm run verify:prerender        (after npm run build)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist/demo/browser');
const ROUTES = join(ROOT, 'projects/demo/src/app/app.routes.ts');

/**
 * Below this many characters of visible text a page is a shell, not a page. The
 * real pages are 1,500–4,000 characters; an unrendered shell is under 100, all
 * of it from the `<title>`.
 */
const MIN_TEXT = 600;

if (!existsSync(OUT)) {
  console.error(`verify:prerender — no build output at ${OUT}. Run "npm run build" first.`);
  process.exit(1);
}

/** The concrete paths in the router config: not '' and not the '**' catch-all. */
function declaredRoutes() {
  const source = readFileSync(ROUTES, 'utf8');
  const paths = [...source.matchAll(/path:\s*'([^']*)'/g)].map((m) => m[1]);
  const concrete = paths.filter((p) => p !== '' && p !== '**');
  if (concrete.length === 0) {
    console.error(`verify:prerender — found no routes in ${ROUTES}. Has the file moved?`);
    process.exit(1);
  }
  return concrete;
}

/** Visible text only: no script bodies, no style bodies, no tags. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const expected = ['', ...declaredRoutes()];
const problems = [];

console.log('verify:prerender — every route must ship its text as HTML.\n');

for (const route of expected) {
  const file = route === '' ? 'index.html' : `${route}/index.html`;
  const full = join(OUT, file);
  const label = (route === '' ? '/' : `/${route}`).padEnd(14);

  if (!existsSync(full)) {
    problems.push(`${file} was not prerendered — a crawler gets a client-rendered shell for /${route}`);
    console.log(`  MISSING  ${label}`);
    continue;
  }

  const chars = visibleText(readFileSync(full, 'utf8')).length;
  if (chars < MIN_TEXT) {
    problems.push(`${file} has only ${chars} characters of text, which is a shell, not a page`);
    console.log(`  EMPTY    ${label} ${chars} chars`);
    continue;
  }

  console.log(`  OK       ${label} ${String(chars).padStart(5)} chars`);
}

// A sitemap that points at pages which do not exist is worse than none.
const sitemap = join(OUT, 'sitemap.xml');
if (!existsSync(sitemap)) {
  problems.push('sitemap.xml is missing — scripts/make-sitemap.mjs did not run');
} else {
  const locs = [...readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  console.log(`\n  sitemap.xml lists ${locs.length} page(s)`);
  if (locs.length !== expected.length) {
    problems.push(`sitemap.xml lists ${locs.length} pages but there are ${expected.length} routes`);
  }
  if (locs.some((l) => l.includes('__SITE_URL__'))) {
    problems.push('sitemap.xml still contains __SITE_URL__ — inject-meta.mjs did not run');
  }
}

// robots.txt has to be served, and its placeholder has to be gone.
const robots = join(OUT, 'robots.txt');
if (!existsSync(robots)) {
  problems.push('robots.txt is missing from the build output');
} else if (readFileSync(robots, 'utf8').includes('__SITE_URL__')) {
  problems.push('robots.txt still contains __SITE_URL__ — inject-meta.mjs did not run');
}

if (problems.length > 0) {
  console.log('\nFAIL');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}

console.log('\nOK — every route is prerendered with its text, and the sitemap matches.');
