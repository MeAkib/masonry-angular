/**
 * Compiles the code examples in the documentation.
 *
 * Two examples shipped in the README published to npm that could not compile at
 * all: `[columns]="{ 0: 1 }"` is an Angular template parse error, and a
 * component with `imports` but no `standalone: true` is rejected by Angular 17
 * and 18. Both were obvious in a build and invisible to a reader, which is the
 * kind of mistake worth automating away.
 *
 * So this extracts every fenced `ts` block that defines a component from the
 * documentation, drops each one into a throwaway application that resolves
 * `masonry-angular` the way a consumer does, and builds it with
 * `strictTemplates` on. If a snippet does not compile, it fails.
 *
 * Run it after `npm run build:lib`:
 *
 *     npm run verify:docs
 *
 * It builds against the workspace's own Angular, which is the newest supported
 * major. For the older end of the range — where the `standalone` difference
 * lives — `npm run verify:compat` is the one that matters, and it is slower for
 * exactly that reason.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Files whose examples are a promise to somebody. */
const SOURCES = [
  'projects/masonry-angular/README.md',
  'projects/masonry-angular/GETTING-STARTED.md',
  'llms.txt',
];

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    target: 'ES2022',
    module: 'preserve',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    experimentalDecorators: true,
    useDefineForClassFields: false,
    types: [],
    paths: {
      'masonry-angular': [resolve(ROOT, 'dist/masonry-angular')],
      'masonry-angular/testing': [resolve(ROOT, 'dist/masonry-angular/testing')],
    },
  },
  angularCompilerOptions: { strictTemplates: true },
  files: ['src/main.ts'],
};

const ANGULAR_JSON = {
  version: 1,
  projects: {
    app: {
      projectType: 'application',
      root: '',
      sourceRoot: 'src',
      architect: {
        build: {
          builder: '@angular/build:application',
          options: {
            outputPath: 'dist',
            index: 'src/index.html',
            browser: 'src/main.ts',
            tsConfig: 'tsconfig.json',
          },
          configurations: { development: { optimization: false } },
          defaultConfiguration: 'development',
        },
      },
    },
  },
};

/**
 * Every fenced `ts` block that declares a component.
 *
 * Blocks without `@Component` are option objects and provider calls shown out
 * of context; they are not self-contained and there is nothing to build.
 */
function componentSnippets(file) {
  const text = readFileSync(resolve(ROOT, file), 'utf8');
  const found = [];
  const fence = /```ts\n([\s\S]*?)```/g;
  let match;
  while ((match = fence.exec(text)) !== null) {
    const code = match[1];
    if (!code.includes('@Component')) continue;
    const line = text.slice(0, match.index).split('\n').length;
    found.push({ file, line, code });
  }
  return found;
}

/** The bootstrap a documentation snippet leaves out, since it is not the point. */
function makeMain(code) {
  const className = /export class (\w+)/.exec(code)?.[1];
  if (!className) throw new Error('snippet declares no exported class');
  const bootstrap = code.includes('bootstrapApplication')
    ? ''
    : `\nimport { bootstrapApplication } from '@angular/platform-browser';\n` +
      `bootstrapApplication(${className});\n`;
  return code + bootstrap;
}

function buildSnippet(snippet) {
  const dir = mkdtempSync(`${tmpdir()}/masonry-docs-`);
  try {
    mkdirSync(`${dir}/src`);
    // The workspace's own toolchain, rather than an install per snippet.
    symlinkSync(resolve(ROOT, 'node_modules'), `${dir}/node_modules`, 'dir');
    writeFileSync(`${dir}/package.json`, JSON.stringify({ name: 'docs', private: true }));
    writeFileSync(`${dir}/angular.json`, JSON.stringify(ANGULAR_JSON));
    writeFileSync(`${dir}/tsconfig.json`, JSON.stringify(TSCONFIG));
    writeFileSync(
      `${dir}/src/index.html`,
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>d</title></head>' +
        '<body><app-root></app-root></body></html>',
    );
    writeFileSync(`${dir}/src/main.ts`, makeMain(snippet.code));

    execFileSync('node', [resolve(ROOT, 'node_modules/@angular/cli/bin/ng.js'), 'build'], {
      cwd: dir,
      stdio: 'pipe',
      encoding: 'utf8',
      env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
    });
    return { ok: true };
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    // The CLI colours its output even through a pipe; strip the escapes so a
    // CI log stays readable.
    const plain = out.replace(/\[[\d;]*m/g, '');
    const reason =
      plain
        .split('\n')
        .find((l) => /NG\d|TS-?\d|error/i.test(l))
        ?.trim() ?? error.message;
    return { ok: false, reason };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const snippets = SOURCES.flatMap(componentSnippets);
if (snippets.length === 0) {
  console.error('verify:docs — found no component examples to check. Has the markdown moved?');
  process.exit(1);
}

console.log(`verify:docs — compiling ${snippets.length} documentation example(s).\n`);

let failed = 0;
for (const snippet of snippets) {
  const result = buildSnippet(snippet);
  const where = `${relative(ROOT, resolve(ROOT, snippet.file))}:${snippet.line}`;
  if (result.ok) {
    console.log(`  OK    ${where}`);
  } else {
    failed++;
    console.log(`  FAIL  ${where}`);
    console.log(`        ${result.reason}`);
  }
}

console.log(
  failed
    ? `\n${failed} of ${snippets.length} example(s) do not compile.`
    : `\nEvery documentation example compiles.`,
);
process.exit(failed ? 1 : 0);
