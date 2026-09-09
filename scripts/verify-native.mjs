/**
 * Verifies the native CSS masonry path against a real browser engine.
 *
 * The `native: true` path is the one thing unit tests cannot prove: jsdom has no
 * layout, so a test can only assert that the library *stays out of the way* —
 * not that the CSS it hands the browser produces a masonry grid. This script
 * closes that gap. It pulls the component's compiled stylesheet straight out of
 * the built bundle (never a hand-copy, so the two cannot drift), renders items
 * of known heights, and checks the geometry the browser actually computed.
 *
 * Run it after `npm run build:lib`:
 *
 *     npm run verify:native
 *
 * It needs Playwright's Chromium, which is not a dependency of this package:
 *
 *     npx playwright install chromium
 *
 * Chromium exposes the feature behind a flag and under its earlier
 * `display: masonry` spelling; Safari 26.4+ ships the final `display:
 * grid-lanes`. The library's stylesheet carries both, so this script exercises
 * whichever the local browser understands, and exits 0 with a note if it has
 * neither.
 */
import { readFileSync } from 'node:fs';

const ITEM_HEIGHTS = [100, 40, 60, 30, 80, 20];
const CONTAINER_WIDTH = 600;
const GUTTER = 10;
const COLUMNS = 3;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('verify:native — skipped: playwright is not installed.');
  console.log('  npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

/** The component's stylesheet, as shipped, rewritten for a plain page. */
function shippedStyles() {
  const fesm = readFileSync('dist/masonry-angular/fesm2022/masonry-angular.mjs', 'utf8');
  const match = /styles:\s*\["((?:[^"\\]|\\.)*)"\]/.exec(fesm);
  if (!match) {
    throw new Error('Could not find the grid stylesheet in the built bundle. Run `npm run build:lib` first.');
  }
  return JSON.parse(`"${match[1]}"`)
    .replace(/:host\(([^)]*)\)/g, '.masonry-grid$1')
    .replace(/:host/g, '.masonry-grid');
}

/** The DOM the grid produces under `native: true`, before any JS has run. */
function page(css) {
  const items = ITEM_HEIGHTS.map(
    (height, i) =>
      `<div class="masonry-item" style="break-inside:avoid;width:100%;height:${height}px">${i + 1}</div>`,
  ).join('');

  return `<style>${css}</style>
    <div style="width:${CONTAINER_WIDTH}px">
      <div class="masonry-grid masonry-grid--native"
           style="--masonry-native-columns: repeat(${COLUMNS}, 1fr);
                  --masonry-gutter-x: ${GUTTER}px;
                  --masonry-gutter-y: ${GUTTER}px">${items}</div>
    </div>`;
}

async function measure(html, args) {
  // `CHROMIUM_PATH` lets a CI image point at a browser it already has, rather
  // than downloading a second copy.
  const executablePath = process.env['CHROMIUM_PATH'] || undefined;
  const browser = await chromium.launch({ args, executablePath });
  try {
    const tab = await browser.newPage();
    await tab.setContent(html);
    return await tab.evaluate(() => {
      const grid = document.querySelector('.masonry-grid');
      const origin = grid.getBoundingClientRect();
      const boxes = [...grid.children].map((el) => el.getBoundingClientRect());
      return {
        display: getComputedStyle(grid).display,
        tops: boxes.map((b) => Math.round(b.top - origin.top)),
        lefts: boxes.map((b) => Math.round(b.left - origin.left)),
        widths: boxes.map((b) => Math.round(b.width)),
      };
    });
  } finally {
    await browser.close();
  }
}

const html = page(shippedStyles());
const flags = ['--enable-blink-features=CSSMasonryLayout'];

let native;
try {
  native = await measure(html, flags);
} catch (error) {
  console.log(`verify:native — skipped: could not launch Chromium.\n  ${error.message.split('\n')[0]}`);
  console.log('  npx playwright install chromium   (or set CHROMIUM_PATH)');
  process.exit(0);
}

if (!/masonry|grid-lanes/.test(native.display)) {
  console.log(
    `verify:native — skipped: this Chromium (display: ${native.display}) has neither ` +
      '`grid-lanes` nor `masonry`. Nothing to verify against.',
  );
  process.exit(0);
}

// Items 1-3 fill the first row. Item 4 must land under the *shortest* of them —
// item 2, at 40px — which is the whole difference between masonry and a grid.
const columnWidth = Math.round((CONTAINER_WIDTH - (COLUMNS - 1) * GUTTER) / COLUMNS);
const checks = [
  ['picks a masonry display type', /masonry|grid-lanes/.test(native.display)],
  ['first row starts flush', native.tops.slice(0, 3).every((t) => t === 0)],
  ['item 4 packs under the shortest column', native.tops[3] === ITEM_HEIGHTS[1] + GUTTER],
  ['item 5 packs under the next shortest', native.tops[4] === ITEM_HEIGHTS[2] + GUTTER],
  [`${COLUMNS} columns of equal width`, new Set(native.widths).size === 1],
  ['column width accounts for the gutters', native.widths[0] === columnWidth],
  ['gutter applied between columns', native.lefts[1] - native.lefts[0] === columnWidth + GUTTER],
];

// Without the flag the browser matches no @supports rule, so nothing applies.
const fallback = await measure(html, []);
checks.push([
  'a browser without the feature is left to the JS engine',
  !/masonry|grid-lanes/.test(fallback.display),
]);

console.log(`verify:native — Chromium reports \`display: ${native.display}\`\n`);
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) failed++;
}

if (failed > 0) {
  console.log(`\n  tops:   ${JSON.stringify(native.tops)}`);
  console.log(`  lefts:  ${JSON.stringify(native.lefts)}`);
  console.log(`  widths: ${JSON.stringify(native.widths)}`);
  console.log(`\n${failed} check(s) failed.`);
}
process.exit(failed > 0 ? 1 : 0);
