/**
 * Verifies the server-side rendering claim against a real server.
 *
 * Every unit test runs in jsdom, which defines `window`, `document`,
 * `ResizeObserver` and `requestAnimationFrame`. That makes jsdom useless for
 * this particular question: a stray browser call would simply succeed there and
 * nothing would fail. So this script runs under plain Node, with Angular's
 * server platform and none of those globals, and renders a grid for real.
 *
 * It checks two things:
 *
 *   1. Nothing in the library reaches for a browser API while rendering.
 *   2. The HTML the server emits is already a usable page — items in normal
 *      flow, the multi-column fallback applied, nothing hidden and nothing
 *      absolutely positioned. That is what makes hydration free of layout
 *      shift: the browser has something sensible to paint before any JavaScript
 *      arrives, and the first client pass replaces it in one synchronous write.
 *
 * Run it after `npm run build:lib`:
 *
 *     npm run verify:ssr
 *
 * It needs `@angular/platform-server` at the same version as `@angular/core`.
 * If that is not installed the script skips rather than failing, the same way
 * `verify:native` does when Playwright is absent.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(`${ROOT}/package.json`);

function versionOf(pkg) {
  try {
    return require(`${pkg}/package.json`).version;
  } catch {
    return undefined;
  }
}

const core = versionOf('@angular/core');
const server = versionOf('@angular/platform-server');

if (!server) {
  console.log('verify:ssr — skipped: @angular/platform-server is not installed.');
  console.log(`  npm i -D @angular/platform-server@${core ?? '<your @angular/core version>'}`);
  process.exit(0);
}
if (core && server !== core) {
  console.log(`verify:ssr — skipped: @angular/platform-server ${server} does not match @angular/core ${core}.`);
  console.log(`  npm i -D @angular/platform-server@${core}`);
  process.exit(0);
}

// The component needs a decorator, which plain Node cannot parse, so the probe
// is written out and compiled with the workspace's own TypeScript first. It has
// to live inside the workspace, or neither tsc nor Node can resolve `@angular/*`.
const dir = mkdtempSync(`${ROOT}/.ssr-probe-`);

const PROBE = `
declare const process: { exit(code: number): never };
import '@angular/compiler';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { NG_MASONRY_GRID, provideNgMasonryGrid } from '${ROOT}/dist/masonry-angular/fesm2022/masonry-angular.mjs';

const touched: string[] = [];

// A ResizeObserver and a CSS.supports that shout if they are ever used. No
// server provides either, so touching one is a bug the moment a real
// application server-renders a grid.
(globalThis as any).ResizeObserver = class {
  constructor() { touched.push('ResizeObserver'); }
  observe() {} unobserve() {} disconnect() {}
};
(globalThis as any).CSS = { supports: () => { touched.push('CSS.supports'); return false; } };
// Deliberately absent: the scheduler must notice and never queue a pass.
delete (globalThis as any).requestAnimationFrame;

@Component({
  selector: 'ssr-host',
  imports: [NG_MASONRY_GRID],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`
    <masonry-grid [columns]="3" [gutter]="20">
      @for (item of items(); track item) { <article masonryGridItem>{{ item }}</article> }
    </masonry-grid>
    <masonry-grid [columnWidth]="260" [options]="{ native: true }">
      @for (item of items(); track item) { <article masonryGridItem>{{ item }}</article> }
    </masonry-grid>
  \`,
})
class SsrHost { readonly items = signal(['a', 'b', 'c', 'd']); }

const rendered = await renderApplication(
  (context: any) => bootstrapApplication(
    SsrHost,
    { providers: [provideServerRendering(), provideNgMasonryGrid({ gutter: 16 })] },
    context,
  ),
  { document: '<!doctype html><html><head></head><body><ssr-host></ssr-host></body></html>' },
);

const html = /<body[^>]*>([\\s\\S]*)<\\/body>/.exec(rendered)?.[1] ?? '';

const checks: [string, boolean][] = [
  ['renders without throwing', true],
  ['survives with no requestAnimationFrame in existence', true],
  ['never constructs a ResizeObserver', !touched.includes('ResizeObserver')],
  ['never calls CSS.supports', !touched.includes('CSS.supports')],
  ['emits the grid and every item', /<masonry-grid/.test(html) && (html.match(/masonry-item/g) ?? []).length === 8],
  ['paints the multi-column fallback', /masonry-grid--fallback/.test(html) && /--masonry-fallback-columns/.test(html)],
  ['publishes the gutters as custom properties', /--masonry-gutter-x: 20px/.test(html) && /--masonry-gutter-x: 16px/.test(html)],
  ['marks a native grid for the @supports rule', /masonry-grid--native/.test(html)],
  ['emits grid-template-columns for the native grid', /--masonry-native-columns: repeat\\(auto-fill/.test(html)],
  ['leaves items in normal flow (no absolute positioning)', !/position:\\s*absolute/.test(html)],
  ['leaves items visible (nothing hidden until hydration)', !/visibility:\\s*hidden/.test(html)],
  ['writes no transforms on the server', !/transform:\\s*translate/.test(html)],
  ['gives items the multi-column hint', /break-inside/.test(html)],
];

let failed = 0;
for (const [name, ok] of checks) { console.log(\`  \${ok ? 'PASS' : 'FAIL'}  \${name}\`); if (!ok) failed++; }
if (failed > 0) {
  console.log('\\n--- rendered body ---\\n' + html.replace(/<script[\\s\\S]*?<\\/script>/g, '').slice(0, 1200));
  console.log(\`\\n\${failed} check(s) failed.\`);
}
process.exit(failed > 0 ? 1 : 0);
`;

writeFileSync(`${dir}/probe.ts`, PROBE);
writeFileSync(
  `${dir}/tsconfig.json`,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      strict: false,
      outDir: `${dir}/out`,
      types: [],
      lib: ['ES2022', 'DOM'],
    },
    files: [`${dir}/probe.ts`],
  }),
);
try {
  execFileSync('npx', ['tsc', '-p', `${dir}/tsconfig.json`], { cwd: ROOT, stdio: 'pipe' });
  writeFileSync(`${dir}/out/package.json`, JSON.stringify({ type: 'module' }));
  console.log('verify:ssr — rendering with @angular/platform-server, no browser globals\n');
  execFileSync(process.execPath, [`${dir}/out/probe.js`], { cwd: ROOT, stdio: 'inherit' });
} catch (error) {
  const out = String(error.stdout ?? '') + String(error.stderr ?? '');
  if (out.trim()) console.log(out.trim());
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
