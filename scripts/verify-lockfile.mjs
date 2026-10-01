/**
 * Checks that package.json and package-lock.json still agree.
 *
 * `npm install` updates both. Editing package.json by hand updates one. When
 * they disagree, local work carries on fine — `npm install` just fixes it on the
 * next run — but `npm ci` refuses outright, and `npm ci` is what CI and Vercel
 * use. Every job then fails at the install step, before a single test runs, with
 * a message about the lock file that looks nothing like the change that caused
 * it. That is exactly how a one-line devDependency addition turned into "the
 * tests are failing".
 *
 * This runs before `npm ci` in CI and from the pre-commit hook, so the failure
 * arrives with its own name on it.
 *
 * It deliberately uses no dependencies and does no network calls: it has to work
 * before anything is installed.
 *
 *     npm run verify:lockfile
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'package.json');
const LOCK = join(ROOT, 'package-lock.json');

for (const file of [PKG, LOCK]) {
  if (!existsSync(file)) {
    console.error(`verify:lockfile — ${file} is missing.`);
    process.exit(1);
  }
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
const packages = lock.packages ?? {};
const root = packages[''] ?? {};

const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const inLockRoot = { ...(root.dependencies ?? {}), ...(root.devDependencies ?? {}) };

const problems = [];

// 1. Every declared package needs a resolved entry, or there is nothing to install.
for (const name of Object.keys(declared)) {
  if (!(`node_modules/${name}` in packages)) {
    problems.push(`${name} is in package.json but has no entry in the lock file`);
  }
}

// 2. The lock file keeps its own copy of the manifest. npm ci compares the two
//    and stops on any difference, including a changed version range or a name.
for (const [name, range] of Object.entries(declared)) {
  if (inLockRoot[name] !== undefined && inLockRoot[name] !== range) {
    problems.push(`${name}: package.json wants ${range}, the lock file records ${inLockRoot[name]}`);
  }
}

// 3. Something removed from package.json but still required by the lock file.
for (const name of Object.keys(inLockRoot)) {
  if (!(name in declared)) {
    problems.push(`${name} is in the lock file but no longer in package.json`);
  }
}

if (pkg.name !== lock.name) {
  problems.push(`name: package.json says "${pkg.name}", the lock file says "${lock.name}"`);
}

if (problems.length > 0) {
  console.error('verify:lockfile — package.json and package-lock.json disagree.\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  `npm ci` will refuse to install, so CI and Vercel both fail at the');
  console.error('  install step before anything is tested.\n');
  console.error('  Fix it with:\n');
  console.error('      npm install\n');
  console.error('  then commit the updated package-lock.json.');
  process.exit(1);
}

console.log(
  `verify:lockfile — OK, ${Object.keys(declared).length} declared package(s) all resolved.`,
);
