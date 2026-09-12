/**
 * Verifies the supported Angular range by building a real application on each
 * major, against the packed library.
 *
 * The `peerDependencies` range is a promise, and this is what keeps it honest.
 * Type-checking is not enough: the package ships in Angular's *partial*
 * compilation format, which means the consumer's own build runs the Angular
 * linker over it. The linker is the piece that can reject an older Angular, and
 * the only way to exercise it is to actually build something.
 *
 * Each major also needs a TypeScript version it accepts, and Angular 17 predates
 * the `@angular/build` package, so the builder differs there too. That is why
 * this is a table rather than a loop over version numbers.
 *
 *     npm run verify:compat            every supported major
 *     npm run verify:compat -- 18 20   only those
 *
 * It is slow — each major is a fresh install and a full build, so budget a few
 * minutes. It is not part of `npm test`; run it when the peer range changes, or
 * when a new Angular major ships and you want to add a row.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * One row per supported Angular major.
 *
 * `ts` is a TypeScript version that major accepts — Angular refuses to compile
 * with a TypeScript it does not recognise, so this cannot just be "latest".
 * `builder` is `devkit` for Angular 17, which predates `@angular/build`.
 */
const MAJORS = [
  { major: 17, ts: '~5.2', builder: 'devkit' },
  { major: 18, ts: '~5.4', builder: 'build' },
  { major: 19, ts: '~5.6', builder: 'build' },
  { major: 20, ts: '~5.8', builder: 'build' },
  { major: 21, ts: '~5.9', builder: 'build' },
  { major: 22, ts: '~6.0', builder: 'build' },
];

/** A component using every part of the public API a consumer would touch. */
const MAIN = `import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { NG_MASONRY_GRID, provideNgMasonryGrid } from 'masonry-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NG_MASONRY_GRID],
  template: \`
    <masonry-grid #g="masonryGrid" columnWidth="260" gutter="20">
      @for (n of items(); track n) {
        <div masonryGridItem [masonryColSpan]="n === 1 ? 2 : 1">{{ n }}</div>
      }
      <aside masonryGridStamp></aside>
      <div masonryGridSizer></div>
    </masonry-grid>
    <p>{{ g.state().columns }} / {{ g.ready() }} / {{ g.nativeActive() }}</p>
  \`,
})
export class App {
  readonly items = signal([1, 2, 3, 4]);
}

bootstrapApplication(App, { providers: [provideNgMasonryGrid({ gutter: 16 })] });
`;

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    target: 'ES2022',
    module: 'ES2022',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    experimentalDecorators: true,
    useDefineForClassFields: false,
  },
  files: ['src/main.ts'],
};

function angularJson(builder) {
  const target = builder === 'devkit' ? '@angular-devkit/build-angular' : '@angular/build';
  return {
    version: 1,
    projects: {
      app: {
        projectType: 'application',
        root: '',
        sourceRoot: 'src',
        architect: {
          build: {
            builder: `${target}:application`,
            options: {
              outputPath: 'dist',
              index: 'src/index.html',
              browser: 'src/main.ts',
              tsConfig: 'tsconfig.json',
            },
          },
        },
      },
    },
  };
}

/** Pack the library once; every app installs this exact tarball. */
function packLibrary() {
  execFileSync('npm', ['run', 'build:lib'], { cwd: ROOT, stdio: 'pipe' });
  const out = execFileSync('npm', ['pack', './dist/masonry-angular', '--silent'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const file = out.trim().split('\n').pop();
  return resolve(ROOT, file);
}

function buildOn({ major, ts, builder }, tarball) {
  const dir = mkdtempSync(`${tmpdir()}/masonry-compat-${major}-`);
  try {
    mkdirSync(`${dir}/src`);
    writeFileSync(`${dir}/package.json`, JSON.stringify({ name: `app${major}`, private: true, version: '0.0.0' }));
    writeFileSync(`${dir}/angular.json`, JSON.stringify(angularJson(builder)));
    writeFileSync(`${dir}/tsconfig.json`, JSON.stringify(TSCONFIG));
    writeFileSync(`${dir}/src/index.html`, '<!doctype html><html><body><app-root></app-root></body></html>');
    writeFileSync(`${dir}/src/main.ts`, MAIN);

    const builderPkg =
      builder === 'devkit' ? `@angular-devkit/build-angular@${major}` : `@angular/build@${major}`;
    const packages = [
      `@angular/core@${major}`,
      `@angular/common@${major}`,
      `@angular/compiler@${major}`,
      `@angular/platform-browser@${major}`,
      `@angular/compiler-cli@${major}`,
      `@angular/cli@${major}`,
      builderPkg,
      'rxjs@~7.8.0',
      'tslib',
      'zone.js',
      `typescript@${ts}`,
      tarball,
    ];

    // `--legacy-peer-deps` is for the *toolchain*, whose own peers disagree
    // across majors. The library's peer range is checked separately below.
    execFileSync('npm', ['i', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps', ...packages], {
      cwd: dir,
      stdio: 'pipe',
    });

    const installed = JSON.parse(
      execFileSync('node', ['-p', "JSON.stringify(require('@angular/core/package.json').version)"], {
        cwd: dir,
        encoding: 'utf8',
      }),
    );

    const out = execFileSync('npx', ['ng', 'build'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const ok = out.includes('bundle generation complete');
    const size = /main\.js\s+\|\s+main\s+\|\s+([\d.]+ kB)/.exec(out)?.[1] ?? '';
    return { ok, installed, size };
  } catch (error) {
    const out = String(error.stdout ?? '') + String(error.stderr ?? '');
    const reason = out.split('\n').find((l) => /error|Error|exception/i.test(l))?.trim() ?? error.message;
    return { ok: false, installed: `${major}.x`, reason: reason.slice(0, 120) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A plain `npm install` with no escape hatches, to prove the declared peer
 * range actually admits this Angular version.
 */
function peerRangeAccepts(major, tarball) {
  const dir = mkdtempSync(`${tmpdir()}/masonry-peer-${major}-`);
  try {
    writeFileSync(`${dir}/package.json`, JSON.stringify({ name: 'p', private: true }));
    execFileSync(
      'npm',
      ['i', '--silent', '--no-audit', '--no-fund', `@angular/core@${major}`, `@angular/common@${major}`, 'rxjs@~7.8.0', tarball],
      { cwd: dir, stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const only = process.argv.slice(2);
const rows = only.length ? MAJORS.filter((m) => only.includes(String(m.major))) : MAJORS;

console.log('verify:compat — building a real application on each supported Angular major.');
console.log('This installs a full toolchain per major, so it takes a few minutes.\n');

const tarball = packLibrary();
if (!existsSync(tarball)) throw new Error('could not pack the library');

let failed = 0;
for (const row of rows) {
  const peers = peerRangeAccepts(row.major, tarball);
  const built = buildOn(row, tarball);
  const status = built.ok && peers ? 'OK  ' : 'FAIL';
  if (!built.ok || !peers) failed++;
  console.log(
    `  ${status}  Angular ${String(built.installed).padEnd(10)}` +
      `install: ${peers ? 'clean' : 'REJECTED by peer range'}   ` +
      `build: ${built.ok ? `ok${built.size ? ` (${built.size})` : ''}` : 'FAILED'}`,
  );
  if (built.reason) console.log(`          ${built.reason}`);
}

rmSync(tarball, { force: true });
console.log(failed ? `\n${failed} major(s) failed.` : '\nEvery supported major installs cleanly and builds.');
process.exit(failed ? 1 : 0);
