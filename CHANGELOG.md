# Changelog

## Unreleased

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
