/**
 * Measures what the grid adds to a real Angular application.
 *
 * This exists because `scripts/bundle-size.mjs` cannot answer that question.
 * That script bundles the library's FESM with esbuild and `@angular/*` marked
 * external, which measures the library's own source and nothing else. Angular
 * libraries are published in *partial* compilation: component and directive
 * definitions are placeholders that the Angular linker expands during the
 * consuming application's build. Whatever the linker adds is real cost that an
 * esbuild pass over the FESM never sees. (It is also why Bundlephobia reports a
 * flat ~10.6 KB for every single export — it does not run the linker either.)
 *
 * So this builds two applications with the real Angular CLI and subtracts:
 *
 *   baseline  an app that already uses signals, computed, effect, input/output,
 *             @for/@if, OnPush, afterNextRender, NgZone, DestroyRef and
 *             ElementRef — so Angular's own cost for those is already paid and
 *             does not get charged to the grid
 *   typical   the same app with <masonry-grid> and [masonryGridItem]
 *   full      the same app with all four directives and provideNgMasonryGrid
 *
 * The delta is the honest number to put in a README: what a reader's bundle
 * grows by, not what the library weighs on its own.
 *
 *     node scripts/app-size.mjs          (after npm run build:lib)
 *
 * It builds three applications, so it takes a minute or two.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'dist/masonry-angular');

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;

/*
 * The shared half of every app. Each variant differs only in its imports and
 * its template, so anything Angular charges for these features is charged to
 * all three equally and cancels in the subtraction.
 */
const common = `
import {
  Component, ChangeDetectionStrategy, signal, computed, effect, input, output,
  inject, ElementRef, NgZone, DestroyRef, afterNextRender,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

@Component({
  selector: 'x-tile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>{{ label() }}</p>',
})
export class Tile {
  readonly label = input.required<string>();
  readonly picked = output<string>();
  tap(): void { this.picked.emit(this.label()); }
}

export abstract class Base {
  protected readonly host = inject(ElementRef);
  protected readonly zone = inject(NgZone);
  protected readonly destroyRef = inject(DestroyRef);
  readonly items = signal<readonly string[]>([]);
  readonly ready = signal(false);
  readonly visible = computed(() => this.items().filter((i) => i.length > 0));
  constructor() {
    effect(() => void this.visible().length);
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => void this.host.nativeElement.offsetHeight);
      this.ready.set(true);
    });
    this.destroyRef.onDestroy(() => void 0);
  }
  onPick(v: string): void { this.items.update((a) => [...a, v]); }
}
`;

const VARIANTS = {
  baseline: `${common}
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Tile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`
    @if (ready()) {
      <div class="wall">
        @for (t of visible(); track t) {
          <div><x-tile [label]="t" (picked)="onPick($event)" /></div>
        }
      </div>
    }
  \`,
})
export class App extends Base {}
bootstrapApplication(App);
`,

  typical: `${common}
import { MasonryGrid, MasonryGridItem } from 'masonry-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Tile, MasonryGrid, MasonryGridItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`
    @if (ready()) {
      <masonry-grid [gutter]="16">
        @for (t of visible(); track t) {
          <div masonryGridItem><x-tile [label]="t" (picked)="onPick($event)" /></div>
        }
      </masonry-grid>
    }
  \`,
})
export class App extends Base {}
bootstrapApplication(App);
`,

  full: `${common}
import { NG_MASONRY_GRID, provideNgMasonryGrid } from 'masonry-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Tile, ...NG_MASONRY_GRID],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`
    @if (ready()) {
      <masonry-grid [columns]="3" [gutter]="16">
        <div masonryGridSizer></div>
        <div masonryGridStamp>pinned</div>
        @for (t of visible(); track t) {
          <div masonryGridItem [masonryColSpan]="2"><x-tile [label]="t" (picked)="onPick($event)" /></div>
        }
      </masonry-grid>
    }
  \`,
})
export class App extends Base {}
bootstrapApplication(App, {
  providers: [provideNgMasonryGrid({ gutter: 16, transition: { duration: 260 } })],
});
`,
};

const work = mkdtempSync(join(tmpdir(), 'app-size-'));
const projects = {};

for (const [name, main] of Object.entries(VARIANTS)) {
  mkdirSync(join(work, name), { recursive: true });
  writeFileSync(join(work, name, 'main.ts'), main);
  writeFileSync(
    join(work, name, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>s</title></head><body><app-root></app-root></body></html>\n',
  );
  writeFileSync(
    join(work, name, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'preserve',
          moduleResolution: 'bundler',
          lib: ['ES2022', 'dom'],
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          // No `baseUrl` — TypeScript 6 deprecates it, and `paths` resolves
          // relative to this file, so an absolute target works without it.
          paths: { 'masonry-angular': [LIB] },
        },
        files: ['main.ts'],
        angularCompilerOptions: { strictTemplates: true },
      },
      null,
      2,
    ),
  );

  projects[name] = {
    root: name,
    projectType: 'application',
    architect: {
      build: {
        builder: '@angular/build:application',
        options: {
          browser: `${name}/main.ts`,
          index: `${name}/index.html`,
          tsConfig: `${name}/tsconfig.json`,
          outputPath: `dist/${name}`,
        },
        configurations: { production: { optimization: true, outputHashing: 'none' } },
        defaultConfiguration: 'production',
      },
    },
  };
}

writeFileSync(join(work, 'angular.json'), JSON.stringify({ version: 1, projects }, null, 2));

// The CLI and Angular itself come from this workspace; only the apps are new.
execFileSync('ln', ['-s', join(ROOT, 'node_modules'), join(work, 'node_modules')]);

/** Total gzipped size of every JavaScript file the build emitted. */
function measure(name) {
  try {
    execFileSync('npx', ['ng', 'build', name, '--configuration', 'production'], {
      cwd: work,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (error) {
    // execFileSync throws with the output as raw Buffers, which print as byte
    // arrays and hide the compiler error that actually matters.
    console.log(`\n\n${name} failed to build:\n`);
    console.log(error.stderr?.toString() ?? error.message);
    process.exit(1);
  }
  const out = join(work, 'dist', name, 'browser');
  let total = 0;
  const files = [];
  for (const f of readdirSync(out).filter((f) => f.endsWith('.js'))) {
    const size = gzipSync(readFileSync(join(out, f)), { level: 9 }).length;
    total += size;
    files.push(`${f} ${kb(size)}`);
  }
  return { total, files };
}

console.log('app-size — what the grid adds to a real Angular build.\n');

const results = {};
for (const name of Object.keys(VARIANTS)) {
  process.stdout.write(`  building ${name}… `);
  results[name] = measure(name);
  console.log(kb(results[name].total));
}

const { baseline, typical, full } = results;

console.log('\n  Gzipped application JavaScript');
console.log(`    baseline (no grid)                  ${kb(baseline.total).padStart(9)}`);
console.log(
  `    + <masonry-grid> and item           ${kb(typical.total).padStart(9)}   +${kb(typical.total - baseline.total)}`,
);
console.log(
  `    + all directives and providers      ${kb(full.total).padStart(9)}   +${kb(full.total - baseline.total)}`,
);

console.log(`
  The middle row is the number to publish: what a reader's bundle grows by for
  the ordinary case. 'npm run size' reports the library's own code before the
  Angular linker expands it, which is a smaller and different number.
`);

rmSync(work, { recursive: true, force: true });
