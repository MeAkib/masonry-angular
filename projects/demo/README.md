# masonry-angular — examples

A runnable example application for the library, with five focused pages.

```bash
npm start        # from the workspace root
```

| Route          | What it demonstrates                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/gallery`     | The everyday case: named responsive breakpoints, mixed-height cards, images the grid waits on before positioning, entry animation, live geometry readout. |
| `/spans`       | `masonryColSpan` multi-column items, a `masonryGridStamp` region items flow around, `horizontalOrder`, and right-to-left layout.                          |
| `/dashboard`   | Twenty fixed-size tiles — pixel height, width in whole columns — with every body behind `@defer (on viewport)`, and a `breakpoints` scale of its own.     |
| `/dynamic`     | Collection churn — append, prepend, remove and shuffle — showing that item order comes from the DOM and never needs a manual reload.                      |
| `/performance` | Up to 4000 items, with `contentVisibility`, position transitions and entry animation each toggleable, plus per-pass timing.                               |

Application-wide defaults are registered with `provideNgMasonryGrid()` in
[`app.config.ts`](src/app/app.config.ts); each example layers its own options on top.
