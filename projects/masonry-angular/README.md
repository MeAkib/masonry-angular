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
- **Truly zero-dependency.** 6.2 KB gzipped, no runtime dependencies, no peer dependencies beyond
  Angular itself.

## Install

```bash
npm install masonry-angular
```

| masonry-angular | Angular |
| --------------- | ------- |
| 1.x             | ≥ 22    |

## Use it

Import the directives, wrap your items, and mark each one:

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

That is the whole setup. Add and remove items however you like — the grid watches sizes and the DOM
and re-lays out on its own. There is no method to call after a change.

Two rules worth knowing up front:

1. **Do not set a width on your items.** The grid owns their width and position. Style everything
   else freely.
2. **Widen an item with `[masonryColSpan]`,** not CSS — see below.

`NG_MASONRY_GRID` is a convenience array of every directive; import `MasonryGrid`, `MasonryGridItem`,
`MasonryGridStamp` and `MasonryGridSizer` individually if you prefer.

## The four directives

|                            |                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `<masonry-grid [options]>` | The container. Positions everything inside it.                                                                           |
| `[masonryGridItem]`        | An item. `[masonryColSpan]="2"` widens it across whole columns; `[masonryIgnore]="true"` drops it back into normal flow. |
| `[masonryGridStamp]`       | A region items flow around instead of overlapping. You position it, the grid measures it.                                |
| `[masonryGridSizer]`       | An element whose CSS width becomes the column width, so a stylesheet owns the sizing.                                    |

```html
<masonry-grid>
  <div masonryGridSizer class="sizer"></div>
  <aside masonryGridStamp class="promo">…</aside>

  @for (item of items(); track item.id) {
  <article masonryGridItem [masonryColSpan]="item.wide ? 2 : 1">…</article>
  }
</masonry-grid>
```

## The options you will actually reach for

Every option is optional. These are the common ones — the
[full reference](https://github.com/MeAkib/masonry-angular/blob/main/projects/masonry-angular/DOCS.md#options)
documents all of them.

| Option                | Default        |                                                                                                                               |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `columns`             | `3`            | A fixed count, or counts keyed by breakpoint: `{ sm: 1, lg: 3, xl: 4 }`. Raw pixel widths work too, and the two can be mixed. |
| `breakpoints`         | Tailwind scale | What those names mean, in px. An override merges over the defaults: `{ lg: 900 }` moves `lg` and leaves the rest alone.       |
| `columnWidth`         | —              | Target column width in px; the count follows from the space available. Use instead of `columns`.                              |
| `gutter`              | `16`           | Gap in px. `gutterX` / `gutterY` override per axis.                                                                           |
| `horizontalOrder`     | `false`        | Fill row by row instead of seeking the shortest column. Tidier rows, taller grid.                                             |
| `transition.duration` | `300`          | How long items take to slide to a new position. `0` disables it.                                                              |
| `entryAnimation`      | fade + rise    | Effect for newly placed items. `false` disables it.                                                                           |
| `awaitImages`         | `true`         | Hold an item back until its images have decoded, so it is measured at its real height.                                        |
| `contentVisibility`   | `false`        | Let the browser skip rendering off-screen items. Worth turning on past a few hundred.                                         |

```ts
{ columns: { sm: 1, md: 2, lg: 3, xl: 4 } }  // responsive, by name
{ columns: { 0: 1, 640: 2, 1440: 4 } }       // ...or by raw min-width in px
{ columnWidth: 260 }                          // as many 260px columns as fit
```

The names are the Tailwind scale — `xs` 0, `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 —
and each means "from this width up". The count that applies is the one for the largest breakpoint at
or below the measured width, and that width is the **container's** by default, not the viewport's.

Set defaults once for the whole application, and let each grid layer its own `[options]` on top:

```ts
bootstrapApplication(App, {
  providers: [
    provideNgMasonryGrid({
      gutter: 24,
      columns: { sm: 1, md: 2, xl: 4 },
      // Optional: make the names match your own design system.
      breakpoints: { md: 900, xl: 1400 },
    }),
  ],
});
```

Options are validated in development with precise, path-annotated errors. That validator is compiled
out of production builds entirely.

## Reading the grid

```html
<masonry-grid #grid="masonryGrid" (layoutComplete)="onLayout($event)">…</masonry-grid>
<p>{{ grid.columns() }} columns at {{ grid.columnWidth() }}px</p>
```

Signals: `ready()`, `columns()`, `columnWidth()`, `contentHeight()`, `itemCount()`.
Outputs: `layoutComplete`, `removeComplete`, `itemsLoaded`.

## Server-side rendering

Nothing to configure. The server renders a CSS multi-column approximation, so the HTML is useful
without JavaScript, and the first client pass swaps to real masonry in one synchronous write — no
layout shift. Pair it with `entryAnimation.animateInitial: false` so content the visitor can already
see is not animated in.

## Going further

|                                                                                                        |                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Full reference](https://github.com/MeAkib/masonry-angular/blob/main/projects/masonry-angular/DOCS.md) | Every option, spans and stamps, CSS-driven sizing, driving the grid by hand, styling hooks, testing, using the solver standalone, and migrating from `ngx-masonry` / `angular2-masonry`. |
| [Architecture](https://github.com/MeAkib/masonry-angular/blob/main/ARCHITECTURE.md)                    | How it works inside: the layout pass, the invalidation model, the solver, the performance invariants.                                                                                    |
| [Examples](https://github.com/MeAkib/masonry-angular/tree/main/projects/demo)                          | A runnable app: gallery, spans and stamps, a deferred-loading dashboard, collection churn, and 4000 items.                                                                               |

## License

MIT
