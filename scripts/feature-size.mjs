/**
 * Feature-cost measurement by ablation.
 *
 * For each feature: delete it from a copy of the source, build the library,
 * measure the gzipped production bundle, and report the difference from the
 * baseline. That difference is what the feature actually costs a user — which
 * is not the same as the size of the file it lives in, because deleting a
 * feature also removes its options, its defaults, its validation and the
 * branches that call it.
 *
 * Usage:
 *   npm run size:features           measure every feature
 *   npm run size:features -- motion  measure only matching ones
 *
 * The patches below are string surgery against real source, so they go stale
 * when that source changes. That is deliberate: a patch that no longer matches
 * throws instead of silently measuring nothing, so a stale number can never be
 * reported as a real one. When one breaks, fix the patch — the failure is
 * telling you the feature moved.
 *
 * Your working tree is snapshotted before the first ablation and restored after
 * the last one, including on Ctrl-C.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = `${ROOT}/projects/masonry-angular/src`;
const FESM = `${ROOT}/dist/masonry-angular/fesm2022/masonry-angular.mjs`;

/** A snapshot of the real source, restored between every ablation. */
const PRISTINE = mkdtempSync(`${tmpdir()}/masonry-ablate-`);
cpSync(SRC, PRISTINE, { recursive: true });
process.on('exit', () => {
  cpSync(PRISTINE, SRC, { recursive: true });
  rmSync(PRISTINE, { recursive: true, force: true });
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));

const file = (p) => `${SRC}/${p}`;
const read = (p) => readFileSync(file(p), 'utf8');
const write = (p, s) => writeFileSync(file(p), s);

/** Replace `find` with `replace`; throw if it is not present (a stale patch). */
function sub(p, find, replace = '') {
  const before = read(p);
  const after = before.replace(find, replace);
  if (after === before) throw new Error(`patch did not apply in ${p}: ${String(find).slice(0, 70)}`);
  write(p, after);
}

/** Replace every occurrence; throw if none matched. */
function subAll(p, find, replace = '') {
  const before = read(p);
  const re = find instanceof RegExp ? new RegExp(find.source, find.flags.includes("g") ? find.flags : find.flags + "g") : find;
  const after = before.replaceAll(re, replace);
  if (after === before) throw new Error(`patch did not apply in ${p}: ${String(find).slice(0, 70)}`);
  write(p, after);
}

/** Like `sub`, but silent when the target is already gone (order-independent). */
function subOpt(p, find, replace = '') {
  try { sub(p, find, replace); } catch { /* already applied by another ablation */ }
}

/** Delete a whole method or function body by brace matching from a signature. */
function dropBlock(p, signature, replacement = '') {
  const text = read(p);
  const start = text.indexOf(signature);
  if (start === -1) throw new Error(`signature not found in ${p}: ${signature.slice(0, 60)}`);
  let i = text.indexOf('{', start);
  if (i === -1) throw new Error(`no brace after signature in ${p}`);
  let depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  write(p, text.slice(0, start) + replacement + text.slice(i + 1));
}

// -----------------------------------------------------------------------------
// The ablations
// -----------------------------------------------------------------------------

