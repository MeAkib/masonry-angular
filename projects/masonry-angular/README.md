# masonry-angular

Cascading grid ("masonry") layout for Angular. Its own solver — no `masonry-layout`, no jQuery, no
`imagesLoaded`, no runtime dependencies at all. 8.6 KB gzipped.

```html
<masonry-grid columns="3" gutter="20">
  @for (photo of photos(); track photo.id) {
    <article masonryGridItem>…</article>
  }
</masonry-grid>
```

That is the whole setup. Add, remove and reorder items however you like — the grid watches sizes and
the DOM and re-lays out on its own. There is no `reloadItems()` to remember.

- **Signal-based and zoneless**, standalone directives, `OnPush`, layout loop outside change detection.
- **SSR-safe.** The server renders a usable multi-column approximation; hydration swaps in real
  masonry with no layout shift.
- **Uses native CSS masonry where it exists.** With `native: true`, browsers that ship
  `display: grid-lanes` lay the grid out themselves — no measuring, no observers, no JavaScript.
- **Fast.** One shared `ResizeObserver`, one frame per burst of changes, transform-based positioning.
  The solver places 10,000 items in 0.16 ms.

## Install

```bash
npm install masonry-angular
```

Requires Angular 22 or newer.

```ts
import { NG_MASONRY_GRID } from 'masonry-angular';

@Component({ imports: [NG_MASONRY_GRID], /* … */ })
export class PhotoWall {}
```

## Configure it

Five inputs cover almost everything, and they work as plain attributes:

```html
<masonry-grid columnWidth="260" gutter="20">              <!-- as many 260px columns as fit -->
<masonry-grid columns="3" gutter="20">                     <!-- a fixed count -->
<masonry-grid [columns]="{ 0: 1, 768: 2, 1200: 4 }">       <!-- counts by breakpoint -->
```

`columns`, `columnWidth`, `gutter`, `gutterX`, `gutterY`. Everything else — animations, RTL, SSR,
stamps, `native` — lives on `[options]`, and the two layer:

```html
<masonry-grid columns="4" [options]="{ native: true, entryAnimation: false }">…</masonry-grid>
```

Two rules worth knowing: **do not set a width on your items** (the grid owns it), and **widen an item
with `[masonryColSpan]="2"`**, not CSS.

## The four directives

| | |
| --- | --- |
| `<masonry-grid>` | The container. |
| `[masonryGridItem]` | An item. `[masonryColSpan]` widens it; `[masonryIgnore]` drops it out. |
| `[masonryGridStamp]` | A region items flow around instead of overlapping. |
| `[masonryGridSizer]` | An element whose CSS width becomes the column width. |

## Where to go next

| | |
| --- | --- |
| [Getting started](https://github.com/MeAkib/masonry-angular/blob/main/projects/masonry-angular/GETTING-STARTED.md) | A tutorial: from install to a responsive gallery with SSR. |
| [Full reference](https://github.com/MeAkib/masonry-angular/blob/main/projects/masonry-angular/DOCS.md) | Every option, spans, stamps, testing, and migrating from `ngx-masonry`. |
| [Changelog](https://github.com/MeAkib/masonry-angular/blob/main/CHANGELOG.md) | What changed in each release. |
| [Architecture](https://github.com/MeAkib/masonry-angular/blob/main/ARCHITECTURE.md) | How it works inside. |
| [Contributing](https://github.com/MeAkib/masonry-angular/blob/main/CONTRIBUTING.md) | Setting up, and where each file lives. |

## License

MIT
