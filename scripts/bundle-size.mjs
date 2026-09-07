/**
 * Measures what each masonry library adds to an application bundle.
 *
 * Every entry point is bundled with esbuild in ESM mode, minified, with
 * `@angular/*` marked external — Angular itself is not the library's cost. The
 * reported number is the gzip -9 size of the result, which is what a CDN sends.
 *
 *   node scripts/bundle-size.mjs
 *
 * Competitor sources are expected as sibling checkouts of this workspace.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '..');
const siblings = resolve(workspace, '..');

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function bundle(stdin, { external = [], tsconfigRaw, define } = {}) {
  const result = await build({
    stdin: { contents: stdin, resolveDir: workspace, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    minify: true,
    legalComments: 'none',
    external: ['@angular/*', ...external],
    ...(define ? { define } : {}),
    ...(tsconfigRaw ? { tsconfigRaw } : {}),
  });
  const code = result.outputFiles[0].contents;
  return { min: code.length, gzip: gzipSync(code, { level: 9 }).length };
}

const gzipOf = (file) => {
  const buf = readFileSync(file);
  return { min: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
};

const decorators = JSON.stringify({ compilerOptions: { experimentalDecorators: true } });
const masonryPkgd = resolve(siblings, 'masonry/dist/masonry.pkgd.min.js');

const rows = [];
const add = (name, own, deps) => rows.push({ name, own, deps, total: own + (deps ?? 0) });

// This library, as an app that imports the directives would pull it in.
// `ngDevMode: false` is the substitution an Angular production build makes, and
// it is what strips the option validator — measuring without it would report a
// size that no user ever downloads.
const entry = `import { NG_MASONRY_GRID } from './dist/masonry-angular';
console.log(NG_MASONRY_GRID);`;
const ours = await bundle(entry, { define: { ngDevMode: 'false' } });
const oursDev = await bundle(entry, { define: { ngDevMode: 'true' } });
add('masonry-angular', ours.gzip, 0);
add('masonry-angular (dev build)', oursDev.gzip, 0);

if (existsSync(masonryPkgd)) {
  const masonry = gzipOf(masonryPkgd).gzip;

  const ngx = resolve(siblings, 'ngx-masonry/src/public-api.ts');
  if (existsSync(ngx)) {
    const w = await bundle(`export * from '${ngx}';`, {
      external: ['masonry-layout'],
      tsconfigRaw: decorators,
    });
    add('ngx-masonry', w.gzip, masonry);
  }

  const a2m = resolve(siblings, 'angular2-masonry/index.ts');
  if (existsSync(a2m)) {
    const w = await bundle(`export * from '${a2m}';`, {
      external: ['masonry-layout'],
      tsconfigRaw: decorators,
    });
    add('angular2-masonry', w.gzip, masonry);
  }

  add('masonry-layout (vanilla)', 0, masonry);
}

const pad = Math.max(...rows.map((r) => r.name.length));
console.log('\ngzip -9, @angular/* external\n');
console.log(
  `${'library'.padEnd(pad)}  ${'own'.padStart(9)}  ${'deps'.padStart(9)}  ${'total'.padStart(9)}`,
);
console.log('-'.repeat(pad + 33));
for (const r of rows) {
  console.log(
    `${r.name.padEnd(pad)}  ${kb(r.own).padStart(9)}  ${kb(r.deps).padStart(9)}  ${kb(r.total).padStart(9)}`,
  );
}
console.log();
