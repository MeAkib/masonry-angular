# Contributing

This is a guide for someone who has never opened this repository. It covers how to get it running,
where the code lives, how a layout pass actually works, and step-by-step recipes for the changes
people most often need to make.

Read it once and you should be able to make a change with confidence. When you want the reasoning
behind the machinery rather than the instructions for changing it, read
[ARCHITECTURE.md](ARCHITECTURE.md) — this document points at it repeatedly rather than repeating it.

---

## Table of contents

- [Getting set up](#getting-set-up)
- [The scripts](#the-scripts)
- [Where everything lives](#where-everything-lives)
- [How a layout pass works](#how-a-layout-pass-works)
- [Common changes, as recipes](#common-changes-as-recipes)
- [Testing](#testing)
- [Debugging](#debugging)
- [Performance rules to not break](#performance-rules-to-not-break)
- [Publishing](#publishing)

---

## Getting set up

Node 22.22.3+ or 24.15+ — the Angular CLI refuses to run on anything older.

```bash
git clone <this repository>
cd ma
npm install
npm start          # builds the library, then serves the examples on :4200
```

**The one gotcha.** The demo application does not import the library from source. It imports the
package name `masonry-angular`, which the workspace `tsconfig.json` maps to `dist/`:

```json
"paths": {
  "masonry-angular": ["./dist/masonry-angular"],
  "masonry-angular/testing": ["./dist/masonry-angular/testing"]
}
```

So the library has to be **built** before the demo can resolve it, and a source change is invisible
to the demo until it is rebuilt. That is deliberate — the demo consumes exactly the package
consumers get, entry points and all, so a broken `exports` map or a missing type shows up here
rather than in someone's application. `npm start` runs the build for you once.

While working on the library and the demo at the same time, run the watcher in a second terminal:

```bash
npm run watch:lib   # terminal 1 — rebuilds dist/ on every save
npm start           # terminal 2 — serves the demo
```

Tests, unlike the demo, run against the sources directly, so `npm test` needs no build.

---

## The scripts

| Script                | What it does                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `npm start`           | Build the library, then serve the demo on `:4200`.                                         |
| `npm run build:lib`   | Build the publishable package into `dist/masonry-angular` (ng-packagr).                    |
| `npm run watch:lib`   | Same, rebuilding on every change.                                                          |
| `npm run build`       | Build the library and a production bundle of the demo.                                     |
| `npm test`            | Run the library test suite (Vitest + jsdom). 185 tests.                                    |
| `npm run test:watch`  | Same, in watch mode.                                                                       |
| `npm run format`      | Prettier over both projects.                                                               |
| `npm run pack:lib`    | Build and `npm pack` the package, to inspect what would publish.                           |
| `npm run release:dry` | Test, build, and print exactly what `npm publish` would send.                              |
| `npm run release`     | Test, build, and publish `dist/masonry-angular`.                                           |
| `npm run size`        | Build, then measure the shipped bundle gzipped, against the other masonry libraries.       |
| `npm run verify:native` | Check the native CSS path in a real Chromium (see [Testing](#testing)).                  |
| `npm run ng`          | The raw Angular CLI, for anything the scripts above do not cover.                          |

Two numbers worth knowing, both produced by scripts above rather than estimated: the production
bundle is **8.6 KB gzipped** (`npm run size`), and the suite is **185 tests** (`npm test`).

---

## Where everything lives

```
projects/masonry-angular/
├── src/lib/
│   ├── masonry-grid.ts             # <masonry-grid> — mostly wiring; start here
│   ├── providers.ts                # provideNgMasonryGrid()
│   ├── core/
│   │   ├── grid-options.ts         # merges defaults < [options] < shorthand inputs; memoises
│   │   ├── item-registry.ts        # who is in the grid; DOM-order collection; solver slots
│   │   ├── size-watcher.ts         # the single ResizeObserver; container/viewport/sizer widths
│   │   ├── item-styles.ts          # every style written onto an item; promote/demote
│   │   ├── motion.ts               # entry effects, movement transitions, exit clones
│   │   ├── layout-signature.ts     # the skip-if-nothing-changed hash
│   │   ├── native-grid.ts          # column resolution for the native path
│   │   ├── layout-engine.ts        # the pure solver — no Angular, no DOM
│   │   ├── column-resolver.ts      # width + options -> column count and column width
│   │   ├── native.ts               # feature detection + grid-template-columns
│   │   ├── scheduler.ts            # coalesces every invalidation into one frame
│   │   └── host.ts                 # the grid <-> directive contract
│   ├── schemas/
│   │   ├── defaults.ts             # the frozen option defaults
│   │   └── parse.ts                # merge, validate (dev only), resolve
│   ├── models/                     # every data shape — types only, no runtime code
│   │   ├── options.ts  layout.ts  geometry.ts  events.ts  item.ts  index.ts
│   └── directives/
│       ├── masonry-grid-item.ts    # [masonryGridItem]
│       ├── masonry-grid-sizer.ts   # [masonryGridSizer]
│       └── masonry-grid-stamp.ts   # [masonryGridStamp]
└── testing/                        # secondary entry point: masonry-angular/testing
```

Tests live beside the code they cover as `*.spec.ts` — `core/layout-engine.spec.ts`,
`schemas/options.spec.ts`, `masonry-grid.spec.ts`, and so on.

### Start here

Open [`src/lib/masonry-grid.ts`](projects/masonry-angular/src/lib/masonry-grid.ts) and read the
header comment. It lists the eight steps of a layout pass and names the file that performs each one,
which is the fastest map of the library there is.

Then read `runLayout()` in the same file, about two-thirds of the way down. It is roughly forty
lines and it is the whole story: everything the library does at runtime either leads into that
method or is called by it. The component itself owns almost no logic — it holds the collaborators,
exposes them to Angular, and sequences them.

From there, follow `runLayout()` outward into whichever collaborator you care about. Each file in
`core/` opens with a comment explaining its job and the decisions inside it; those comments are the
primary documentation and are kept current with the code.

---

## How a layout pass works

Everything that could change the layout — a resize, an added or removed item, an image finishing its
decode, an options change — calls `requestLayout()`, which asks `FrameScheduler` for a frame.
Any number of those calls within one frame collapse into a single pass. That pass is `runLayout()`,
and it runs in eight steps:

1. **Who is in the grid** — `ItemRegistry.collectOrdered()` (`core/item-registry.ts`) walks the
   container's real child list and returns the registered items in **page** order. Order comes from
   the DOM rather than from registration order, which is why prepending an item or reordering a
   `@for` needs no `reloadItems()` call. Ignored items are demoted back into flow here; unmeasured
   items and ones still waiting on images sit the pass out and drop in later.
2. **How big everything is** — `SizeWatcher` (`core/size-watcher.ts`) already holds the container
   width, the viewport width, the sizer width and every item's height. Nothing is read from the DOM
   here; the numbers arrived asynchronously from one shared `ResizeObserver`. The single exception
   is stamps, whose *positions* an observer never reports, so `ItemRegistry.stampBoxes()` reads
   `offsetLeft/Top/Width/Height` — and only when stamps exist.
3. **Turn width into columns** — `resolveColumnGeometry()` (`core/column-resolver.ts`) is a pure
   function of `(availableWidth, basisWidth, options, sizerWidth)` returning
   `{ columns, columnWidth }`.
4. **Give every item its width** — `ItemStyles.writeWidths()` (`core/item-styles.ts`).
5. **Would this pass change anything?** — `layoutSignature()` (`core/layout-signature.ts`) folds
   every input the solver reads into one 32-bit integer. If it matches the last pass, the pass
   returns here: nothing can have moved.
6. **Solve** — `MasonryLayoutEngine.solve()` (`core/layout-engine.ts`) takes measured heights and
   spans in and returns coordinates out. No Angular, no DOM.
7. **Write the coordinates** — `ItemStyles.writePosition()` writes each item's `transform`, and
   `promote()` takes newly placed items out of normal flow.
8. **Motion** — `Motion` (`core/motion.ts`) plays entry effects for items placed this pass and arms
   the movement transition for their *later* moves.

### The read/write split, and why it matters

Steps 1–3 only read from the DOM. Steps 4–8 only write to it. The two are never interleaved, and
that separation is the single biggest thing keeping the grid smooth.

The browser computes layout lazily. A style write marks layout dirty; a geometry read
(`offsetHeight`, `getBoundingClientRect()`, and friends) forces the browser to stop and recompute it
on the spot so it can answer. Alternating the two — write, read, write, read, once per item — makes
the browser re-run layout once per item. That is *layout thrashing*, and it is the classic way to
turn a grid of a few hundred items janky.

This library avoids it twice over. It batches all reads before all writes, so a pass costs at most
one forced reflow; and it takes almost every measurement from `ResizeObserver` entries, which carry
sizes the browser has *already* computed, so reading them forces nothing at all.

If you add DOM work, keep it on the correct side of that line. A single innocent `offsetHeight` in
the write phase undoes the whole arrangement, and no test will fail — jsdom has no layout engine to
thrash.

### Why the first layout takes two passes

An item cannot report its height until it has been given its width. A card at 300 px wide and the
same card at 150 px wide wrap their text differently and are different heights, so measuring before
the width is set measures the wrong thing.

So step 4 (`writeWidths`) runs **before** the early return for "nothing is measured yet", and that
ordering is load-bearing:

- **Pass 1** collects zero measured items, writes every item's width anyway, and returns early —
  leaving the CSS multi-column fallback painting rather than flashing an empty grid.
- The `ResizeObserver` then reports each item's height *at that width* and schedules another frame.
- **Pass 2** has real heights, solves, positions everything, removes the fallback class, sets
  `ready()` and emits `layoutComplete`.

`layoutComplete.pass` tells you which one you are looking at. Steady-state relayouts afterwards are
single passes; the doubling is a bootstrap cost, not a per-change one.

---

## Common changes, as recipes

### Adding a new option

Options are hand-written in four places rather than derived from a schema library — a schema runtime
would ship to every user of the library to catch mistakes the developer already made in TypeScript.
The cost of that decision is this checklist. Follow it in order.

1. **`models/options.ts`** — declare the field twice. Add it to `MasonryGridOptions` (authoring
   shape, every field optional) and to `ResolvedMasonryGridOptions` (post-resolution shape, required
   unless genuinely absent). Document it with a comment saying what it is *for*, not what its type
   is.
2. **`schemas/defaults.ts`** — add the default value to `DEFAULT_MASONRY_GRID_OPTIONS`. The object is
   deeply frozen and tagged `satisfies ResolvedMasonryGridOptions`, so a missing field is a compile
   error here.
3. **`schemas/parse.ts`, `resolve()`** — fill the field: `myOption: input.myOption ?? d.myOption`.
   This function runs in production, so it stays dumb: no validation, no branching beyond the
   defaulting. A nested group is spread over its default (`{ ...d.ssr, ...input.ssr }`) so a partial
   override keeps its siblings.
4. **`schemas/parse.ts`, `validate()`** — add a check: `collector.boolean('myOption', value['myOption'])`,
   `collector.number(...)` with `min`/`max`/`integer`, or `collector.enum(...)` with the allowed
   values. Cross-field rules go at the bottom of the function, after the per-field ones, so the
   report reads in a sensible order. All of this is inside an `ngDevMode` guard and is dropped
   entirely from production builds — so be as thorough as you like, and write the message you would
   want to receive.
5. **Use it.** Read `options().myOption` wherever the behaviour lives. Never read the raw
   `optionsInput()`; `options()` is the merged, validated, fully defaulted value.
6. **If it changes the layout, fold it into `layoutSignature()`.** See
   [the warning below](#the-easiest-mistake-to-make).
7. **Test it** in `schemas/options.spec.ts`: one case for the default, one for a valid override, one
   for the rejection message.

A test in that file — *"is exactly what an empty configuration resolves to"* — asserts that
`parseMasonryGridOptions({})` reproduces `DEFAULT_MASONRY_GRID_OPTIONS` key for key. If you add the
field to the types and the defaults but forget `resolve()`, that test is what tells you.

### Adding a shorthand input

Shorthands are the five fields common enough to deserve a plain HTML attribute — `columns`,
`columnWidth`, `gutter`, `gutterX`, `gutterY` — so the ordinary grid needs no binding and no object
literal. Everything else stays on `[options]`. Adding a sixth is a deliberate act: each one is a
second way to say the same thing, and the merge order has to be documented.

1. The field must already exist on `MasonryGridOptions` — do the recipe above first if it does not.
2. **`masonry-grid.ts`** — declare the input with the coercion transform:

   ```ts
   readonly myOption = input<number | undefined, number | string | undefined>(undefined, {
     transform: coerceShorthand,
   });
   ```

   `coerceShorthand` (in `core/grid-options.ts`) turns the string an HTML attribute produces into a
   number, and passes a non-numeric string through *untouched* on purpose: the dev-mode validator
   downstream reports it with a precise field path, which beats a silent `NaN`.
3. **`masonry-grid.ts`, the `options` computed** — add the field to the shorthand object handed to
   `optionsResolver.resolve()`. That object is the highest-precedence source in the merge; nothing
   else needs to change.
4. **Test it** in `shorthand.spec.ts`: the bare attribute form (`myOption="3"`), the bound form, and
   that it beats the same field set through `[options]`.

### Changing how items are positioned

Everything written onto an item's `style` lives in **`core/item-styles.ts`**, and nothing else in
the library touches an item's inline styles. That makes it the one file to open when an item looks
wrong on screen.

- `writeWidths()` — the width, and the `content-visibility` / `contain-intrinsic-size` hints.
- `writePosition()` — the `transform`.
- `promote()` / `demote()` — moving an item out of normal flow and back. They must stay exact
  inverses: `demote()` clears every property `promote()` and `writeWidths()` set, and resets the
  `last*` bookkeeping to sentinels so the next placement writes everything fresh. `masonryIgnore`
  depends on that symmetry.

Each write is guarded by a `last*` comparison so an unchanged pass writes nothing. Keep new writes
guarded the same way, and keep positions on `transform` — see
[Performance rules](#performance-rules-to-not-break).

### Changing the packing algorithm

`core/layout-engine.ts` is a pure function in class clothing: measured heights and spans in,
coordinates out. No Angular, no DOM, no options object — the component translates for it. It is
comfortably the easiest thing in this repository to change and to test, and it is exported publicly
so it also runs in a worker or on the server.

Work in `layout-engine.spec.ts`, which is a plain function test: construct a request, call `solve()`,
assert on the returned `positions`. No harness, no fixture, no DOM.

Things to preserve while you are in there:

- **Tie-breaking is deterministic.** `shortestColumn()` improves only strictly, by more than
  `EPSILON` (0.001). Without that, floating-point noise in measured heights lets two equal columns
  swap between passes and items visibly jitter.
- **The buffers are reused.** `positions`, `widths` and `columnHeights` are `Float64Array`s that grow
  geometrically and are shared between passes. The returned solution *aliases* them — it is read
  immediately in the write phase and never retained. Do not hand a solution to anything that stores
  it.
- **`verticalOrigin: 'bottom'` is a reflection of the finished packing, not a second algorithm.**
  Keep it that way; one code path is why it is exact.

For reference, the solver places 10,000 items in 0.16 ms and 50,000 in 0.83 ms. It is not the
bottleneck, and it does not need to be made cleverer at the cost of being readable.

### The easiest mistake to make

**Anything that adds or changes an input to the solver must also be folded into `layoutSignature()`,
or your change will be silently skipped.**

`core/layout-signature.ts` hashes every input `solve()` reads. When the hash matches the previous
pass, `runLayout()` returns before solving and before writing anything — that is what makes dragging
a window edge cheap, since the observer fires every frame but only the frames that actually change
the geometry do any work.

The failure mode is nasty precisely because it is not a crash. Add an option that changes positions,
forget the signature, and the grid will look right whenever *something else* also changed — a
resize, an added item — and stale the rest of the time. Tests written against a fresh fixture pass,
because the first pass always runs.

Two things make it survivable, and neither is a substitute for remembering:

- `FORCE_NEXT_LAYOUT` (the value `0`) is a sentinel meaning "run the next pass regardless". The
  options `effect` sets it, so a change to `options()` always forces one pass. That covers option
  changes, and **not** anything that reaches the solver by another route.
- The hash never returns `0`, so a real signature can never be mistaken for the sentinel.

When you add a solver input, add a case to `layout-signature.spec.ts` asserting the signature
changes when it does. That test is the guard.

---

## Testing

```bash
npm test              # the whole suite: 185 tests
npm run test:watch    # the same, in watch mode
```

Coverage is split three ways, deliberately, and each layer is tested with the cheapest tool that can
prove the thing:

| Layer                | Files                                                        | How it is tested                                                            |
| -------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Pure functions       | `layout-engine.spec.ts`, `column-resolver.spec.ts`, `layout-signature.spec.ts`, `native.spec.ts` | Plain function calls. Numbers in, numbers out. No DOM, no fixture. |
| The option layer     | `schemas/options.spec.ts`, `shorthand.spec.ts`               | Merge order, defaults, dev-mode rejection messages, structural equality.     |
| The component        | `masonry-grid.spec.ts`, `item-registry.spec.ts`, `native-layout.spec.ts` | End to end in jsdom against `TestBed`, with `GridTestHarness` driving time and measurement. |

### Running one file

The test target takes globs relative to the project root, and a name filter:

```bash
npm test -- --include=src/lib/core/layout-engine.spec.ts
npm test -- --filter "signature"
```

### Why jsdom needs the harness

jsdom implements no layout engine, no `ResizeObserver`, and no Web Animations API. Every element in
it is zero by zero forever. A component test therefore cannot observe the browser measuring
anything, which is exactly the mechanism the grid is built around.

`GridTestHarness` (from the `masonry-angular/testing` entry point) supplies deterministic doubles
for all three, which turns that gap into an advantage — the test *states* the measurements instead
of hoping for them:

```ts
harness.install();                                    // patches rAF/cAF, ResizeObserver, Element.animate
// … create the fixture, detectChanges …
harness.flushFrames();                                // pass 1 runs: widths are written
harness.measure(new Map([[el, { width: 100, height: 80 }]]));  // the "browser" reports sizes
harness.flushFrames();                                // pass 2 runs: items are positioned
expect(el.style.transform).toBe('translate(0.00px, 0.00px)');
harness.finishAnimations();                           // settle entry/exit effects
harness.uninstall();
```

`flushFrames()` drains repeatedly, because a pass can queue another frame — the deferred
transition-enabling frame, for instance. `harness.observedElements()` is useful for asserting what
the grid is *not* doing: that a native grid measures nothing, or that a destroyed grid let go of its
items.

### The one thing jsdom cannot test

The `native: true` path hands layout to the browser through an `@supports` rule in the component's
stylesheet. jsdom can prove the library stays out of the way — no observers, no transforms, no
solving — but not that the CSS it emits produces a masonry grid, because there is no engine to
produce one.

```bash
npm run build:lib
npm run verify:native
```

That script pulls the component's compiled stylesheet out of the built bundle (never a hand-copy, so
the two cannot drift), renders items of known heights in a real Chromium, and checks the geometry the
browser actually computed. It needs Playwright's browser binary, which is not installed by
`npm install`:

```bash
npx playwright install chromium
```

Without it the script prints a note and exits 0, so it is safe to run — and safe to leave in a
pipeline — on a machine that does not have it.

---

## Debugging

**Start with `layoutComplete`.** Every pass emits it, and the payload carries more than the
geometry:

```ts
grid.layoutComplete.subscribe((e) => console.log(e.pass, e.durationMs, e.columns, e.itemCount));
```

- `pass` is the pass number. If it is stuck at 1, the grid never got real measurements — see below.
  If it climbs on every frame while nothing visibly changes, something is forcing passes that the
  signature should be skipping.
- `durationMs` is measured around the whole pass, solve and writes included. On a normal grid it is
  a fraction of a millisecond; if it is not, the interesting question is usually how often it fires,
  not how long it takes.

**Read `state()` and `ready()`.** `state()` is one signal carrying `columns`, `columnWidth`,
`contentHeight`, `itemCount` and `pass` — written once per pass, so its fields can never disagree
with each other. `ready()` flips true after the first real layout; while it is false the CSS
multi-column fallback is what you are looking at.

**Development builds warn, in prose.** All of it is behind `ngDevMode` and dropped from production:
a `masonryGridSizer` competing with `columns`/`columnWidth`, `verticalOrigin: 'bottom'` used with
stamps, options the native path cannot honour, and `masonryIgnore` under native layout. Bad
`[options]` throws a `MasonryGridOptionsError` listing every problem with its field path. Warnings
fire once each, not once per item.

**A stuck grid — items visible but never positioned — is almost always one of two things:**

1. **An item never reported a size.** `collectOrdered()` skips unmeasured items, and if none are
   measured the pass returns early and the fallback keeps painting. Usually the item is
   `display: none`, has zero height of its own, or was moved out from under the grid element so it
   is no longer a child of the container. Check `grid.items()` (registered elements, in DOM order)
   against what the harness or the browser reports observing.
2. **`awaitImages` is waiting on an image that never resolves.** An item holds itself back until
   every `<img>` inside it has decoded. Images that are `complete`, `loading="lazy"` or have no
   `currentSrc` are skipped precisely because they might never resolve — but a `src` that 404s
   behind a service worker, or an image swapped mid-decode, can still strand one. `itemsLoaded`
   never firing is the tell. `awaitImages: false` confirms the diagnosis in one line.

**When a change appears to do nothing at all,** check the signature before anything else. See
[the warning above](#the-easiest-mistake-to-make). `grid.layout()` forces a pass past both the
signature and the frame queue, so if calling it makes your change appear, the signature is what is
missing.

---

## Performance rules to not break

These are properties of the implementation, not preferences. Breaking one is a regression even when
every test still passes — which several of them will, since jsdom cannot observe any of this.
[ARCHITECTURE.md](ARCHITECTURE.md#performance-invariants) has the full table and what enforces each
one; these four are the ones a change is most likely to violate.

- **One shared `ResizeObserver`, never one per item.** A single observer with many targets is
  markedly cheaper, and its entries carry sizes the browser has already computed — reading them
  forces no reflow. `SizeWatcher` owns it, and it is the only observer in the library. If you need a
  new measurement, add a target and a branch in `onResize()`, not a second observer.
- **No DOM reads in the write phase.** Reads belong in steps 1–3, before anything is written. See
  [the read/write split](#the-readwrite-split-and-why-it-matters).
- **A steady-state relayout allocates nothing.** The solver's `Float64Array`s, the registry's
  `ordered`/`measured`/`stampBox` buffers and the `MeasuredSlot` objects are all reused between
  passes — truncated with `.length = 0` and overwritten in place, never reallocated.
  `layoutSignature()` takes positional arguments for the same reason: an options object literal on
  the hot path would allocate on every frame of a resize, including the frames it is about to skip.
- **Positions are 2D `translate`, never `translate3d`.** `translate3d` promotes every item to its own
  compositor layer: fine for five items, a memory problem for five thousand. For the same reason
  only `transform` is transitioned — transitioning `width` would re-run layout for every item on
  every frame of a resize.

---

## Publishing

```bash
npm run release:dry   # test, build, and print exactly what would publish
npm run release       # test, build, and publish dist/masonry-angular
```

Only `dist/masonry-angular` is publishable. ng-packagr writes the manifest that consumers need
there — `exports`, the FESM bundle, the type definitions, and Angular as a *peer* dependency — and
copies the library README as the npm page.

**Never run `npm publish` from the workspace root.** That manifest describes the workspace, not the
package: it lists Angular as a runtime dependency and declares no entry point, so what lands on npm
cannot be imported and rewrites the dependency tree of whoever installs it. `"private": true` in the
root `package.json` exists to make that mistake impossible; leave it in place.

The version that matters is the one in `projects/masonry-angular/package.json` — that is the manifest
ng-packagr copies into `dist/`. The root manifest's version is never published and is not the
library's.

```bash
cd projects/masonry-angular
npm version minor       # bumps the manifest, commits, tags
cd ../..
npm run release
git push --follow-tags
```
