# masonry-angular — full reference

Everything the library exposes, in detail. For installation and the five-minute version, start with
[the README](./README.md); for how it works internally, see
[ARCHITECTURE.md](../../ARCHITECTURE.md).

## Contents

- [Options](#options)
  - [Shorthand inputs](#shorthand-inputs)
  - [Layout mode](#layout-mode)
  - [Sizing](#sizing)
    - [Named breakpoints](#named-breakpoints)
  - [Spacing and direction](#spacing-and-direction)
  - [Motion](#motion)
  - [Loading and scale](#loading-and-scale)
  - [SSR](#ssr)
- [Application-wide defaults](#application-wide-defaults)
- [Items](#items)
- [Stamps](#stamps)
- [Sizing from CSS](#sizing-from-css)
- [Native CSS masonry](#native-css-masonry)
- [Reading and driving the grid](#reading-and-driving-the-grid)
- [Styling](#styling)
- [Server-side rendering](#server-side-rendering)
- [Testing](#testing)
- [Using the solver on its own](#using-the-solver-on-its-own)
- [How it stays fast](#how-it-stays-fast)
- [Bundle size](#bundle-size)
- [Differences from `ngx-masonry` / `angular2-masonry`](#differences-from-ngx-masonry--angular2-masonry)

---

## Options

Every option is optional; the defaults below are what you get from `<masonry-grid>` with nothing set
at all.

### Shorthand inputs

The five fields almost every grid sets are top-level inputs on `<masonry-grid>`, so the common case
needs no object literal — and, because each accepts the string an HTML attribute gives it, no
binding either:

| Input         | As an attribute     | As a binding                        |                                                                              |
| ------------- | ------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `columns`     | `columns="3"`       | `[columns]="{ 0: 1, 768: 3 }"`      | Fixed count, or counts keyed by breakpoint. Mutually exclusive with `columnWidth`. |
| `columnWidth` | `columnWidth="260"` | `[columnWidth]="cardWidth()"`       | Target column width in px; the count follows the available space.            |
| `gutter`      | `gutter="20"`       | `[gutter]="dense() ? 8 : 24"`       | Gap in px, both axes.                                                        |
| `gutterX`     | `gutterX="24"`      | `[gutterX]="…"`                     | Horizontal gap, when it should differ from `gutter`.                         |
| `gutterY`     | `gutterY="8"`       | `[gutterY]="…"`                     | Vertical gap, when it should differ from `gutter`.                           |

They mean exactly what the options of the same name mean — [Sizing](#sizing) and
[Spacing and direction](#spacing-and-direction) below are the reference for both forms.

`[options]` carries everything the five shorthands do not, and the two layer. Three sources are
merged, in this order:

1. application-wide defaults from [`provideNgMasonryGrid()`](#application-wide-defaults)
2. `[options]` on the grid
3. any shorthand input that is set

So a shorthand always wins over the same field in `[options]`, and `[options]` always wins over the
application default. Mixing them is the normal case, not a fallback:

```html
<masonry-grid columns="4" [options]="{ horizontalOrder: true, entryAnimation: false }">…</masonry-grid>
```

`columns` and `columnWidth` stay mutually exclusive _across_ the layers rather than colliding
inside them: setting the `columnWidth` shorthand clears a `columns` arriving from `[options]` or
from the application defaults, and setting `columns` clears an inherited `columnWidth`. That is what
lets a single grid opt out of an application-wide `columns` map with one attribute.

The merged result is validated, fully defaulted, and memoised on structural equality — so an inline
`[options]="{ … }"` literal, which allocates a fresh object on every change detection run, costs
nothing and never queues a layout pass on its own.

### Layout mode

| Option   | Type      | Default |                                                                                                                              |
| -------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `native` | `boolean` | `false` | Let the browser lay the grid out with native CSS masonry where it supports it. See [Native CSS masonry](#native-css-masonry). |

### Sizing

| Option                      | Type                           | Default        |                                                                                                                |
| --------------------------- | ------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `columns`                   | `number \| MasonryBreakpoints` | `3`            | Fixed count, or counts keyed by breakpoint name or raw min-width. See [named breakpoints](#named-breakpoints). |
| `breakpoints`               | `Record<string, number>`       | Tailwind scale | What the names in `columns` mean, in px. Overrides merge over the defaults.                                    |
| `columnWidth`               | `number`                       | —              | Target column width in px; the count is derived from the space available. Mutually exclusive with `columns`.   |
| `stretchColumns`            | `boolean`                      | `true`         | With `columnWidth`, grow columns to fill the row instead of leaving a ragged edge.                             |
| `minColumns` / `maxColumns` | `number`                       | `1` / —        | Clamp the resolved count.                                                                                      |
| `breakpointBasis`           | `'container' \| 'viewport'`    | `'container'`  | What breakpoints are matched against. Container-based works inside sidebars and modals.                        |
| `fitWidth`                  | `boolean`                      | `false`        | Shrink the grid to the width its columns actually occupy, so it can be centred.                                |

```html
<masonry-grid [columns]="{ 0: 1, 640: 2, 1024: 3, 1440: 4 }">  <!-- responsive -->
<masonry-grid columnWidth="260">                               <!-- as many 260px columns as fit -->
```

#### Named breakpoints

`columns` accepts a breakpoint name, a raw minimum width in px, or a mix of the two. Whichever form
is used, the count that applies is the one for the largest breakpoint at or below the measured
width — and that width is the container's unless `breakpointBasis: 'viewport'` says otherwise.

```html
<masonry-grid [columns]="{ sm: 1, md: 2, lg: 3, xl: 4 }">   <!-- named -->
<masonry-grid [columns]="{ 0: 1, 640: 2, 1440: 4 }">        <!-- raw widths -->
<masonry-grid [columns]="{ xs: 1, md: 2, 1440: 5 }">        <!-- both -->
```

The default scale is Tailwind's, exported as `DEFAULT_MASONRY_BREAKPOINTS`:

| Name | `xs` | `sm`  | `md`  | `lg`   | `xl`   | `2xl`  |
| ---- | ---- | ----- | ----- | ------ | ------ | ------ |
| px   | `0`  | `640` | `768` | `1024` | `1280` | `1536` |

`breakpoints` redefines them. It **merges** over the defaults, so naming one does not drop the rest,
and a name of your own can be added alongside them:

```ts
provideNgMasonryGrid({
  breakpoints: { md: 900, tablet: 820 }, // `md` moves, `tablet` is new, the others stand
  columns: { xs: 1, tablet: 2, md: 3 },
});
```

Declaration order does not matter — stops are sorted by width. A name that is not in the scale is a
validation error in development, and the message lists the names that are available.

### Spacing and direction

| Option                | Type                | Default  |                                                                                                        |
| --------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `gutter`              | `number`            | `16`     | Gap in px, both axes.                                                                                  |
| `gutterX` / `gutterY` | `number`            | `gutter` | Per-axis override.                                                                                     |
| `horizontalOrder`     | `boolean`           | `false`  | Fill row by row instead of always seeking the shortest column. Tidier rows, taller grid.               |
| `direction`           | `'ltr' \| 'rtl'`    | `'ltr'`  | Lay out from the right edge.                                                                           |
| `verticalOrigin`      | `'top' \| 'bottom'` | `'top'`  | Stack upward from the bottom edge — `masonry-layout`'s `originTop: false`. Not compatible with stamps. |

The three gutter fields are also [shorthand inputs](#shorthand-inputs), so the usual case is an
attribute:

```html
<masonry-grid columns="3" gutter="20">…</masonry-grid>              <!-- 20px on both axes -->
<masonry-grid columns="3" gutterX="24" gutterY="8">…</masonry-grid> <!-- wider columns than rows -->
```

`direction` and `verticalOrigin` have no shorthand, so they go on `[options]`:

```html
<masonry-grid columns="3" gutter="20" [options]="{ direction: 'rtl' }">…</masonry-grid>
```

### Motion

| Option                                  | Type                | Default                      |                                                                                                                                                                                                     |
| --------------------------------------- | ------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transition.duration`                   | `number`            | `300`                        | Position transition in ms. `0` disables it.                                                                                                                                                         |
| `transition.easing`                     | `string`            | `cubic-bezier(0.2, 0, 0, 1)` |                                                                                                                                                                                                     |
| `entryAnimation`                        | `object \| false`   | fade + rise                  | Web Animations effect for newly placed items.                                                                                                                                                       |
| `entryAnimation.keyframes`              | `Keyframe[]`        | opacity + translate          | **Must not animate `transform`** — it belongs to the layout engine. Use the `translate`, `scale` and `rotate` longhands, which compose with it. The schema rejects keyframes that would break this. |
| `entryAnimation.stagger` / `maxStagger` | `number`            | `24` / `200`                 | Per-item delay within a batch, and a ceiling on it.                                                                                                                                                 |
| `entryAnimation.animateInitial`         | `boolean`           | `true`                       | Set `false` when server-rendering, where the first batch is already painted.                                                                                                                        |
| `exitAnimation`                         | `object \| false`   | fade + shrink                | Web Animations effect for removed items. See the note below on how it works.                                                                                                                        |
| `exitAnimation.keyframes`               | `Keyframe[]`        | opacity + scale              | Same `transform` restriction as entry keyframes.                                                                                                                                                    |
| `exitAnimation.duration` / `easing`     | `number` / `string` | `200` / ease-in              | `duration: 0` disables the effect, as does `exitAnimation: false`.                                                                                                                                  |

#### How the exit effect works

Angular detaches an item's element _before_ it runs the directive's destroy hook, so by the time the
grid learns an item is leaving there is no element left to animate. It therefore clones the element,
parks the clone at the item's last position — the inline `position`, `width` and `transform` come
along with it — animates that, and discards it.

Two consequences worth knowing: the clone is inert, so anything stateful inside a leaving item
(a playing video, an iframe) restarts for the duration of the effect; and the clone is marked
`aria-hidden="true"` with `pointer-events: none`, so it is invisible to assistive technology and to
the mouse. Set `exitAnimation: false` if you would rather items vanish immediately.

### Loading and scale

| Option              | Type      | Default |                                                                                                                                     |
| ------------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `awaitImages`       | `boolean` | `true`  | Hold an item back until its images have `decode()`d, so it is measured at the height it will render. Lazy images are never awaited. |
| `resizeDebounce`    | `number`  | `0`     | Debounce container resizes in ms. `0` coalesces to the next frame, which suits most grids; raise it for very large ones.            |
| `contentVisibility` | `boolean` | `false` | Apply `content-visibility: auto` with a measured `contain-intrinsic-size`, letting the browser skip rendering off-screen items.     |
| `autoLayout`        | `boolean` | `true`  | Lay out as soon as the grid initialises. `false` holds the pre-layout rendering until you call `layout()`.                          |
| `observeResize`     | `boolean` | `true`  | React to container resizes. `false` pins the layout to the width first measured; item size changes still trigger a pass.            |
| `resizeContainer`   | `boolean` | `true`  | Set the host height to the content height. `false` leaves the height to your stylesheet.                                            |

### SSR

| Option         | Type                  | Default     |                                   |
| -------------- | --------------------- | ----------- | --------------------------------- |
| `ssr.fallback` | `'columns' \| 'none'` | `'columns'` | Pre-hydration rendering strategy. |
| `ssr.columns`  | `number`              | `2`         | Column count for that fallback.   |

## Application-wide defaults

```ts
bootstrapApplication(App, {
  providers: [
    provideNgMasonryGrid({
      gutter: 24,
      columns: { 0: 1, 768: 2, 1280: 4 },
      transition: { duration: 200 },
    }),
  ],
});
```

Per-grid `[options]` merge over these, nested groups included — `[options]="{ transition: { duration: 0 } }"`
keeps the provided easing — and a [shorthand input](#shorthand-inputs) on the grid wins over both.
Defaults are validated at bootstrap, so a mistake fails immediately with a path-annotated message
rather than being silently ignored.

## Items

```html
<article masonryGridItem [masonryColSpan]="2">…</article>
```

`masonryColSpan` widens an item across whole columns (clamped to the current count). A spanning item is
placed in the group of adjacent columns with the lowest shared top edge.

## Stamps

A stamp is a region items flow around rather than overlap. You position it; the grid measures it.

```html
<masonry-grid>
  <aside masonryGridStamp style="position: absolute; top: 0; right: 0; width: 320px">…</aside>
  @for (item of items(); track item.id) {
  <article masonryGridItem>…</article>
  }
</masonry-grid>
```

> Stamps and `verticalOrigin: 'bottom'` do not work together: stamps are resolved against the top
> edge and then mirrored with the rest of the layout, so items flow around the wrong region. A
> development build warns when it sees both.

## Sizing from CSS

`masonryGridSizer` marks an element whose measured width becomes the column width, so a stylesheet
owns the sizing instead of the options object. It replaces `masonry-layout`'s
`columnWidth: '.grid-sizer'`.

```html
<masonry-grid>
  <div masonryGridSizer class="sizer"></div>
  @for (photo of photos(); track photo.id) {
  <article masonryGridItem>…</article>
  }
</masonry-grid>
```

```css
.sizer {
  width: 50%;
  height: 0;
}
@media (min-width: 900px) {
  .sizer {
    width: 25%;
  }
}
```

The sizer stays in normal flow and is never positioned, so give it no height. It takes precedence
over both `columns` and `columnWidth`, and `stretchColumns` does not apply — the element states the
width, so the grid honours it exactly. A development build warns if you set a conflicting option.

## Native CSS masonry

CSS Grid Level 3 adds a real masonry layout, spelled `display: grid-lanes`. Safari 26.4 ships it
unflagged; Chromium exposes an earlier prototype spelled `display: masonry` behind a flag. As of
September 2026 that is around 11% of users, so this is an enhancement for the browsers that have it,
not a replacement for the engine — every other browser keeps the JavaScript path and looks the same.

It is off by default. `native: true` opts a grid in:

```html
<masonry-grid columnWidth="260" gutter="20" [options]="{ native: true }">…</masonry-grid>
```

Where the browser supports it, the library does nothing: no `ResizeObserver` on items, no measuring,
no width writes, no transforms, no waiting on images to decode, no solver. The browser packs the
grid and re-packs it on resize, on content changes and as images load, on its own.

### Why the switch lives in CSS

The decision is an `@supports` rule in the component's stylesheet rather than a check in JavaScript:

```css
@supports (display: grid-lanes) {
  :host(.masonry-grid--native) {
    display: grid-lanes;
    grid-template-columns: var(--masonry-native-columns);
    column-gap: var(--masonry-gutter-x);
    row-gap: var(--masonry-gutter-y);
  }
}
```

A browser that has the feature therefore applies the real masonry layout to the server's HTML on
first paint, before any JavaScript has loaded, and there is nothing to hydrate. A JavaScript check
could not do that: the server does not know what the visitor's browser supports, and by the time the
client found out, the first paint would already have happened. A browser that matches neither rule
keeps the multi-column fallback and hands over to the engine exactly as before.

Two spellings are accepted because the feature was renamed mid-flight — `grid-lanes` is the final
syntax, `masonry` is Chromium's prototype — and they take the same `grid-template-columns` and
`gap`, so the two rules are identical and a browser drops the one it cannot parse.

Firefox's much older `grid-template-rows: masonry` is deliberately **not** accepted: it is a
different mechanism layered on a regular grid, it sits behind a non-default flag, and it is being
replaced by `grid-lanes` rather than shipped. Those browsers get the JavaScript engine, which is the
right answer for them anyway.

### How the column count is decided

`columnWidth` and a fixed `columns` become a single declaration that already describes the whole
responsive behaviour, so those grids observe nothing at all:

| Configuration       | `grid-template-columns`                            |
| ------------------- | -------------------------------------------------- |
| `columnWidth="260"` | `repeat(auto-fill, minmax(min(100%, 260px), 1fr))` |
| `columns="4"`       | `repeat(4, 1fr)`                                   |

The `min(100%, …)` is what keeps a single narrow column from overflowing its container.

A breakpoint map is the one case CSS cannot express on its own, because the counts are yours rather
than derived from a track size. Such a grid keeps **one** container `ResizeObserver` alive to
re-evaluate which stop applies and rewrite `repeat(n, 1fr)`. Either way nothing per-item is observed.

`[masonryColSpan]="2"` still works: the item directive writes `grid-column: span 2` and the browser
honours it.

### What the browser cannot honour

The browser owns the packing algorithm while it is in charge, so options that describe a different
algorithm simply do not apply: `horizontalOrder`, `verticalOrigin: 'bottom'`, `fitWidth`,
`stretchColumns: false` and `masonryGridStamp`. A development build warns once, naming the ones it
found, rather than leaving you to wonder why `fitWidth` stopped doing anything. `[masonryIgnore]` is
inert for the same reason — the grid never walks the items, so there is nothing to take one out of.

Set `native: false` on a grid that needs any of them; nothing else about it changes.

### Reading it back

`nativeActive()` is `true` when the browser is actually in charge — `native: true` _and_ the feature
present. It is always `false` on the server. `state().columnWidth` is `0` in that mode: the browser
owns the track sizes and never reports them, and a number the library did not compute would be a
guess. `state().columns` stays accurate, read back from the resolved `grid-template-columns` for a
`columnWidth` grid.

`supportsNativeMasonry()` is exported if you need the same answer elsewhere. It returns `false` on
the server, where the question is about the wrong machine.

## Reading and driving the grid

```html
<masonry-grid #grid="masonryGrid" columns="3" (layoutComplete)="onLayout($event)">…</masonry-grid>
<p>{{ grid.state().columns }} columns at {{ grid.state().columnWidth }}px</p>
```

Signals:

|                  |                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready()`        | `true` once the browser has completed the first real layout pass.                                                                                        |
| `state()`        | `{ columns, columnWidth, contentHeight, itemCount, pass }`, written as one value at the end of every pass. `pass` is `0` before the first.                |
| `nativeActive()` | `true` while the browser is laying the grid out itself. See [Native CSS masonry](#native-css-masonry).                                                    |

`state()` is one signal rather than five because those values are written together and almost always
read together — and because `columns`, `columnWidth` and `gutter` now name the grid's
[inputs](#shorthand-inputs), which is what a reader expects those names to mean.

`items()` returns the registered item elements in DOM order — the replacement for
`getItemElements()`. It is the registry, so it includes ignored and not-yet-measured items.

Outputs:

|                  |                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layoutComplete` | `{ columns, columnWidth, itemCount, height, width, durationMs, pass }`, after every pass.                                                                  |
| `removeComplete` | `{ removed }`, once a batch of removed items has finished leaving. Batched: removing ten items in one change emits once with `removed: 10`, not ten times. |
| `itemsLoaded`    | The registered item count, once the last item waiting on `awaitImages` has decoded. Never fires when nothing had to wait.                                  |

Methods — you rarely need them, since sizes, option changes and collection changes are all picked up
automatically:

|                   |                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `requestLayout()` | Queue a pass on the next frame. Calls within a frame collapse into one.                                       |
| `layout()`        | Run a pass now, bypassing the dirty check. Use after mutating item content in a way the observers cannot see. |
| `remeasure()`     | Discard cached measurements, re-read every item, lay out again.                                               |

### Leaving an item out

`[masonryIgnore]` takes an item out of the layout and returns it to normal flow without unregistering it
— outlayer's `ignore()`, but declarative and reversible:

```html
<div masonryGridItem [masonryIgnore]="item.pinned">…</div>
```

## Styling

The grid sets two custom properties on its host, so your CSS can follow the resolved geometry:

```css
.masonry-item {
  font-size: clamp(0.8rem, calc(var(--masonry-column-width) / 20), 1rem);
}
```

`--masonry-column-width`, `--masonry-columns`, plus `--masonry-gutter-x` / `--masonry-gutter-y`.

Host classes: `.masonry-grid`, `.masonry-grid--ready` once the client has taken over, `.masonry-grid--fallback`
while the multi-column approximation is showing, and `.masonry-grid--native` when `native: true` is
set — that last one is what the `@supports` rules key off, so it is present even in browsers that
ignore them. Items carry `.masonry-item` and stamps `.masonry-stamp`.

## Server-side rendering

Nothing to configure. On the server the grid renders a CSS multi-column approximation, so the HTML is
useful without JavaScript and search engines see real content. On hydration the first pass swaps to
absolute positioning in a single synchronous write, so there is no frame in which items are half
positioned. Pair it with `entryAnimation.animateInitial: false` to avoid re-animating content the
visitor can already see.

With [`native: true`](#native-css-masonry) there is not even an approximation to swap out in a
browser that supports it: the `@supports` rule applies the real layout to the server's HTML on first
paint, and the first client pass has nothing to do but publish `state()`.

## Testing

Test doubles for the browser APIs the grid depends on ship separately, so they never reach a
production bundle:

```ts
import { GridTestHarness } from 'masonry-angular/testing';

const harness = new GridTestHarness();
beforeEach(() => harness.install());
afterEach(() => harness.uninstall());

// State what the browser "measured", then run the frame.
harness.measure(
  new Map([
    [gridElement, { width: 900, height: 0 }],
    [itemElement, { width: 300, height: 120 }],
  ]),
);
harness.flushFrames();
```

`install()` replaces `ResizeObserver`, `requestAnimationFrame` and `Element.prototype.animate`;
`measure()` reports sizes to every observer; `flushFrames()` drains the frame queue. That makes the
grid's multi-pass behaviour fully deterministic under jsdom, which implements none of the three.

Entry and exit effects are recorded rather than run. `harness.animations` lists them, and
`harness.finishAnimations()` completes every one — which is how you assert that a removed item's
stand-in clone has been cleaned up and `removeComplete` has fired.

## Using the solver on its own

The layout algorithm has no Angular and no DOM dependency, so it is usable from a worker, a test, or
another renderer:

```ts
import { MasonryLayoutEngine } from 'masonry-angular';

const engine = new MasonryLayoutEngine();
const { positions, contentHeight } = engine.solve({
  items: [
    { height: 120, colSpan: 1 },
    { height: 80, colSpan: 2 },
  ],
  stamps: [],
  columns: 3,
  columnWidth: 200,
  gutterX: 16,
  gutterY: 16,
  containerWidth: 632,
  horizontalOrder: false,
  rtl: false,
});
```

`positions` is a flat `Float64Array` of `[x, y]` pairs, reused between calls.

## How it stays fast

- **One `ResizeObserver`** watches the container and every item. Its entries carry sizes the browser
  has already computed, so a pass performs no forced reflow.
- **One frame per burst.** Every source of invalidation funnels through a single coalescing scheduler,
  so appending a hundred items costs one layout pass, not a hundred.
- **Read then write, never interleaved.** Measurements are gathered first and the DOM is written
  second, so layout is never invalidated mid-pass.
- **Dirty checking.** Each pass folds its inputs into one integer. An unchanged signature — the common
  case while dragging a window edge — returns before the solver runs.
- **No steady-state allocation.** Coordinates live in reused `Float64Array` buffers.
- **Transform positioning.** Items move via `transform`, which the compositor handles without layout
  or paint. Per-element writes are skipped when the value has not changed.
- **Change detection stays out of it.** The layout loop runs outside `NgZone` and writes to the DOM
  directly, so it never triggers a component re-render.
- **None of it, where the browser can do the work.** With [`native: true`](#native-css-masonry) in a
  browser that supports `display: grid-lanes`, there is no observer, no pass and no per-item write at
  all.

The solver itself places 10,000 items in 0.16 ms and 50,000 in 0.83 ms, and in the steady state
allocates one small object per pass and nothing else.

## Bundle size

Measured with `npm run size`: each library bundled with esbuild, minified, with `@angular/*`
external, reported as gzip — what a CDN actually sends. The production row is built with
`ngDevMode: false`, the substitution an Angular production build makes.

| Library                    | Own code   | Runtime deps | Total      |
| -------------------------- | ---------- | ------------ | ---------- |
| **masonry-angular**        | **8.6 KB** | none         | **8.6 KB** |
| `masonry-layout` (vanilla) | —          | 7.2 KB       | 7.2 KB     |
| `angular2-masonry`         | 1.1 KB     | 7.2 KB       | 8.2 KB     |
| `ngx-masonry`              | 1.5 KB     | 7.2 KB       | 8.6 KB     |

### What each feature costs

`npm run size:features` answers this by ablation: it deletes one feature from a copy of the source,
rebuilds, and reports the difference. That is a truer number than the size of the file a feature
lives in, because deleting a feature also removes its option, its default, its validation and the
branches that call it.

| Feature                                | Cost   | Share  |
| -------------------------------------- | ------ | ------ |
| [Native CSS masonry](#native-css-masonry) | 603 B  |  6.8%  |
| Entry, exit and movement effects        | 595 B  |  6.7%  |
| Option merging and memoisation          | 295 B  |  3.3%  |
| Responsive breakpoints                  | 251 B  |  2.8%  |
| [Stamps](#stamps)                       | 247 B  |  2.8%  |
| `awaitImages`                           | 223 B  |  2.5%  |
| [Shorthand inputs](#shorthand-inputs)   | 199 B  |  2.3%  |
| [`masonryGridSizer`](#sizing-from-css)  | 123 B  |  1.4%  |
| Skipping unchanged passes               | 118 B  |  1.3%  |
| `contentVisibility`                     | 114 B  |  1.3%  |
| `masonryIgnore`                         | 112 B  |  1.3%  |
| `fitWidth`                              | 108 B  |  1.2%  |
| The SSR multi-column fallback           |  90 B  |  1.0%  |
| RTL and `verticalOrigin`                |  63 B  |  0.7%  |
| `horizontalOrder`                       |  57 B  |  0.6%  |
| **All of them together**                | **2.6 KB** | **29.6%** |

Two things stand out. Nothing is expensive — the largest single feature is 0.6 KB, and eleven of the
fifteen cost under 250 B each. And removing *every* one of them leaves **6.2 KB**, so roughly 70% of
the bundle is machinery that no option can turn off: the Angular component and directive definitions,
the solver, the observer, the scheduler, and the pass itself.

That shape is what makes per-feature entry points a bad trade here. Splitting out the animations
would save a user 0.6 KB and cost everyone an import to remember; the two features large enough to be
worth it are already the two most people want.

The one place ablation found real waste was a bug, not a feature: the dev-mode conflict warnings were
shipping in production, because a bundler cannot prove a *class method* is unreachable the way it can
a free function, so a method whose only caller sits behind `if (ngDevMode)` survives anyway. Moving
them to a module-level function returned 248 B. If you add a development-only warning, write it as a
free function for that reason.

So this is not the smallest option on the table, and it is worth being plain about that: it lands
level with `ngx-masonry` and about 0.4 KB above `angular2-masonry`. Size is not the reason to choose
it.

What the bytes buy is. That 7.2 KB the others carry is not one package but six — `masonry-layout`
pulls in `outlayer`, `get-size`, `ev-emitter`, `desandro-matches-selector` and `fizzy-ui-utils` —
none of which a wrapper can fix a bug in or ship a feature through, and all of which were last
released in 2018. For the same weight, the layout path here is one codebase you control, and it buys
zoneless scheduling, a single shared `ResizeObserver`, transform-based positioning, DOM-order
correctness with no `reloadItems()`, server rendering that produces a usable page, and the handoff to
native CSS masonry — none of which the wrapped stack can express at any size.

The honest summary: if 8.6 KB is too much for your budget, a CSS-columns component is 1 KB and will
serve you well. If you are choosing between this and a `masonry-layout` wrapper, the size is a wash
and the difference is everything else.

### Where the validation went

Options are still validated, with better messages than before — every problem in the object at once,
each annotated with its path:

```
[masonry-angular] Invalid grid options.
✖ Expected a number >= 0, received -5.
  → at gutter
✖ Set either `columns` or `columnWidth`, not both. `columns` fixes the count; `columnWidth`
  derives it from the available width.
  → at columnWidth
```

That check runs in development and throws. In production it does not run, because it does not exist:
the validator lives behind `ngDevMode`, which Angular replaces with `false` at build time, so the
bundler drops the code as unreachable. A development build carries it, and measures correspondingly
more; `npm run size` reports both rows.

This is a deliberate trade. Invalid options are a programmer error — TypeScript catches most of them
at compile time, and the rest surface on first render. None of it is worth re-checking on every end
user's device, which is why the library validates thoroughly where it helps and ships nothing where
it does not.

## Differences from `ngx-masonry` / `angular2-masonry`

Both wrap David DeSandro's `masonry-layout`. This library replaces it.

|                    | Those                                                    | This                                             |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------ |
| Runtime deps       | `masonry-layout`, which is 6 packages                    | none, and no peer deps beyond Angular            |
| Layout code (gzip) | 7.2 KB across 6 packages                                 | 8.6 KB in one                                    |
| API                | NgModule, decorators                                     | standalone, signals                              |
| Configuration      | one options object                                       | attributes for the common five, `[options]` for the rest |
| Native CSS masonry | no                                                       | opt-in, where the browser has it                 |
| Zoneless           | no                                                       | yes                                              |
| Item order         | registration order; needs `reloadItems()` after reorders | derived from the DOM every pass                  |
| Images             | `load` listeners, or a blocking "ordered" mode           | `decode()`, non-blocking, order always preserved |
| Positioning        | `top` / `left`                                           | `transform`                                      |
| Resize             | window `resize`                                          | container `ResizeObserver`                       |
| Responsive columns | manual                                                   | breakpoint map, container- or viewport-based     |
| SSR                | renders nothing until hydration                          | multi-column fallback, no layout shift           |
| Options            | untyped-ish interface                                    | typed, validated in dev, compiled out of prod    |
| Exit animation     | `hiddenStyle` / `animations.hide`                        | `exitAnimation`, Web Animations                  |
| Vertical origin    | `originTop: false`                                       | `verticalOrigin: 'bottom'`                       |
| CSS-driven width   | `columnWidth: '.grid-sizer'`                             | `masonryGridSizer` directive                     |
| Excluding an item  | `ignore()` / `unignore()`                                | `[masonryIgnore]`                                |
| Item elements      | `getItemElements()`                                      | `items()`                                        |

### Migrating

Two differences will bite before anything else.

**Item width is written by the grid.** `masonry-layout` infers an item's column span by measuring
the width your CSS gave it, so `.item--wide { width: 200px }` spans two columns. This library writes
`style.width` itself, which overrides that rule — a migrated stylesheet will silently stop widening
items. Use `[masonryColSpan]="2"` instead:

```html
<!-- before, with ngx-masonry -->
<div ngxMasonryItem class="item item--wide">…</div>

<!-- after -->
<div masonryGridItem [masonryColSpan]="2">…</div>
```

**There is no `reloadItems()`, and you do not need one.** Order comes from the DOM on every pass, so
prepends, removals and `@for` reorderings land correctly on their own. Drop the calls, along with
`[prepend]`, `[updateLayout]` and `[ordered]` — all three are unconditional behaviour here.

Renamed rather than dropped: `initLayout` is `autoLayout`, `resize` is `observeResize`,
`resizeContainer` keeps its name, `columnWidth: '.grid-sizer'` is the `masonryGridSizer` directive,
and `ignore()` is `[masonryIgnore]`.

Genuinely not carried over, and why:

|                              |                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `percentPosition`            | Superseded. `stretchColumns` fills the row exactly, and `masonryGridSizer` accepts a percentage width from CSS.                                  |
| `containerStyle`             | The host must stay `position: relative; display: block` for absolute positioning to work; making it configurable only lets you break the layout. |
| `hide()` / `reveal()`        | Use `@if`. Keeping hidden items in the layout tree contradicts deriving order from the DOM, which is what removes the need for `reloadItems()`.  |
| `gutter: '.gutter-sizer'`    | Use `gutterX` / `gutterY`, which the sizer pattern existed to work around.                                                                       |
| `transitionDuration: '0.4s'` | `transition.duration` takes milliseconds as a number, plus a separate `easing`.                                                                  |
