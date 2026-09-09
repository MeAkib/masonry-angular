# Getting started

This tutorial builds one thing: a responsive photo gallery. Each step ends with something that runs,
and each step makes the gallery better.

You need Angular 22 or newer. Every example uses standalone components, signals and the built-in
`@for` / `@if` blocks.

For the full option list, see [DOCS.md](./DOCS.md). This page teaches; that page is the reference.

## Contents

1. [Install, and the smallest possible grid](#1-install-and-the-smallest-possible-grid)
2. [Make it responsive](#2-make-it-responsive)
3. [Add images](#3-add-images)
4. [Loading and empty states](#4-loading-and-empty-states)
5. [Spans and stamps](#5-spans-and-stamps)
6. [Motion](#6-motion)
7. [Server-side rendering](#7-server-side-rendering)
8. [Native CSS masonry](#8-native-css-masonry)
9. [Defaults for the whole app](#9-defaults-for-the-whole-app)
10. [Troubleshooting](#10-troubleshooting)
11. [Where to go next](#11-where-to-go-next)

---

## 1. Install, and the smallest possible grid

```bash
npm install masonry-angular
```

There are no runtime dependencies. Angular 22 or newer is the only requirement.

Import `NG_MASONRY_GRID`. It is an array holding all four directives, so one entry in `imports`
gives you the grid, items, stamps and the sizer.

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NG_MASONRY_GRID } from 'masonry-angular';

interface Photo {
  id: number;
  color: string;
  height: number;
}

@Component({
  selector: 'photo-gallery',
  imports: [NG_MASONRY_GRID],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <masonry-grid columns="3" gutter="20">
      @for (photo of photos(); track photo.id) {
        <article masonryGridItem class="tile" [style.background]="photo.color"
                 [style.height.px]="photo.height">
          {{ photo.id }}
        </article>
      }
    </masonry-grid>
  `,
  styles: `
    .tile {
      box-sizing: border-box;
      border-radius: 8px;
      padding: 12px;
      color: #fff;
    }
  `,
})
export class PhotoGallery {
  readonly photos = signal<Photo[]>(
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      color: `hsl(${i * 23} 65% 50%)`,
      height: 120 + ((i * 37) % 200),
    })),
  );
}
```

Run it. You get eighteen coloured blocks in three columns, packed with no vertical gaps.

Two rules matter from the very first line.

**Do not set a width on your items.** The grid writes `style.width` on every item on every pass, so
any width, `max-width` or `min-width` in your CSS is either overwritten or fights with it. The grid
owns the width; you own everything inside the item. It also writes `position`, `top`, `left`,
`margin` and `transform` on items, so leave those alone too. Use `gutter` for spacing between items,
not margins. Give items `box-sizing: border-box` so your padding stays inside the column.

Height is yours. Set it, or let the content decide it — either works.

**You never call a method when the list changes.** Add a photo, remove one, sort the array, prepend
to it: the grid reads item order from its own child elements on every pass, and watches item sizes
with a `ResizeObserver`. There is no `reloadItems()` to remember. Just update the signal:

```ts
addPhoto(photo: Photo): void {
  this.photos.update((photos) => [...photos, photo]);
}
```

Note the `[...photos, photo]`. A signal only notifies Angular when it gets a new value, so create a
new array rather than pushing into the old one. That is ordinary Angular, not a grid rule — but if
the DOM does not change, the grid has nothing to react to.

One structural rule: **items must be direct children of `<masonry-grid>`.** `@for` and `@if` are
fine, because Angular's control flow adds no wrapper element. A `<div>` around your items is not
fine — the grid would never find them.

---

## 2. Make it responsive

Three columns look wrong on a phone. There are two ways to fix that, and the simpler one is usually
enough.

### The simple way: state a column width

```html
<masonry-grid columnWidth="260" gutter="20">…</masonry-grid>
```

Read this as "columns about 260px wide". The grid fits as many as it can into the available width,
then stretches them to fill the row exactly, so there is no ragged edge on the right. Narrow
container, one column. Wide screen, six columns. No breakpoints to write, and nothing to update when
your design changes.

`columns` and `columnWidth` are mutually exclusive. Setting one clears the other.

If you would rather have exactly 260px columns and leave the leftover space empty, turn stretching
off:

```html
<masonry-grid columnWidth="260" gutter="20" [options]="{ stretchColumns: false }">…</masonry-grid>
```

### The explicit way: name the counts

When the design says "two columns on a tablet, four on a desktop", say that:

```html
<masonry-grid [columns]="{ 0: 1, 768: 2, 1200: 4 }" gutter="20">…</masonry-grid>
```

The keys are minimum widths in px. The count that applies is the one for the largest key at or below
the measured width. Note the square brackets — this is an object, so it needs a binding, while
`columns="3"` and `columnWidth="260"` are plain attributes.

You can use names instead of numbers. The default scale is Tailwind's, so a grid written against
`lg` lines up with the rest of your styles:

| Name | `xs` | `sm`  | `md`  | `lg`   | `xl`   | `2xl`  |
| ---- | ---- | ----- | ----- | ------ | ------ | ------ |
| px   | `0`  | `640` | `768` | `1024` | `1280` | `1536` |

```html
<masonry-grid [columns]="{ xs: 1, sm: 2, md: 3, xl: 4 }" gutter="20">…</masonry-grid>
```

Names and raw widths can be mixed: `{ xs: 1, md: 2, 1440: 5 }` is valid. You can redefine the scale,
or add names of your own, with the `breakpoints` option — see [DOCS.md](./DOCS.md#named-breakpoints).

### The part that surprises people

**Breakpoints are matched against the grid's container, not the viewport.** A grid inside a 400px
sidebar gets its one-column layout on a 4K monitor, because the container is 400px wide. This is
almost always what you want: the same component works in a page, in a sidebar and in a modal,
without you writing a media query for each.

It is not what CSS media queries do, so if you paste breakpoints over from a stylesheet, the numbers
will behave differently. To match the viewport instead:

```html
<masonry-grid [columns]="{ 0: 1, 768: 2, 1200: 4 }" [options]="{ breakpointBasis: 'viewport' }">
```

`columnWidth` never has this problem: it always follows the space actually available.

From here on the gallery uses `columnWidth="260"`.

---

## 3. Add images

This is the step where masonry usually goes wrong, so it is worth understanding.

The grid places an item using its measured height. An image that has not loaded, and whose size the
browser cannot know in advance, measures as zero pixels tall. If the grid measures at that moment,
it stacks the next item right underneath — and when the image finally paints, it overlaps its
neighbour. That is the classic broken masonry gallery.

The library handles this in two layers.

### `awaitImages`, which is already on

`awaitImages` defaults to `true`. When an item is registered, the grid looks for `<img>` elements
inside it and waits for `decode()` on each one before positioning the item.

`decode()` matters here. A `load` event fires when the bytes have arrived; `decode()` resolves when
the frame is ready to paint. Waiting for `decode()` means the item is measured at the height it will
actually render at, not one frame earlier.

While an item is waiting, it keeps its place in the DOM and simply is not positioned yet. It drops
into the layout on a later pass, in the right position. Source order is never lost, so images do not
shuffle themselves as they load.

**Images with `loading="lazy"` are deliberately never awaited.** A lazy image that is still far below
the fold never starts loading, so its `decode()` would never resolve, and the item would be stranded
forever — invisible, in a gallery that never finishes. Lazy images are skipped, the item is measured
immediately, and the grid re-lays out when the image later loads and changes the item's height.
Images that are already complete are skipped too, because there is nothing to wait for.

### The better fix: tell the browser the size

Waiting is a fallback. If the browser knows an image's aspect ratio before it loads, it reserves the
right space immediately, the item measures correctly on the first pass, and nothing has to wait at
all. That is faster and steadier, and it also fixes lazy images, which are never awaited.

Set `width` and `height` attributes:

```html
<masonry-grid columnWidth="260" gutter="20">
  @for (photo of photos(); track photo.id) {
    <article masonryGridItem class="tile">
      <img [src]="photo.src" [alt]="photo.alt"
           [width]="photo.width" [height]="photo.height" loading="lazy" />
      <figcaption>{{ photo.title }}</figcaption>
    </article>
  }
</masonry-grid>
```

```css
.tile img {
  display: block;
  width: 100%;
  height: auto;
}
```

The attributes are the image's real pixel dimensions. They are not a rendered size — the CSS above
scales the image to the column. Modern browsers derive an `aspect-ratio` from them and reserve the
space.

If you do not know the pixel dimensions but do know the ratio, say that in CSS instead:

```css
.tile img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 3 / 2;
}
```

Setting `width: 100%` on the image is fine. The rule about not setting a width applies to the item
element — the one carrying `masonryGridItem` — not to what is inside it.

Turning `awaitImages` off only makes sense once every image is sized this way:

```html
<masonry-grid columnWidth="260" [options]="{ awaitImages: false }">…</masonry-grid>
```

---

## 4. Loading and empty states

Real galleries load their photos. You need to know when the grid has actually laid out.

Two signals and three outputs cover it. Get a reference to the grid with `#grid="masonryGrid"`.

| Signal   | Meaning                                                                                    |
| -------- | ------------------------------------------------------------------------------------------ |
| `ready()` | `true` once the browser has completed the first real layout pass.                          |
| `state()` | One object: `{ columns, columnWidth, contentHeight, itemCount, pass }`, written after every pass. |

`state()` is **one** signal, not five. There is no `grid.columns()` to read back — that name is now
an input, meaning what you set. Read `grid.state().columns` instead.

`pass` is `0` before the first pass and counts up from there. `contentHeight` is the laid-out height
in px. `itemCount` is how many items the last pass positioned.

| Output           | Payload                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `layoutComplete` | `{ columns, columnWidth, itemCount, height, width, durationMs, pass }` after every pass. |
| `itemsLoaded`    | The item count, once the last item waiting on `awaitImages` has decoded.   |
| `removeComplete` | `{ removed }`, once a batch of removed items has finished its exit effect. |

A skeleton-until-ready pattern:

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NG_MASONRY_GRID } from 'masonry-angular';

interface Photo {
  id: number;
  src: string;
  alt: string;
  width: number;
  height: number;
}

@Component({
  selector: 'photo-gallery',
  imports: [NG_MASONRY_GRID],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="gallery">
      <masonry-grid #grid="masonryGrid" columnWidth="260" gutter="20">
        @for (photo of photos(); track photo.id) {
          <article masonryGridItem class="tile">
            <img [src]="photo.src" [alt]="photo.alt"
                 [width]="photo.width" [height]="photo.height" />
          </article>
        }
      </masonry-grid>

      @if (!grid.ready()) {
        <div class="skeleton" aria-hidden="true">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="skeleton-tile"></div>
          }
        </div>
      }

      @if (grid.ready() && photos().length === 0) {
        <p class="empty">No photos yet.</p>
      }
    </section>

    <p class="status">
      {{ grid.state().itemCount }} photos in {{ grid.state().columns }} columns
    </p>
  `,
  styles: `
    .gallery { position: relative; }
    .skeleton {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 20px;
      background: #fff;
    }
    .skeleton-tile {
      height: 200px;
      border-radius: 8px;
      background: #eee;
    }
    .tile img { display: block; width: 100%; height: auto; }
  `,
})
export class PhotoGallery {
  readonly photos = signal<Photo[]>([]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const response = await fetch('/api/photos');
    this.photos.set(await response.json());
  }
}
```

The skeleton is painted over the grid, so it covers whatever the grid is showing before its first
pass. It is declared after the grid in the template, which keeps the reference straightforward to
read.

Three things to watch out for:

- **`ready()` does not mean "has photos".** A grid with zero items still runs a pass and becomes
  ready. Check `photos().length` for the empty state, as above.
- **`itemsLoaded` never fires if nothing had to wait.** If every image is already cached, or every
  image is `loading="lazy"`, no item waits and the output stays silent. Never gate your UI on it —
  use `ready()` for that. `itemsLoaded` is for "the images have finished arriving", not "the grid is
  usable".
- **`layoutComplete` fires after every pass**, not just the first. The first layout normally takes
  two passes: one to give items their column width, one to position them once they have re-measured
  at that width. Do not treat the first emission as "done".

---

## 5. Spans and stamps

### A featured photo

`masonryColSpan` makes an item cover several whole columns. The solver drops it into the group of
adjacent columns with the lowest shared top edge.

```html
<masonry-grid columnWidth="260" gutter="20">
  @for (photo of photos(); track photo.id) {
    <article masonryGridItem [masonryColSpan]="photo.featured ? 2 : 1" class="tile">
      <img [src]="photo.src" [alt]="photo.alt" [width]="photo.width" [height]="photo.height" />
    </article>
  }
</masonry-grid>
```

This is how you widen an item. Do not do it in CSS — the grid writes the width itself and your rule
would be overwritten. The span is clamped to the current column count, so a `[masonryColSpan]="3"`
item in a one-column layout simply fills that one column.

### A promo box items flow around

A stamp is a fixed region that items avoid instead of overlapping. You position it; the grid only
measures where you put it.

```html
<masonry-grid columnWidth="260" gutter="20">
  <aside masonryGridStamp class="promo">
    <h2>Print sale</h2>
    <p>Everything 20% off this week.</p>
  </aside>

  @for (photo of photos(); track photo.id) {
    <article masonryGridItem class="tile">…</article>
  }
</masonry-grid>
```

```css
.promo {
  position: absolute;
  top: 0;
  right: 0;
  width: 320px;
  height: 240px;
}
```

The grid host is `position: relative`, so `top` and `right` are measured against the grid. The stamp
must be a direct child of `<masonry-grid>`, like an item. It is not positioned by the grid and takes
no part in the packing — it is an obstacle, nothing more.

Stamps do not work with `verticalOrigin: 'bottom'`. A development build warns if you set both.

### Leaving an item out

`[masonryIgnore]` takes an item out of the layout and hands it back to normal flow, without
unregistering it. It is reversible — bind it to a signal and toggle it.

```html
<article masonryGridItem [masonryIgnore]="photo.hidden" class="tile">…</article>
```

If the item should not be on the page at all, use `@if` instead. `masonryIgnore` is for items that
stay in the DOM but should not be positioned by the grid.

---

## 6. Motion

Motion is on by default and you do not have to configure any of it.

**Entry.** New items fade and rise into place: opacity `0` to `1`, `translate` from `0 12px` to
none, `scale` from `0.98` to `1`, over 280ms. Items in the same batch are staggered by 24ms each, up
to a total of 200ms, so appending fifty photos does not take a second and a half to finish.

**Movement.** When an item moves to a new position — because the container resized, or an item above
it was removed — it transitions there over 300ms. That is the `transition` option.

**Exit.** Removed items fade and shrink over 200ms before disappearing.

Changing any of it:

```html
<masonry-grid
  columnWidth="260"
  gutter="20"
  [options]="{
    transition: { duration: 150 },
    entryAnimation: { duration: 200, stagger: 12 }
  }"
>…</masonry-grid>
```

You only state the fields you want to change. The rest keep their defaults.

Turning it off:

```html
<masonry-grid columnWidth="260" [options]="{ entryAnimation: false }">…</masonry-grid>
```

`transition: { duration: 0 }` disables movement, and `exitAnimation: false` makes removed items
vanish at once. For users who ask for less motion:

```ts
import { computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { MasonryGridOptions } from 'masonry-angular';

// In the component:
private readonly reduceMotion =
  isPlatformBrowser(inject(PLATFORM_ID)) &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

readonly options = computed<MasonryGridOptions>(() => ({
  entryAnimation: this.reduceMotion ? false : {},
  transition: { duration: this.reduceMotion ? 0 : 300 },
}));
```

`entryAnimation: {}` means "keep the defaults" — an empty object overrides nothing.

### The one gotcha

**Keyframes must not animate `transform`.** The grid positions items with `transform`, so a keyframe
that sets it takes the item's position away and the layout collapses into a pile in the top-left
corner.

Use the independent `translate`, `scale` and `rotate` properties instead. They compose with
`transform` rather than replacing it, and they do exactly what you want:

```ts
[options]="{
  entryAnimation: {
    keyframes: [
      { opacity: 0, translate: '0 24px', scale: '0.94' },
      { opacity: 1, translate: 'none', scale: '1' },
    ],
    duration: 240,
  },
}"
```

```ts
// Wrong. Do not do this.
keyframes: [
  { opacity: 0, transform: 'translateY(24px)' },
  { opacity: 1, transform: 'none' },
];
```

A development build rejects keyframes that animate `transform` with a clear message, so you find out
immediately rather than wondering why the grid is broken. The same rule applies to `exitAnimation`
keyframes, and to any CSS animation or transition of your own on `.masonry-item`.

---

## 7. Server-side rendering

Nothing to configure. The gallery works under SSR as it is.

**What the visitor sees before hydration.** On the server, the grid renders a CSS multi-column
approximation: `column-count` with the right gaps, two columns by default. That is not true masonry
— columns are filled top to bottom rather than packed by shortest column — but it is real content,
in roughly the right shape, readable without JavaScript and visible to search engines.

**Why there is no layout shift.** On hydration, the first layout pass switches items from normal
flow to absolute positioning in a single synchronous write, and drops the fallback class in the same
write. There is no frame in which some items are positioned and others are not, so nothing jumps.

You can change the fallback's column count, or turn it off:

```ts
[options]="{ ssr: { columns: 3 } }"       // three columns before hydration
[options]="{ ssr: { fallback: 'none' } }" // items stay hidden until the first pass
```

**The one thing worth setting.** With SSR, the first batch of items is already painted on screen
before Angular takes over. Animating them in makes visible content fade and slide for no reason.
Turn that off:

```html
<masonry-grid columnWidth="260" gutter="20"
              [options]="{ entryAnimation: { animateInitial: false } }">…</masonry-grid>
```

Only the first batch is affected. Photos added later still animate in normally.

Set it once for the whole app rather than per grid — see step 9.

---

## 8. Native CSS masonry

CSS Grid Level 3 adds real masonry to the browser itself, spelled `display: grid-lanes`. The library
can hand the layout over where it exists:

```html
<masonry-grid columnWidth="260" gutter="20" [options]="{ native: true }">…</masonry-grid>
```

### Be clear about what this means today

Safari 26.4 and newer ships `display: grid-lanes` unflagged. As of September 2026 that is roughly
11% of users. Chromium exposes an earlier prototype, spelled `display: masonry`, behind a flag;
Firefox has an older and different mechanism, also behind a flag. Neither has announced a ship date.

So this is an enhancement for the browsers that have it, not a replacement for the layout engine.
Every other browser keeps the JavaScript path, and the grid looks the same. That is why `native` is
off by default.

### What you get where it is supported

The library does nothing at all. No `ResizeObserver` on items, no measuring, no width writes, no
transforms, no waiting on images, no solver. The browser packs the grid and re-packs it on resize,
on content changes and as images load, on its own.

And because the switch is an `@supports` rule in CSS rather than a check in JavaScript, a supporting
browser applies the real masonry layout to the server's HTML **on first paint**, before any
JavaScript has loaded. There is nothing to hydrate and nothing to swap out.

### What stops working when the browser takes over

The browser owns the packing algorithm, so options describing a different algorithm have no effect:

- `horizontalOrder`
- `verticalOrigin: 'bottom'`
- `fitWidth`
- `stretchColumns: false`
- `masonryGridStamp` — a stamp is not a concept the browser has
- `[masonryIgnore]` — the grid never walks the items, so there is nothing to take one out of

A development build warns once, naming what it found. If your gallery needs any of them, set
`native: false` on that grid; nothing else about it changes.

`[masonryColSpan]` does keep working: the item directive writes `grid-column: span 2` and the
browser honours it.

Reading the grid back changes slightly. `nativeActive()` tells you whether the browser is actually
in charge — `native: true` **and** the feature present. It is always `false` on the server.
`state().columnWidth` is `0` in that mode, because the browser owns the track sizes and never
reports them; a number the library did not compute would be a guess. `state().columns` stays
accurate.

---

## 9. Defaults for the whole app

Once you have more than one grid, set the shared parts once:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideNgMasonryGrid } from 'masonry-angular';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [
    provideNgMasonryGrid({
      gutter: 20,
      columnWidth: 260,
      entryAnimation: { animateInitial: false },
    }),
  ],
});
```

Every grid in the application now starts from those values, and the SSR fix from step 7 is applied
everywhere.

The defaults are validated at bootstrap, so a typo fails immediately with a message naming the
field, instead of being silently ignored at render time.

### The layering rule

Three sources are merged, in this order, each winning over the one before:

1. application defaults from `provideNgMasonryGrid()`
2. `[options]` on the grid
3. shorthand attributes on the grid — `columns`, `columnWidth`, `gutter`, `gutterX`, `gutterY`

So a shorthand always beats `[options]`, and `[options]` always beats the application default:

```html
<!-- app default gutter 20, this grid 8; app columnWidth 260, this grid 4 fixed columns -->
<masonry-grid columns="4" gutter="8" [options]="{ horizontalOrder: true }">…</masonry-grid>
```

`columns` and `columnWidth` stay mutually exclusive across the layers, rather than colliding inside
them. Setting the `columns` shorthand clears a `columnWidth` inherited from the application
defaults, and the other way round. That is what lets one grid opt out of an app-wide sizing rule
with a single attribute.

Nested groups merge field by field, so `[options]="{ transition: { duration: 0 } }"` keeps the
easing from your application defaults.

---

## 10. Troubleshooting

| Symptom                                                     | Likely cause                                                                                                                   | Fix                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Items sit on top of each other                              | Something else writes `transform` on the item — a CSS animation, a transition, a utility class, or an entry keyframe.           | Never set `transform` on `.masonry-item`. Use `translate`, `scale` and `rotate` in keyframes and CSS.           |
| Items overlap only where there are images                   | Images have no known size and `awaitImages` was turned off, so items were measured at zero height.                             | Add `width`/`height` attributes, or `aspect-ratio` in CSS. Leave `awaitImages` on if you cannot.                |
| Items overlap horizontally, or spill out of their column    | The item has padding or a border with `box-sizing: content-box`, so the written width is the content width.                     | Give items `box-sizing: border-box`.                                                                           |
| Everything ends up in one column                            | The container is narrow or has zero width — a hidden tab, a flex child without `min-width: 0`, a parent with `display: contents`. Breakpoints match the container, not the viewport. | Check the container's real width. If you meant viewport widths, set `breakpointBasis: 'viewport'`.             |
| One column even on a wide screen, with `columnWidth`        | `columnWidth` is larger than the container.                                                                                    | Lower it, or use a `columns` breakpoint map.                                                                   |
| The grid renders as plain CSS columns and never becomes masonry | Items are not direct children of `<masonry-grid>` — usually a wrapper `<div>` — so no item is ever found and positioned.        | Put `masonryGridItem` on the direct children. `@for` and `@if` add no wrapper and are fine.                     |
| The grid stays empty or invisible                           | `masonryGridItem` is missing, `NG_MASONRY_GRID` is not in `imports`, or `autoLayout: false` is set and `layout()` was never called. | Add the directive and the import. If you set `autoLayout: false`, call `grid.layout()` when you are ready.      |
| Items are the wrong width                                   | Your CSS sets a width, `max-width` or `min-width` on the item element.                                                          | Remove it. Widen an item with `[masonryColSpan]="2"`, and style widths on elements inside the item.             |
| Nothing moves after the data changes                        | The array was mutated in place, so the signal did not notify Angular and the DOM never changed. The grid follows the DOM.       | Set a new array: `photos.update((p) => [...p, next])`.                                                         |
| Layout is stale after changing item content                 | Content changed in a way no observer can see — a direct DOM mutation outside Angular, for example.                              | Call `grid.layout()`, or `grid.remeasure()` to re-read every item first.                                        |
| Content flickers or re-animates on hydration                | The first batch is already painted by the server and then animated in.                                                          | Set `entryAnimation: { animateInitial: false }`, ideally in `provideNgMasonryGrid()`.                            |
| `fitWidth`, `horizontalOrder` or a stamp stopped working    | `native: true` is set and the browser took over the packing.                                                                    | Set `native: false` on that grid. A development build warns and names the option.                              |
| `grid.columns()` does not compile                           | There is no such readback. `columns` is an input.                                                                              | Read `grid.state().columns`.                                                                                   |

---

## 11. Where to go next

- **[DOCS.md](./DOCS.md)** — the full reference. Every option with its default, the sizer directive,
  styling hooks and custom properties, testing with `GridTestHarness`, using the layout solver on its
  own, and migrating from `ngx-masonry` or `angular2-masonry`.
- **[README.md](./README.md)** — the short overview.
- **The demo app** — working examples of everything here: a gallery, spans and stamps, collection
  churn, a dashboard, and a performance test.
  [Source](https://github.com/MeAkib/masonry-angular/tree/main/projects/demo). From a clone of the
  repository, run `npm start`.
- **[ARCHITECTURE.md](https://github.com/MeAkib/masonry-angular/blob/main/ARCHITECTURE.md)** — how a
  layout pass works inside, if you want to change the library or just to know.
