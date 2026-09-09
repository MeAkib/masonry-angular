# Changelog

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

Requires Angular 22 or newer.
