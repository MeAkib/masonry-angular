/**
 * Removes the `tslib` dependency ng-packagr writes into the built package.json.
 *
 * ng-packagr adds `tslib` to `dependencies` unconditionally when a library does
 * not declare it, reading the version from @angular/compiler — there is no
 * option to turn that off, so leaving it out of the source package.json cannot
 * work. For most Angular libraries that is harmless, because their compiled
 * code imports tslib's helpers.
 *
 * This one does not. The library tsconfig sets `importHelpers: false`, so any
 * helper TypeScript needs is inlined, and the built code imports nothing but
 * @angular/core. Declaring tslib anyway is metadata that does not match the
 * code: Bundlephobia reported "1 dependency" for 0.0.2 beside a README that
 * said none.
 *
 * Stripping it is safe only because it is checked. `npm run verify:deps` fails
 * if the built code imports any module that is not a declared peer, so the day
 * a build does need tslib, CI says so instead of consumers finding out.
 *
 * Runs as part of `npm run build:lib`, so `npm run release` publishes the
 * corrected file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'dist/masonry-angular/package.json');

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));

if (pkg.dependencies?.tslib) {
  delete pkg.dependencies.tslib;
  if (Object.keys(pkg.dependencies).length === 0) delete pkg.dependencies;
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
  console.log('strip-tslib — removed the tslib dependency ng-packagr added.');
} else {
  console.log('strip-tslib — nothing to remove.');
}
