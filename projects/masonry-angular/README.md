# masonry-angular

Cascading grid ("masonry") layout for Angular — with its own layout engine, no `masonry-layout`,
no jQuery, no `imagesLoaded`.

- **Signal-based and zoneless.** Standalone directives, `input()`/`output()`, `OnPush`, and a layout
  loop that runs entirely outside change detection.
- **Fast by construction.** One shared `ResizeObserver`, one animation frame per burst of changes, a
  strict read-then-write pass with no forced reflow, and transform-based positioning.
- **Order that stays correct.** Item order is read from the DOM on every pass, so prepends, removals
  and reorders land where you put them. There is no `reloadItems()` to remember.
- **SSR-safe.** Renders a CSS multi-column approximation on the server, then swaps to real masonry on
  hydration without a layout shift.
- **Truly zero-dependency.** No runtime dependencies and no peer dependencies beyond Angular itself.
  Options are validated with precise, path-annotated errors in development, and that validator is
  compiled out of production builds entirely.

## Install

```bash
npm install masonry-angular
```

That is the whole install. There is nothing else to add to your bundle.

| masonry-angular | Angular |
| --------------- | ------- |
| 1.x             | ≥ 22    |

## Quick start

```ts
import { Component, signal } from '@angular/core';
import { NG_MASONRY_GRID } from 'masonry-angular';

@Component({
  selector: 'photo-wall',
  imports: [NG_MASONRY_GRID],
  template: `
    <masonry-grid [options]="{ columns: { 0: 1, 768: 2, 1200: 4 }, gutter: 20 }">
      @for (photo of photos(); track photo.id) {
        <article masonryGridItem>
          <img [src]="photo.url" [alt]="photo.title" />
          <h2>{{ photo.title }}</h2>
        </article>
      }
    </masonry-grid>
  `,
})
export class PhotoWall {
  readonly photos = signal(loadPhotos());
}
```

`NG_MASONRY_GRID` is a convenience array of every directive. Import `MasonryGrid`, `MasonryGridItem`
and `MasonryGridStamp` individually if you prefer.

That is the whole setup. **Do not set a width on your items** — the grid owns their width and
position. Style everything else as you like.

## Options

Every option is optional; the defaults below are what you get from `<masonry-grid>` with no
`[options]` at all.

### Sizing

| Option                      | Type                               | Default       |                                                                                                              |
| --------------------------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `columns`                   | `number \| Record<number, number>` | `3`           | Fixed count, or column counts keyed by the minimum width at which they apply.                                |
| `columnWidth`               | `number`                           | —             | Target column width in px; the count is derived from the space available. Mutually exclusive with `columns`. |
| `stretchColumns`            | `boolean`                          | `true`        | With `columnWidth`, grow columns to fill the row instead of leaving a ragged edge.                           |
| `minColumns` / `maxColumns` | `number`                           | `1` / —       | Clamp the resolved count.                                                                                    |
| `breakpointBasis`           | `'container' \| 'viewport'`        | `'container'` | What breakpoints are matched against. Container-based works inside sidebars and modals.                      |
| `fitWidth`                  | `boolean`                          | `false`       | Shrink the grid to the width its columns actually occupy, so it can be centred.                              |

```ts
{ columns: { 0: 1, 640: 2, 1024: 3, 1440: 4 } }  // responsive
{ columnWidth: 260 }                              // as many 260px columns as fit
```

### Spacing and direction

| Option                | Type                | Default  |                                                                                                        |
| --------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `gutter`              | `number`            | `16`     | Gap in px, both axes.                                                                                  |
| `gutterX` / `gutterY` | `number`            | `gutter` | Per-axis override.                                                                                     |
| `horizontalOrder`     | `boolean`           | `false`  | Fill row by row instead of always seeking the shortest column. Tidier rows, taller grid.               |
| `direction`           | `'ltr' \| 'rtl'`    | `'ltr'`  | Lay out from the right edge.                                                                           |
| `verticalOrigin`      | `'top' \| 'bottom'` | `'top'`  | Stack upward from the bottom edge — `masonry-layout`'s `originTop: false`. Not compatible with stamps. |

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
keeps the provided easing. Defaults are validated at bootstrap, so a mistake fails immediately with a
path-annotated message rather than being silently ignored.

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

## Reading and driving the grid

```html
<masonry-grid #grid="masonryGrid" (layoutComplete)="onLayout($event)">…</masonry-grid>
<p>{{ grid.columns() }} columns at {{ grid.columnWidth() }}px</p>
```

Signals: `ready()`, `columns()`, `columnWidth()`, `contentHeight()`, `itemCount()`.

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
while the multi-column approximation is showing. Items carry `.masonry-item` and stamps `.masonry-stamp`.

## Server-side rendering

Nothing to configure. On the server the grid renders a CSS multi-column approximation, so the HTML is
useful without JavaScript and search engines see real content. On hydration the first pass swaps to
absolute positioning in a single synchronous write, so there is no frame in which items are half
positioned. Pair it with `entryAnimation.animateInitial: false` to avoid re-animating content the
visitor can already see.

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

## Bundle size

Measured with `npm run size`: each library bundled with esbuild, minified, with `@angular/*`
external, reported as gzip — what a CDN actually sends. The production row is built with
`ngDevMode: false`, the substitution an Angular production build makes.

| Library                    | Own code   | Runtime deps | Total      |
| -------------------------- | ---------- | ------------ | ---------- |
| **masonry-angular**        | **6.2 KB** | none         | **6.2 KB** |
| `masonry-layout` (vanilla) | —          | 7.2 KB       | 7.2 KB     |
| `angular2-masonry`         | 1.1 KB     | 7.2 KB       | 8.2 KB     |
| `ngx-masonry`              | 1.5 KB     | 7.2 KB       | 8.6 KB     |

This library ships less code than the layout engine the alternatives wrap, before either of them
adds an Angular binding. That 7.2 KB is also not one package but six — `masonry-layout` pulls in
`outlayer`, `get-size`, `ev-emitter`, `desandro-matches-selector` and `fizzy-ui-utils` — none of
which a wrapper can fix a bug in or ship a feature through. Here the layout path is one dependency
you control, and it buys zoneless scheduling, `ResizeObserver`, transform positioning and DOM-order
correctness that the wrapped stack cannot express at any size.

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
bundler drops the code as unreachable. A development build carries it and measures 7.8 KB.

This is a deliberate trade. Invalid options are a programmer error — TypeScript catches most of them
at compile time, and the rest surface on first render. None of it is worth re-checking on every end
user's device, which is why the library validates thoroughly where it helps and ships nothing where
it does not.

## Differences from `ngx-masonry` / `angular2-masonry`

Both wrap David DeSandro's `masonry-layout`. This library replaces it.

|                    | Those                                                    | This                                             |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------ |
| Runtime deps       | `masonry-layout`, which is 6 packages                    | none, and no peer deps beyond Angular            |
| Layout code (gzip) | 7.2 KB across 6 packages                                 | 6.2 KB in one                                    |
| API                | NgModule, decorators                                     | standalone, signals                              |
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

## License

MIT
