# Changelog

## 0.0.3 — 2026-10-01

Two corrections and no runtime changes. The layout behaves exactly as it did in `0.0.2`. What this
release fixes is a dependency the package declared but never used, and a size number that was
measured in the wrong unit.

### Zero runtime dependencies, for real this time

`0.0.2` declared `tslib` under `dependencies`, so Bundlephobia reported "1 dependency" beside a
README that said there were none. The code never imported it — the library tsconfig sets
`importHelpers: false`, so TypeScript inlines whatever helper it needs. ng-packagr adds `tslib` to the
built `package.json` unconditionally and offers no option to turn that off, which is why leaving it
out of the source file could not fix it on its own.

- `scripts/strip-tslib.mjs` removes the entry as part of `npm run build:lib`.
- `npm run verify:deps` makes the claim checkable rather than merely stated. It fails if
  `package.json` declares anything under `dependencies`, **or** if the built code imports any module
  that is not a declared peer. So the day a build genuinely does need `tslib`, CI says so instead of
  consumers finding out.
- That check runs on every pull request.

### The published size was measured in the wrong unit

Every document said **8.6 KB gzipped**. That is what the library's own code weighs. It is not what
your application grows by, and a README should quote the second.

Angular libraries are published in *partial* compilation: directive and component definitions are
placeholders that the Angular linker expands during the consuming application's build. `npm run size`
bundles the published FESM with esbuild and never runs the linker, so it cannot see that expansion.
Neither does Bundlephobia — which is why it reports a flat ~10.6 KB for every export in the package,
including ones that are forty lines of arithmetic.

`npm run size:app` is a new script that measures the thing people actually care about: it builds the
same application twice, once plain and once with the grid, and subtracts.

| Application                                    | Gzipped JavaScript |
| ---------------------------------------------- | ------------------ |
| baseline, no grid                              | 38.79 KB           |
| `<masonry-grid>` and `[masonryGridItem]`       | 49.16 KB — **+10.37 KB** |
| all four directives and `provideNgMasonryGrid` | 49.36 KB — +10.57 KB |

The baseline already uses signals, `computed`, `effect`, `input`/`output`, `@for`, `@if`, `OnPush`,
`afterNextRender`, `NgZone` and `DestroyRef`, so Angular's own cost for those is not charged to the
grid.

