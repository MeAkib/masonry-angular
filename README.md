# masonry-angular — workspace

Angular workspace containing the **masonry-angular** library and a runnable example application.

| Project                   | Path                               | What it is                                                                                                                    |
| ------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `masonry-angular`         | `projects/masonry-angular`         | The publishable library. [Usage →](projects/masonry-angular/README.md) · [Full reference →](projects/masonry-angular/DOCS.md) |
| `masonry-angular/testing` | `projects/masonry-angular/testing` | Test doubles, published as a secondary entry point.                                                                           |
| `demo`                    | `projects/demo`                    | The example application. [Docs →](projects/demo/README.md)                                                                    |

The library positions items with its own solver — no `masonry-layout`, no jQuery — and is configured
by plain attributes (`<masonry-grid columns="3" gutter="20">`), with `[options]` for everything the
five shorthands do not cover. Each pass publishes one `state()` signal, and with `native: true` the
whole layout is handed to browsers that ship `display: grid-lanes`, decided by an `@supports` rule so
server-rendered HTML is already correct on first paint. 8.1 KB gzipped, no runtime dependencies.

## Getting started

```bash
npm install
npm start          # builds the library, then serves the examples on :4200
```

The example app resolves `masonry-angular` through a `tsconfig` path mapping to `dist/`, so the
library has to be built before the app can run. `npm start` does that for you; while working on both
at once, run `npm run watch:lib` in a second terminal.

## Scripts

|                       |                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `npm start`           | Build the library and serve the examples.                                                  |
| `npm run build:lib`   | Build the publishable package into `dist/masonry-angular`.                                 |
| `npm run watch:lib`   | Rebuild the library on change.                                                             |
| `npm test`            | Run the library test suite (vitest + jsdom).                                               |
| `npm run test:watch`  | Same, in watch mode.                                                                       |
| `npm run build`       | Build the library and a production bundle of the examples.                                 |
| `npm run pack:lib`    | Build and `npm pack` the package, to inspect what would publish.                           |
| `npm run release:dry` | Test, build, and show what `npm publish` would send.                                       |
| `npm run release`     | Test, build, and publish `dist/masonry-angular`.                                           |
| `npm run size`        | Measure the shipped bundle against `ngx-masonry`, `angular2-masonry` and `masonry-layout`. |
| `npm run format`      | Prettier over both projects.                                                               |

## Layout of the library

```
projects/masonry-angular/
├── src/lib/
│   ├── models/                   # every data shape — types only, no runtime code
│   │   ├── options.ts            # option types and the validation-issue shape
│   │   ├── layout.ts             # the solver's request and solution
│   │   ├── geometry.ts           # resolved column count and width
│   │   ├── events.ts             # layoutComplete / removeComplete payloads
│   │   ├── item.ts               # the item handle and the grid's per-item record
│   │   └── index.ts              # barrel
│   ├── core/
│   │   ├── layout-engine.ts      # the solver — pure, no Angular, no DOM
│   │   ├── column-resolver.ts    # container width + options -> column geometry
│   │   ├── native.ts             # CSS masonry detection and its grid-template-columns
│   │   ├── scheduler.ts          # coalesces every invalidation into one frame
│   │   └── host.ts               # the contract between the grid and its directives
│   ├── schemas/
│   │   ├── defaults.ts           # the frozen option defaults
│   │   └── parse.ts              # parsing, merging and structural comparison
│   ├── directives/
│   │   ├── masonry-grid-item.ts  # [masonryGridItem]
│   │   ├── masonry-grid-sizer.ts # [masonryGridSizer]
│   │   └── masonry-grid-stamp.ts # [masonryGridStamp]
│   ├── masonry-grid.ts           # <masonry-grid>
│   └── providers.ts              # provideNgMasonryGrid()
└── testing/                      # secondary entry point: masonry-angular/testing
```

The solver is deliberately isolated from Angular and from the DOM. It takes measured boxes in and
returns coordinates out, which keeps it trivially unit-testable and lets the component split every
layout pass into one read phase followed by one write phase. `core/native.ts` is the other half of
that story: where the browser can do the layout itself, it decides so in one memoised feature check
and the component never runs a pass at all.

For how the pieces fit together — the layout pass, the invalidation model, the solver and the
performance invariants — see [ARCHITECTURE.md](ARCHITECTURE.md).

## Tests

```bash
npm test
```

Coverage is split three ways: the solver and the column resolver are tested as pure functions, the
option layer is tested for defaults and rejection, and the component is tested end to end against a
real DOM with `ResizeObserver` and `requestAnimationFrame` stubbed by `GridTestHarness` — which makes
the multi-pass measurement behaviour deterministic to assert.

## Publishing

```bash
npm run release:dry   # test, build, and print exactly what would publish
npm run release       # test, build, and publish dist/masonry-angular
```

Only `dist/masonry-angular` is publishable. ng-packagr writes the manifest that consumers
need there — `exports`, the FESM bundle, the type definitions, and Angular as a _peer_
dependency — and copies the library README as the npm page.

Never run `npm publish` from the workspace root. This manifest describes the workspace, not
the package: it lists Angular as a runtime dependency and declares no entry point, so what
lands on npm cannot be imported and rewrites the dependency tree of whoever installs it.
`"private": true` is here to make that mistake impossible; leave it in place.

The version that matters is the one in `projects/masonry-angular/package.json`. The root
stays at `0.0.0`.

```bash
cd projects/masonry-angular
npm version minor       # bumps the manifest, commits, tags
cd ../..
npm run release
git push --follow-tags
```