const ABLATIONS = {
  'motion (entry + exit + transitions)': () => {
    write(
      'lib/core/motion.ts',
      `import type { ItemRecord, ResolvedMasonryGridOptions } from '../models';
export class Motion {
  constructor(_c: HTMLElement, _f: () => void) {}
  get hasLeavingItems(): boolean { return false; }
  destroy(): void {}
  playEntry(_e: readonly ItemRecord[], _o: ResolvedMasonryGridOptions, _f: boolean): void {}
  enableTransitions(_e: readonly ItemRecord[], _o: ResolvedMasonryGridOptions): void {}
  playExit(_r: ItemRecord, _o: ResolvedMasonryGridOptions): boolean { return false; }
}
`,
    );
    // The keyframe defaults are only reachable through the effects.
    sub('lib/schemas/defaults.ts', /entryAnimation: Object\.freeze\(\{[\s\S]*?\n  \}\),/, 'entryAnimation: false,');
    sub('lib/schemas/defaults.ts', /exitAnimation: Object\.freeze\(\{[\s\S]*?\n  \}\),/, 'exitAnimation: false,');
    sub('lib/schemas/defaults.ts', /transition: Object\.freeze\(\{[\s\S]*?\n  \}\),/, 'transition: Object.freeze({ duration: 0, easing: "" }),');
  },

  'native CSS masonry': () => {
    subAll('lib/masonry-grid.ts', /\n    \/\*\n     \* Native CSS masonry[\s\S]*?\n    \}\n\n    @supports \(display: masonry\)[\s\S]*?\n    \}\n/, '\n');
    sub('lib/masonry-grid.ts', "    '[class.masonry-grid--native]': 'options().native',\n");
    sub('lib/masonry-grid.ts', "    '[style.--masonry-native-columns]': 'nativeTemplate()',\n");
    sub('lib/masonry-grid.ts', /  readonly nativeActive = computed\([\s\S]*?\);\n/, '  readonly nativeActive = computed(() => false);\n');
    sub('lib/masonry-grid.ts', /  protected readonly nativeTemplate = computed\([\s\S]*?\n  \}\);\n/, '  protected readonly nativeTemplate = computed(() => null);\n');
    dropBlock('lib/masonry-grid.ts', '  private initializeNative(): void', '  private initializeNative(): void {}');
    dropBlock('lib/masonry-grid.ts', '  private runNativeLayout(): void', '  private runNativeLayout(): void {}');
    sub('lib/masonry-grid.ts', /import \{\n  nativeColumnsAreStatic,[\s\S]*?\} from '\.\/core\/native';\n/, '');
    sub('lib/masonry-grid.ts', "import { resolveNativeColumns } from './core/native-grid';\n", '');
    subOpt('lib/masonry-grid.ts', /return !this\.ready\(\) && \(options\.native \|\| options\.ssr\.fallback === 'columns'\);/, "return !this.ready() && options.ssr.fallback === 'columns';");
    subAll('lib/masonry-grid.ts', 'private readonly nativeBreakpointColumns = signal(0);', '');
    dropBlock('lib/directives/masonry-grid-item.ts', 'if (this.grid.options().native) {');
    subOpt('lib/directives/masonry-grid-item.ts', 'if (options.native || options.ssr.fallback', "if (options.ssr.fallback");
    sub('lib/directives/masonry-grid-item.ts', '|| this.grid.nativeActive()', '');
    sub('lib/schemas/defaults.ts', '  native: false,\n', '');
    sub('lib/models/options.ts', /  readonly native: boolean;/, '  readonly native?: boolean;');
    sub('lib/schemas/parse.ts', '    native: input.native ?? d.native,\n', '');
    sub('lib/schemas/parse.ts', "  collector.boolean('native', value['native']);\n", '');
    sub('public-api.ts', "export { supportsNativeMasonry } from './lib/core/native';\n", '');
    write('lib/core/native.ts', 'export {};\n');
    write('lib/core/native-grid.ts', 'export {};\n');
  },

  stamps: () => {
    sub('lib/core/layout-engine.ts', /    for \(const stamp of stamps\) \{\n.*\n    \}\n/, '');
    dropBlock('lib/core/layout-engine.ts', '  private applyStamp(');
    sub('lib/core/layout-engine.ts', /const \{ items, stamps, gutterX/, 'const { items, gutterX');
    dropBlock('lib/core/item-registry.ts', '  stampBoxes(): readonly MasonryStampBox[]', '  stampBoxes(): readonly MasonryStampBox[] { return []; }');
    write('lib/directives/masonry-grid-stamp.ts', 'export class MasonryGridStamp {}\n');
    sub('public-api.ts', /export \{ MasonryGridStamp \} from '\.\/lib\/directives\/masonry-grid-stamp';\n/, '');
    sub('public-api.ts', /import \{ MasonryGridStamp \} from '\.\/lib\/directives\/masonry-grid-stamp';\n/, '');
    sub('public-api.ts', /  MasonryGridStamp,\n/, '');
    dropBlock('lib/masonry-grid.ts', '  addStamp(element: HTMLElement): void', '  addStamp(_e: HTMLElement): void {}');
    dropBlock('lib/masonry-grid.ts', '  removeStamp(element: HTMLElement): void', '  removeStamp(_e: HTMLElement): void {}');
  },

  'sizer directive': () => {
    write('lib/directives/masonry-grid-sizer.ts', 'export class MasonryGridSizer {}\n');
    sub('public-api.ts', /export \{ MasonryGridSizer \} from '\.\/lib\/directives\/masonry-grid-sizer';\n/, '');
    sub('public-api.ts', /import \{ MasonryGridSizer \} from '\.\/lib\/directives\/masonry-grid-sizer';\n/, '');
    sub('public-api.ts', /  MasonryGridSizer,\n/, '');
    dropBlock('lib/masonry-grid.ts', '  setSizer(element: HTMLElement): void', '  setSizer(_e: HTMLElement): void {}');
    dropBlock('lib/masonry-grid.ts', '  clearSizer(element: HTMLElement): void', '  clearSizer(_e: HTMLElement): void {}');
    sub('lib/core/column-resolver.ts', /  const fixedWidth =[\s\S]*?options\.columnWidth;/, '  const fixedWidth = options.columnWidth;');
  },

  'contentVisibility': () => {
    dropBlock('lib/core/item-styles.ts', '  private writeIntrinsicSize(', '  private writeIntrinsicSize(_r: ItemRecord, _w: number, _s: CSSStyleDeclaration): void {}');
    sub('lib/core/item-styles.ts', /      if \(options\.contentVisibility\) \{[\s\S]*?\n      \}\n/, '');
    subAll('lib/core/item-styles.ts', ' && !options.contentVisibility', '');
    sub('lib/schemas/defaults.ts', '  contentVisibility: false,\n', '');
    sub('lib/schemas/parse.ts', '    contentVisibility: input.contentVisibility ?? d.contentVisibility,\n', '');
    sub('lib/schemas/parse.ts', "  collector.boolean('contentVisibility', value['contentVisibility']);\n", '');
    sub('lib/models/options.ts', /  readonly contentVisibility: boolean;/, '  readonly contentVisibility?: boolean;');
  },

  fitWidth: () => {
    sub('lib/core/size-watcher.ts', /const wanted = \(options\.fitWidth \? this\.element\.parentElement : this\.element\) \?\? this\.element;/, 'const wanted = this.element;');
    sub('lib/masonry-grid.ts', /    if \(options\.fitWidth\) style\.width = `\$\{solution\.contentWidth\}px`;\n/, '');
    sub('lib/masonry-grid.ts', /width: options\.fitWidth \? solution\.contentWidth : this\.sizes\.containerWidth,/, 'width: this.sizes.containerWidth,');
    dropBlock('lib/core/layout-engine.ts', '  private occupiedWidth(', '  private occupiedWidth(): number { return 0; }');
    sub('lib/core/layout-engine.ts', /contentWidth: this\.occupiedWidth\([^)]*\),/, 'contentWidth: 0,');
    sub('lib/schemas/defaults.ts', '  fitWidth: false,\n', '');
    sub('lib/schemas/parse.ts', '    fitWidth: input.fitWidth ?? d.fitWidth,\n', '');
    sub('lib/schemas/parse.ts', "  collector.boolean('fitWidth', value['fitWidth']);\n", '');
    sub('lib/models/options.ts', /  readonly fitWidth: boolean;/, '  readonly fitWidth?: boolean;');
  },

  'RTL + verticalOrigin': () => {
    sub('lib/core/layout-engine.ts', /    if \(request\.originBottom\) \{[\s\S]*?\n    \}\n/, '');
    subAll('lib/core/layout-engine.ts', 'rtl ? rightEdge - width - column * stride : column * stride', 'column * stride');
    sub('lib/schemas/defaults.ts', "  direction: 'ltr',\n", '');
    sub('lib/schemas/defaults.ts', "  verticalOrigin: 'top',\n", '');
    sub('lib/schemas/parse.ts', '    direction: input.direction ?? d.direction,\n', '');
    sub('lib/schemas/parse.ts', '    verticalOrigin: input.verticalOrigin ?? d.verticalOrigin,\n', '');
    sub('lib/schemas/parse.ts', /  collector\.enum\('direction'[^;]*;\n/, '');
    sub('lib/schemas/parse.ts', /  collector\.enum\('verticalOrigin'[^;]*;\n/, '');
    sub('lib/models/options.ts', /  readonly direction: 'ltr' \| 'rtl';/, "  readonly direction?: 'ltr' | 'rtl';");
    sub('lib/models/options.ts', /  readonly verticalOrigin: 'top' \| 'bottom';/, "  readonly verticalOrigin?: 'top' | 'bottom';");
  },

  horizontalOrder: () => {
    sub('lib/core/layout-engine.ts', /      let column: number;\n      if \(request\.horizontalOrder\) \{[\s\S]*?\n      \} else \{\n        column = this\.shortestColumn\(colYs, columns, span\);\n      \}/, '      const column = this.shortestColumn(colYs, columns, span);');
    sub('lib/schemas/defaults.ts', '  horizontalOrder: false,\n', '');
    sub('lib/schemas/parse.ts', '    horizontalOrder: input.horizontalOrder ?? d.horizontalOrder,\n', '');
    sub('lib/schemas/parse.ts', "  collector.boolean('horizontalOrder', value['horizontalOrder']);\n", '');
    sub('lib/models/options.ts', /  readonly horizontalOrder: boolean;/, '  readonly horizontalOrder?: boolean;');
    sub('lib/masonry-grid.ts', '      horizontalOrder: options.horizontalOrder,\n', '');
    sub('lib/models/layout.ts', /  readonly horizontalOrder: boolean;/, '');
    sub('lib/core/layout-signature.ts', /  hash = mix\(hash, options.horizontalOrder \? 1 : 0\);\n/, '');
  },

  'responsive breakpoints': () => {
    write(
      'lib/core/column-resolver.ts',
      `import type { ResolvedColumnGeometry } from '../models/geometry';
import type { ResolvedMasonryGridOptions } from '../models/options';
const DEFAULT_COLUMN_COUNT = 3;
function clampColumns(count: number, o: ResolvedMasonryGridOptions): number {
  return Math.max(1, Math.min(Math.max(count, o.minColumns), o.maxColumns ?? Number.POSITIVE_INFINITY));
}
export function resolveColumnGeometry(
  availableWidth: number, _basisWidth: number, options: ResolvedMasonryGridOptions, sizerWidth?: number,
): ResolvedColumnGeometry {
  const { gutterX } = options;
  const width = Math.max(0, availableWidth);
  const fixedWidth = sizerWidth !== undefined && sizerWidth > 0 ? sizerWidth : options.columnWidth;
  if (fixedWidth !== undefined) {
    const track = fixedWidth + gutterX;
    const columns = clampColumns(track > 0 ? Math.floor((width + gutterX) / track) : 1, options);
    const columnWidth = options.stretchColumns && sizerWidth === undefined
      ? (width - (columns - 1) * gutterX) / columns : fixedWidth;
    return { columns, columnWidth: Math.max(0, columnWidth) };
  }
  const columns = clampColumns(typeof options.columns === 'number' ? options.columns : DEFAULT_COLUMN_COUNT, options);
  return { columns, columnWidth: Math.max(0, (width - (columns - 1) * gutterX) / columns) };
}
export function resolveFallbackColumns(options: ResolvedMasonryGridOptions): number {
  if (typeof options.columns === 'number') return clampColumns(options.columns, options);
  return clampColumns(options.ssr.columns, options);
}
`,
    );
    sub('lib/schemas/defaults.ts', /export const DEFAULT_MASONRY_BREAKPOINTS[\s\S]*?\n\}\);/, 'export const DEFAULT_MASONRY_BREAKPOINTS: MasonryBreakpointScale = {};');
    sub('lib/schemas/parse.ts', /  validateColumns\(collector, value\['columns'\], scaleFor\(input\)\);\n/, '');
    dropBlock('lib/schemas/parse.ts', 'function validateColumns(');
    dropBlock('lib/schemas/parse.ts', 'function scaleFor(');
  },

  'SSR multi-column fallback': () => {
    sub('lib/masonry-grid.ts', /    \/\*\n     \* Pre-hydration and no-JS rendering[\s\S]*?\n    \}\n/, '');
    sub('lib/masonry-grid.ts', "    '[class.masonry-grid--fallback]': 'usesFallback()',\n");
    sub('lib/masonry-grid.ts', "    '[style.--masonry-fallback-columns]': 'fallbackColumns()',\n");
    sub('lib/schemas/defaults.ts', /  ssr: Object\.freeze\(\{[\s\S]*?\n  \}\),/, "  ssr: Object.freeze({ fallback: 'none' as const, columns: 2 }),");
    sub('lib/directives/masonry-grid-item.ts', /    if \(options\.native \|\| options\.ssr\.fallback === 'columns'\) \{[\s\S]*?\n    \} else \{\n/, '    {\n');
  },

  awaitImages: () => {
    dropBlock('lib/directives/masonry-grid-item.ts', '  private awaitImages(): void', '  private awaitImages(): void {}');
    dropBlock('lib/directives/masonry-grid-item.ts', 'function settled(');
    sub('lib/schemas/defaults.ts', '  awaitImages: true,\n', '');
    sub('lib/schemas/parse.ts', '    awaitImages: input.awaitImages ?? d.awaitImages,\n', '');
    sub('lib/schemas/parse.ts', "  collector.boolean('awaitImages', value['awaitImages']);\n", '');
    sub('lib/models/options.ts', /  readonly awaitImages: boolean;/, '  readonly awaitImages?: boolean;');
  },

  'shorthand inputs': () => {
    sub('lib/masonry-grid.ts', /  readonly columns = input<[\s\S]*?transform: coerceShorthand \}\);\n/, '');
    subAll('lib/masonry-grid.ts', /  readonly (columnWidth|gutter|gutterX|gutterY) = input<number \| undefined, number \| string \| undefined>\(undefined, \{\n    transform: coerceShorthand,\n  \}\);\n/, '');
    sub('lib/masonry-grid.ts', /    this\.optionsResolver\.resolve\(this\.optionsInput\(\), \{[\s\S]*?\}\),/, '    this.optionsResolver.resolve(this.optionsInput(), {}),');
    sub('lib/masonry-grid.ts', /import \{ GridOptionsResolver, coerceShorthand \} from '\.\/core\/grid-options';/, "import { GridOptionsResolver } from './core/grid-options';");
    dropBlock('lib/core/grid-options.ts', 'export function coerceShorthand');
  },

  'the skip-if-unchanged signature': () => {
    write('lib/core/layout-signature.ts', 'export const FORCE_NEXT_LAYOUT = 0;\nexport function layoutSignature(...args: unknown[]): number { return Math.random(); }\n');
  },

  'options merging + memoisation': () => {
    write(
      'lib/core/grid-options.ts',
      `import type { MasonryGridOptions, ResolvedMasonryGridOptions } from '../models';
import { parseMasonryGridOptions } from '../schemas/parse';
export function coerceShorthand<T>(v: T | string | undefined | null): T | number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v !== 'string') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : (v as unknown as number);
}
export class GridOptionsResolver {
  constructor(private readonly d: MasonryGridOptions) {}
  resolve(a: MasonryGridOptions | undefined, b: MasonryGridOptions): ResolvedMasonryGridOptions {
    return parseMasonryGridOptions({ ...this.d, ...a, ...b });
  }
}
`,
    );
    dropBlock('lib/schemas/parse.ts', 'export function mergeMasonryGridOptions(');
    dropBlock('lib/schemas/parse.ts', 'export function masonryOptionsEqual(');
    sub('public-api.ts', /  masonryOptionsEqual,\n/, '');
    sub('public-api.ts', /  mergeMasonryGridOptions,\n/, '');
  },

  'masonryIgnore': () => {
    sub('lib/core/item-registry.ts', /      if \(record\.handle\.ignored\(\)\) \{\n        if \(record\.placed\) onIgnored\(record\);\n        continue;\n      \}\n\n/, '');
    sub('lib/core/item-styles.ts', /      if \(record\.handle\.ignored\(\)\) continue;\n/, '');
    dropBlock('lib/core/item-styles.ts', '  demote(record: ItemRecord): void', '  demote(_r: ItemRecord): void {}');
    sub('lib/directives/masonry-grid-item.ts', /  readonly ignored = input\(false, \{ alias: 'masonryIgnore' \}\);/, '  readonly ignored = () => false;');
  },

  'the whole [options] object (shorthands only)': () => {
    write('lib/schemas/parse.ts', readFileSync(`${PRISTINE}/lib/schemas/parse.ts`, 'utf8')
      .replace(/if \(typeof ngDevMode === 'undefined' \|\| ngDevMode\) \{\n    const issues = validate\(input\);[\s\S]*?\n  \}\n/, ''));
    sub('lib/masonry-grid.ts', /  readonly optionsInput = input<MasonryGridOptions \| undefined>\(undefined, \{ alias: 'options' \}\);/, '  readonly optionsInput = () => undefined as MasonryGridOptions | undefined;');
  },

  'ALL of the above at once (the floor)': () => {
    for (const name of [
      'SSR multi-column fallback', 'motion (entry + exit + transitions)', 'native CSS masonry',
      'stamps', 'sizer directive', 'contentVisibility', 'fitWidth', 'RTL + verticalOrigin',
      'horizontalOrder', 'responsive breakpoints', 'awaitImages', 'masonryIgnore',
    ]) ABLATIONS[name]();
  },
};

