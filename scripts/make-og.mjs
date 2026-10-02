/**
 * Draws the social and cover images from the same words.
 *
 * The card exists because a link with no preview looks like spam. This script
 * exists because the previous card was made by hand, and had "8.6 KB" painted
 * into it — so when the published figure was corrected to 10.4 KB, the image
 * kept saying the old number and nothing noticed. An image built from the same
 * source as the text cannot drift from it that way.
 *
 * It renders HTML in Chromium and screenshots it. Three outputs, one set of
 * words:
 *
 *   projects/demo/public/og.png      1200x630  the Open Graph card, 1.9:1
 *   assets/covers/devto.png          1000x420  dev.to, which crops to ~2.4:1
 *   assets/covers/medium.png         2000x840  the same frame at 2x for Medium,
 *                                              which wants 1500px or wider
 *
 * The two aspect ratios get their own layout rather than one being a crop of
 * the other. 630px of height fits a heading, three lines of prose, two rows of
 * pills and an install line; 420px does not, and cropping the tall one would
 * slice the install line in half.
 *
 * The outputs are committed, so they are not rebuilt on every deploy. Run this
 * when the wording changes.
 *
 *     npm run og
 *
 * Needs Chromium, the same way `npm run verify:native` does:
 *
 *     npm i --no-save playwright && npx playwright install chromium
 *
 * The font is Inter, read from the `@fontsource/inter` devDependency and
 * embedded in the page. Loading it from a CDN instead would make the images
 * depend on the network and on whatever the font host serves that day; reading
 * a file npm has pinned gives the same picture every time.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = join(ROOT, 'node_modules/@fontsource/inter/files');

/* ---- the words, which are the only thing that should ever need editing ---- */

const TITLE = 'masonry-angular';
const BLURB =
  'Cascading grid layout for Angular. For photo walls, and for dashboards that stop leaving gaps.';
const PILLS = ['Zero dependencies', '10.4 KB', 'Angular 17–22', 'SSR-safe'];
const INSTALL = 'npm i masonry-angular';

/*
 * The tiles on the right are the library's own argument: equal widths, unequal
 * heights, each one starting where the shortest column ended. The hues walk
 * around the wheel so that no tile reads as meaning anything. Heights are given
 * for a 630px frame and scaled for the others, so the composition stays the
 * same shape at every size.
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

/* ---- the three outputs ----------------------------------------------------- */

const OUTPUTS = [
  { file: 'projects/demo/public/og.png', width: 1200, height: 630, scale: 1, layout: 'tall', bleed: 1 },
  { file: 'assets/covers/devto.png', width: 1000, height: 420, scale: 1, layout: 'wide', bleed: 1.18 },
  { file: 'assets/covers/medium.png', width: 1000, height: 420, scale: 2, layout: 'wide', bleed: 1.18 },
];

/*
 * Two compositions. Shared: the palette, the font, the flex split between words
 * and tiles. Different: every size, because a 2.4:1 frame has barely two thirds
 * the height to work with and the type has to come down with it.
 */
const LAYOUTS = {
  tall: `
    .copy{flex:none;width:632px;padding:92px 0 0 70px}
    h1{font-size:67px;letter-spacing:-.035em}
    p{margin-top:42px;max-width:520px;font-size:28px}
    .pills{max-width:520px;margin-top:46px;gap:13px}
    .pill{padding:9px 19px;font-size:19px}
    .install{margin-top:30px;width:565px;height:54px;padding:0 20px;font-size:19px;border-radius:11px}
    .grid{gap:17px;padding:32px 36px 0 0}
    .col{gap:17px}
    .tile{border-radius:13px}
  `,
  /*
   * The words are centred vertically here rather than pinned to the top. At this
   * height a top-aligned block leaves a band of empty background under the
   * install line that reads as a mistake.
   */
  wide: `
    .copy{flex:none;display:flex;flex-direction:column;justify-content:center;
          width:560px;padding:0 0 0 52px}
    h1{font-size:50px;letter-spacing:-.035em}
    p{margin-top:20px;max-width:450px;font-size:20px}
    .pills{max-width:508px;margin-top:24px;gap:9px}
    .pill{padding:6px 14px;font-size:15px}
    .install{margin-top:20px;width:400px;height:42px;padding:0 15px;font-size:15px;border-radius:9px}
    .grid{gap:12px;padding:22px 26px 0 0}
    .col{gap:12px}
    .tile{border-radius:10px}
  `,
};

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

const FONT_CSS = `${face(400)}\n${face(700)}`;

function html({ width, height, layout, bleed }) {
  // Tile heights are authored against a 630px frame. `bleed` pushes them past
  // the bottom edge: scaling by height alone leaves the shortest column ending
  // inside the frame, with a band of background beneath it that looks like the
  // image failed to load rather than like a grid that carries on.
  const k = (height / 630) * bleed;
  const tiles = COLUMNS.map(
    (column) =>
      `<div class="col">${column
        .map(
          ({ h, hue }) =>
            `<div class="tile" style="height:${Math.round(h * k)}px;background:linear-gradient(145deg,hsl(${hue} 68% 60%),hsl(${hue + 34} 66% 50%))"></div>`,
        )
        .join('')}</div>`,
  ).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${width}px;height:${height}px;overflow:hidden;background:#fafaf9;color:#1a1a17;
     font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;display:flex}
h1{font-weight:700;line-height:1}
p{line-height:1.36;color:#4d4d46}
.pills{display:flex;flex-wrap:wrap}
.pill{border:1px solid #dcdcd6;border-radius:999px;background:#fff;color:#3b3b35;white-space:nowrap}
.install{display:flex;align-items:center;border:1px solid #dcdcd6;background:#fff;
         font-family:"DejaVu Sans Mono",ui-monospace,monospace;color:#3b3b35}
/* The right padding matters: without it the third column is sliced off by the
   frame edge, which reads as a rendering bug rather than a design. */
.grid{flex:1;display:flex}
.col{flex:1;display:flex;flex-direction:column}
${LAYOUTS[layout]}
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
}

const work = mkdtempSync(join(tmpdir(), 'og-'));
const browser = await playwright.chromium.launch(
  process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {},
);

console.log('make-og — rendering from one set of words.\n');

for (const out of OUTPUTS) {
  const file = join(ROOT, out.file);
  mkdirSync(dirname(file), { recursive: true });

  const source = join(work, `${out.layout}-${out.scale}.html`);
  writeFileSync(source, html(out));

  const page = await browser.newPage({
    viewport: { width: out.width, height: out.height },
    deviceScaleFactor: out.scale,
  });
  await page.goto(`file://${source}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file });
  await page.close();

  const kb = (readFileSync(file).length / 1024).toFixed(0);
  const px = `${out.width * out.scale}x${out.height * out.scale}`;
  console.log(`  ${relative(ROOT, file).padEnd(34)} ${px.padStart(9)}  ${kb.padStart(4)} KB`);
}

await browser.close();
rmSync(work, { recursive: true, force: true });

console.log(`\n  pills: ${PILLS.join(' · ')}`);
