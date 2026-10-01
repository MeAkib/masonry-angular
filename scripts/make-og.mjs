/**
 * Draws the Open Graph card at projects/demo/public/og.png.
 *
 * The card exists because a link to the site with no preview looks like spam.
 * This script exists because the previous card was made by hand, and had "8.6
 * KB" painted into it — so when the published figure was corrected to 10.4 KB,
 * the image kept saying the old number and nothing noticed. An image built from
 * the same source as the text cannot drift from it that way.
 *
 * It renders HTML in Chromium at exactly 1200x630 — the size every platform
 * crops to — and screenshots it. The output is committed, so the card is not
 * rebuilt on every deploy; run this when the wording changes.
 *
 *     npm run og
 *
 * Needs Chromium, the same way `npm run verify:native` does:
 *
 *     npm i --no-save playwright && npx playwright install chromium
 *
 * The font is Inter, read from the `@fontsource/inter` devDependency and
 * embedded in the page. Loading it from a CDN instead would make the card
 * depend on the network and on whatever the font host serves that day; reading
 * a file that npm pinned gives the same picture every time.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'projects/demo/public/og.png');
const FONTS = join(ROOT, 'node_modules/@fontsource/inter/files');

/* ---- the words, which are the only thing that should ever need editing ---- */

const TITLE = 'masonry-angular';
const BLURB = 'Cascading grid layout for Angular. For photo walls, and for dashboards that stop leaving gaps.';
const PILLS = ['Zero dependencies', '10.4 KB', 'Angular 17–22', 'SSR-safe'];
const INSTALL = 'npm i masonry-angular';

/*
 * The tiles on the right are the library's own argument: equal widths, unequal
 * heights, each one starting where the shortest column ended. The hues walk
 * around the wheel so no tile reads as meaning anything.
 */
const COLUMNS = [
  [
    { h: 152, hue: 24 },
    { h: 236, hue: 68 },
    { h: 128, hue: 136 },
  ],
  [
    { h: 194, hue: 158 },
    { h: 180, hue: 212 },
    { h: 210, hue: 262 },
  ],
  [
    { h: 148, hue: 296 },
    { h: 216, hue: 348 },
    { h: 122, hue: 34 },
    { h: 90, hue: 76 },
  ],
];

/* -------------------------------------------------------------------------- */

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.error('make-og — playwright is not installed.\n');
  console.error('  npm i --no-save playwright && npx playwright install chromium\n');
  process.exit(1);
}

if (!existsSync(FONTS)) {
  console.error(`make-og — no fonts at ${FONTS}. Run "npm install" first.`);
  process.exit(1);
}

const face = (weight) => {
  const file = join(FONTS, `inter-latin-${weight}-normal.woff2`);
  if (!existsSync(file)) {
    console.error(`make-og — missing ${file}. Has @fontsource/inter changed its layout?`);
    process.exit(1);
  }
  return `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2')}`;
};

const tiles = COLUMNS.map(
  (column) =>
    `<div class="col">${column
      .map(
        ({ h, hue }) =>
          `<div class="tile" style="height:${h}px;background:linear-gradient(145deg,hsl(${hue} 68% 60%),hsl(${hue + 34} 66% 50%))"></div>`,
      )
      .join('')}</div>`,
).join('');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${face(400)}
${face(700)}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#fafaf9;color:#1a1a17;
     font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;display:flex}

.copy{flex:none;width:632px;padding:92px 0 0 70px}
h1{font-size:67px;font-weight:700;letter-spacing:-.035em;line-height:1}
p{margin-top:42px;max-width:520px;font-size:28px;line-height:1.36;color:#4d4d46}

.pills{display:flex;flex-wrap:wrap;gap:13px;max-width:520px;margin-top:46px}
.pill{padding:9px 19px;border:1px solid #dcdcd6;border-radius:999px;background:#fff;
      font-size:19px;color:#3b3b35;white-space:nowrap}

.install{display:flex;align-items:center;margin-top:30px;width:565px;height:54px;padding:0 20px;
         border:1px solid #dcdcd6;border-radius:11px;background:#fff;
         font-family:"DejaVu Sans Mono",ui-monospace,monospace;font-size:19px;color:#3b3b35}

/* The right padding matters: without it the third column is sliced off by the
   1200px edge, which reads as a rendering bug rather than a design. */
.grid{flex:1;display:flex;gap:17px;padding:32px 36px 0 0}
.col{flex:1;display:flex;flex-direction:column;gap:17px}
.col:nth-child(2){padding-top:0}
.tile{border-radius:13px}
</style></head>
<body>
  <div class="copy">
    <h1>${TITLE}</h1>
    <p>${BLURB}</p>
    <div class="pills">${PILLS.map((p) => `<span class="pill">${p}</span>`).join('')}</div>
    <div class="install">${INSTALL}</div>
  </div>
  <div class="grid">${tiles}</div>
</body></html>
`;

const work = mkdtempSync(join(tmpdir(), 'og-'));
const page_html = join(work, 'og.html');
writeFileSync(page_html, html);

const browser = await playwright.chromium.launch(
  process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`file://${page_html}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT });
await browser.close();
rmSync(work, { recursive: true, force: true });

const bytes = readFileSync(OUT).length;
console.log(`make-og — ${OUT}`);
console.log(`  1200x630, ${(bytes / 1024).toFixed(0)} KB`);
console.log(`  pills: ${PILLS.join(' · ')}`);