// -----------------------------------------------------------------------------
// Runner
// -----------------------------------------------------------------------------

function restore() {
  rmSync(SRC, { recursive: true, force: true });
  cpSync(PRISTINE, SRC, { recursive: true });
}

function buildLib() {
  execFileSync('npx', ['ng', 'build', 'masonry-angular'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: process.env,
  });
}

async function measure() {
  const out = await build({
    stdin: {
      contents: `import {MasonryGrid,MasonryGridItem} from 'm';export const x=[MasonryGrid,MasonryGridItem];`,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    platform: 'browser',
    target: 'es2022',
    external: ['@angular/*', 'rxjs*', 'tslib'],
    define: { ngDevMode: 'false', ngJitMode: 'false' },
    alias: { m: FESM },
  });
  return gzipSync(out.outputFiles[0].contents).length;
}

const only = process.argv.slice(2);
const names = only.length ? Object.keys(ABLATIONS).filter((n) => only.some((o) => n.includes(o))) : Object.keys(ABLATIONS);

restore();
buildLib();
const baseline = await measure();
console.log(`baseline: ${baseline} B gzip\n`);

const rows = [];
for (const name of names) {
  restore();
  try {
    ABLATIONS[name]();
    buildLib();
    const size = await measure();
    rows.push([name, baseline - size]);
    console.log(`  ${String(baseline - size).padStart(5)} B   ${name}`);
  } catch (error) {
    if (process.env.VERBOSE) console.log(String(error.stdout ?? '') + String(error.message));
    const msg = String(error.stdout ?? error.message).split('\n').filter((l) => /error|Error/.test(l))[0] ?? error.message;
    rows.push([name, null]);
    console.log(`  FAILED     ${name}  — ${msg.slice(0, 110)}`);
  }
}

restore();
buildLib();

console.log('\n--- ranked ---');
for (const [name, cost] of rows.filter((r) => r[1] !== null).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(cost).padStart(5)} B  ${((cost / baseline) * 100).toFixed(1).padStart(5)}%  ${name}`);
}
