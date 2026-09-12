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

**[Try it in StackBlitz](https://stackblitz.com/github/MeAkib/masonry-angular/tree/main/examples/stackblitz)** —
a running grid in your browser, no setup.

## Install

```bash
npm install masonry-angular
```

Works on **Angular 17.1 and every version since**, including 22. Each of those majors is verified by
building a real application against the published package — see
[Angular support](#angular-support).

## Copy-paste starting point

A complete component that works on every supported version. If you only read one code block, read
this one — the comments mark the three things people get wrong.

```ts
import { Component, signal } from '@angular/core';
import { NG_MASONRY_GRID } from 'masonry-angular';

@Component({
  selector: 'app-gallery',
  // Angular 17 and 18 only: add `standalone: true`. It is the default from 19 on.
  imports: [NG_MASONRY_GRID],
  template: `
    <!-- "as many ~260px columns as fit" — no breakpoints to maintain -->
    <masonry-grid columnWidth="260" gutter="16">
      @for (photo of photos(); track photo.id) {
        <!-- widen an item with masonryColSpan, never with CSS width -->
        <article masonryGridItem [masonryColSpan]="photo.featured ? 2 : 1">
          <!-- width/height let the browser reserve space, so the grid never jumps -->
          <img [src]="photo.url" [alt]="photo.title" [width]="photo.width" [height]="photo.height" />
        </article>
      }
    </masonry-grid>
  `,
  styles: `
    /* The grid sets item width itself — never set a width on an item. */
    article[masonryGridItem] img { width: 100%; display: block; }
  `,
})
export class Gallery {
  readonly photos = signal([
    { id: 1, url: '/a.jpg', title: 'A', width: 400, height: 300, featured: false },
  ]);
}
```

Add, remove or reorder `photos` and the grid follows. There is no `reloadItems()` and nothing to
call after a change.

## Configure it

Five inputs cover almost everything, and they work as plain attributes:

```html
<masonry-grid columnWidth="260" gutter="20">                 <!-- as many 260px columns as fit -->
<masonry-grid columns="3" gutter="20">                       <!-- a fixed count -->
<masonry-grid [columns]="{ '0': 1, '768': 2, '1200': 4 }">   <!-- counts by breakpoint -->
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

## Angular support

| Angular | Status |
| ------- | ------ |
| 17.1 – 22 | Supported, and each major is verified by building a real app against the published package. |
| Below 17.1 | Not supported. The library uses `input()` with a transform, which the Angular linker only understands from 17.1. |

There is nothing to configure — one build of the package serves every version. It ships in Angular's
partial-compilation format, so your own build finishes compiling it, which is why a single artifact
works across six majors.

On **Angular 17 and 18**, add `standalone: true` to any component that imports the directives.
Standalone became the default in Angular 19; before that, `imports:` on its own is a compile error
(`TS-992010`). Nothing else differs between versions.

## Where to go next

| | |
| --- | --- |
| [Getting started](https://github.com/MeAkib/masonry-angular/blob/main/projects/masonry-angular/GETTING-STARTED.md) | A tutorial: from install to a responsive gallery with SSR. |
| [Full reference](https://github.com/MeAkib/masonry-angular/blob/main/projects/masonry-angular/DOCS.md) | Every option, spans, stamps, testing, and migrating from `ngx-masonry`. |
| [Changelog](https://github.com/MeAkib/masonry-angular/blob/main/CHANGELOG.md) | What changed in each release. |
| [Architecture](https://github.com/MeAkib/masonry-angular/blob/main/ARCHITECTURE.md) | How it works inside. |
| [Contributing](https://github.com/MeAkib/masonry-angular/blob/main/CONTRIBUTING.md) | Setting up, and where each file lives. |

## Help shape it

This is version 0.0.1 — early enough that your opinion still changes the API.

The most useful thing you can do is use it in a real project and
[open an issue](https://github.com/MeAkib/masonry-angular/issues/new/choose) about whatever went
wrong or felt harder than it should. "I expected X and got Y" is a complete bug report; you do not
have to diagnose it.

Also wanted, and none of it requires touching the library: Safari and Firefox reports, mobile and
RTL testing, a screen-reader audit, translations of the getting-started guide, and demo examples
covering what the current five do not.

New to open source? This is a reasonable place to start, and saying so is welcome. See
[CONTRIBUTING.md](https://github.com/MeAkib/masonry-angular/blob/main/CONTRIBUTING.md#ways-to-help).

## License

MIT
