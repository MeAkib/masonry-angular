/**
 * Checks that the published package has no runtime dependencies.
 *
 * "Zero dependencies" is a claim a stranger can verify in ten seconds on
 * Bundlephobia, so it has to be exactly true. It was not: ng-packagr's default
 * template declares `tslib`, and version 0.0.2 shipped declaring it even though
 * the built code never imported it. Bundlephobia reported "1 dependency" beside
 * a README that said none.
 *
 * Two things can make the claim false, so this checks both:
 *
 *   1. package.json declares something under `dependencies`.
 *   2. The built code imports a module that is not a declared peer — which is
 *      how a dependency sneaks in without anyone adding it on purpose, for
 *      instance a TypeScript helper imported from tslib.
 *
 * Run it after `npm run build:lib`:
 *
 *     npm run verify:deps
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist/masonry-angular');

const pkg = JSON.parse(readFileSync(join(DIST, 'package.json'), 'utf8'));
const peers = Object.keys(pkg.peerDependencies ?? {});
const problems = [];

// 1. Declared dependencies.
const declared = Object.keys(pkg.dependencies ?? {});
if (declared.length > 0) {
  problems.push(`package.json declares dependencies: ${declared.join(', ')}`);
}

// 2. What the shipped code actually imports.
const fesm = join(DIST, 'fesm2022');
const imported = new Map();
for (const file of readdirSync(fesm).filter((f) => f.endsWith('.mjs'))) {
  const code = readFileSync(join(fesm, file), 'utf8');
  for (const [, spec] of code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    if (spec.startsWith('.')) continue; // internal
    // `@scope/name/sub` and `name/sub` both belong to their package.
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (name === pkg.name) continue; // a secondary entry point importing the primary
    if (!imported.has(name)) imported.set(name, new Set());
    imported.get(name).add(file);
  }
}

for (const [name, files] of imported) {
  if (!peers.includes(name)) {
    problems.push(`${[...files].join(', ')} imports '${name}', which is not a declared peer`);
  }
}

console.log('verify:deps — the published package must have no runtime dependencies.\n');
console.log(`  declared dependencies  ${declared.length ? declared.join(', ') : 'none'}`);
console.log(`  modules imported       ${[...imported.keys()].join(', ') || 'none'}`);
console.log(`  declared peers         ${peers.join(', ')}`);

if (problems.length > 0) {
  console.log('\nFAIL');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK — every import is a declared peer, and nothing else is required.');