The figure quoted across the README, `llms.txt`, the demo and the package description is therefore
now **about 10.4 KB added to your bundle**. [`DOCS.md`](projects/masonry-angular/DOCS.md#bundle-size)
gives all three numbers and says which one to budget against, and keeps the library-comparison table
in own-code units so that it stays like for like.

The `0.0.1` and `0.0.2` entries below still say 8.6 KB. They are left as written, because they are a
record of what was published at the time rather than a description of the current release.

### Repository

Not part of the published package, but the reason the gap above was found at all.

- **A CI gate.** `verify`, `ssr`, `native` and `docs` jobs, with a single required `All checks passed`
  status so a pull request cannot merge while any of them is red. The `native` job now installs
  Playwright as well as the browser, and fails if the run reports itself skipped — without that it
  would have passed green forever while testing nothing.
- **The demo is prerendered.** It was a client-rendered Angular app, so the HTML served to anyone who
  did not run JavaScript was an empty `<app-root></app-root>`. That is everyone who matters for
  discovery: GPTBot, ClaudeBot, PerplexityBot and the search-time crawlers download a URL and read the
  response, and [they do not execute JavaScript](https://vercel.com/blog/the-rise-of-the-ai-crawler).
  Every page on the site was blank to all of them.

  `outputMode: 'static'` now renders all five routes at build time into plain HTML — no server and no
  serverless function; Vercel still serves static files. The notes and source panels changed from
  being removed by control flow to being hidden, because the code listing is the most useful thing on
  each page to anyone reading the HTML, and it was not in the HTML. Text per page roughly doubled.

  The gallery moved from `/gallery` to `/`. A `redirectTo` route prerenders as a meta-refresh stub
  with no content and no social tags, so the bare domain — the URL people share — had no preview card
  at all. `/gallery` now returns a permanent redirect.

  `npm run verify:prerender` fails if a route is missing from the output or ships under 600
  characters of text, and it runs on every pull request. There is also a `robots.txt` naming the AI
  crawlers explicitly, and a `sitemap.xml` generated from the pages the build actually produced, so
  it cannot list a page that does not exist.
- **The demo is redesigned**, and every example has copy / code / config panels. The dashboard example
  no longer leaves 452px of empty space at the bottom right.
- **The workspace `package.json` is renamed** to `masonry-angular-workspace`. It is `private` and
  never published, but sharing a name with the library made it easy to read the wrong version number
  out of the wrong file.

## 0.0.2 — 2026-09-12

**If you are on Angular 17 to 21, this is the release that lets you install the package at
all.** `0.0.1` declared a peer range of `^22.0.0`, so npm refused it everywhere else.

Nothing in the library's runtime changed. The one change that affects installing it is the peer
range; everything else is documentation, examples and project setup.

### Live examples

- **[StackBlitz starter](https://stackblitz.com/github/MeAkib/masonry-angular/tree/main/examples/stackblitz)**
  — a new `examples/stackblitz` project that runs in the browser with no setup. It installs
  `masonry-angular` from the npm registry rather than building from source, so it doubles as a check
  on the published package: if a release ships broken files or a wrong peer range, the starter stops
  booting.
- **`vercel.json`** deploys `projects/demo` — `npm ci`, then `npm run build` (which builds the
  library first, since the demo resolves it through a path mapping), serving `dist/demo/browser`
  with client-side routes rewritten to `index.html`. `engines.node` is now declared so Vercel picks
  a Node the Angular CLI accepts.

### `llms.txt`, for AI coding assistants

A [spec-conformant](https://llmstxt.org/) `llms.txt` at the repository root, served at the site root
of the deployed demo by an npm `prebuild` step so the two cannot drift.

Beyond linking the docs it states the five things an assistant most often gets wrong: calling a
`reloadItems()` that does not exist, setting a CSS width on an item, unquoted numeric breakpoint
keys, the missing `standalone: true` on Angular 17 and 18, and omitting `width`/`height` on images.
A model trained on `ngx-masonry` examples reaches for `reloadItems()` by default, so saying it plainly
is worth more than describing the API.

The npm README gains a matching "Copy-paste starting point": one complete component that compiles on
every supported version, with those traps marked in comments. Both blocks are extracted from the
published files and compiled on Angular 17 and 22 as part of verification.

### Contributing

`CONTRIBUTING.md` gains [Ways to help](CONTRIBUTING.md#ways-to-help) and
[Opening a pull request](CONTRIBUTING.md#opening-a-pull-request), ordered by what would help most
rather than by difficulty — which at this stage means bug reports and browser coverage ahead of
code. Issue templates for bug reports, feature requests and experience reports, plus a pull request
template.

### Documentation: two examples that did not compile

Both were in the README published to npm, so they were the first thing a new user copied.

**Breakpoint maps need quoted keys.** Every example wrote `[columns]="{ 0: 1, 768: 2 }"`. Angular's
template parser accepts only identifiers and strings as object keys, so that is a compile error —
`NG5002: Parser Error: Unexpected token 0` — on every supported major, 17 through 22. The examples
now read `[columns]="{ '0': 1, '768': 2 }"`. This is punctuation, not behaviour: JavaScript object
keys are strings either way, and `resolveColumnGeometry` returns the same column count for both. A
`provideNgMasonryGrid()` call in a `.ts` file was never affected, and still accepts either form.

**Angular 17 and 18 need `standalone: true`.** The component examples are written for 19 and later,
where standalone is the default. On 17 and 18 the same code fails with
`TS-992010: 'imports' is only valid on a component that is standalone`. The examples stay modern;
README and GETTING-STARTED now say what those two versions need. It is the only difference across
the supported range.

### Angular 17.1 and up, not just 22

The peer range was `^22.0.0`, which meant npm refused to install the package on any older Angular.
That was a mistake — nothing in the library needs 22. It is now:

```json
"peerDependencies": {
  "@angular/common": ">=17.1.0",
  "@angular/core": ">=17.1.0"
}
```

17.1 is the real floor, and it is not arbitrary: the package ships in Angular's partial-compilation
format, and the declaration for `input()` with a `transform` — which every shorthand input uses —
carries `minVersion: 17.1.0`. Below that the Angular linker cannot process it.

One published artifact serves every version; there is nothing to configure and no separate build.

`npm run verify:compat` proves it rather than asserting it: for each major it installs the packed
tarball with a plain `npm install` (no `--legacy-peer-deps`, so the peer range itself is under test)
and then builds a real application that uses the grid, items, spans, stamps, the sizer and `state()`.
Type-checking alone would not be enough — the linker only runs during a real build, and the linker is
the part that could reject an older Angular.

| Angular | Install | Build |
| ------- | ------- | ----- |
| 17.3.12 | clean | ok |
| 18.2.14 | clean | ok |
| 19.2.25 | clean | ok |
| 20.3.31 | clean | ok |
| 21.2.23 | clean | ok |
| 22.1.6 | clean | ok |

## 0.0.1

First release.

Cascading grid ("masonry") layout for Angular, with its own solver — no `masonry-layout`, no jQuery,
no `imagesLoaded`, and no runtime dependencies. 8.6 KB gzipped.

### What it does

- **Configured with plain attributes.** `columns`, `columnWidth`, `gutter`, `gutterX` and `gutterY`
  are top-level inputs, so the common case needs no object literal and no binding:
  `<masonry-grid columns="3" gutter="20">`. Everything else lives on `[options]`, and the two layer
  over application defaults from `provideNgMasonryGrid()`.
- **Signal-based and zoneless.** Standalone directives, `OnPush`, and a layout loop that runs
  entirely outside change detection.
- **Native CSS masonry, opt-in.** `native: true` hands the layout to browsers that ship
  `display: grid-lanes` — no measuring, no observers, no transforms. The switch is an `@supports`
  rule rather than a JavaScript check, so server-rendered HTML is already laid out on first paint.
  Browsers without it fall back to the JavaScript engine and look identical.
- **SSR-safe.** The server renders a CSS multi-column approximation; the first client pass swaps in
  real masonry in one synchronous write, with no layout shift.
- **Order that stays correct.** Item order is read from the DOM on every pass, so prepends, removals
  and reorders land where you put them. There is no `reloadItems()` to remember.
- Spans, stamps, CSS-driven column sizing, RTL, entry and exit effects, and `content-visibility` for
  very long grids.

### Reading the grid

`ready()`, `nativeActive()`, and `state()` — one signal carrying
`{ columns, columnWidth, contentHeight, itemCount, pass }`, written at the end of every pass.
Outputs: `layoutComplete`, `removeComplete`, `itemsLoaded`.

### Numbers

The solver places 10,000 items in 0.16 ms and 50,000 in 0.83 ms, and allocates nothing in a
steady-state relayout. 185 tests. The development-mode option validator is compiled out of production
builds entirely. [DOCS.md](projects/masonry-angular/DOCS.md#bundle-size) has a per-feature size
breakdown, measured by ablation with `npm run size:features`.

Requires Angular 17.1 or newer. Every major from 17.1 to 22 is verified by building a real
application against the published package.
