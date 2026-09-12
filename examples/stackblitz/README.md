# masonry-angular starter

A single-file example that installs **`masonry-angular` from npm**, not from this repository's
source. That is the point of it: if this boots, the published package works.

**[Open in StackBlitz →](https://stackblitz.com/github/MeAkib/masonry-angular/tree/main/examples/stackblitz)**

## Running it locally

```bash
npm install
npm start
```

## What it shows

Everything is in [`src/main.ts`](./src/main.ts) — about 100 lines, most of it the sample data.

- **`columnWidth="220"`** — as many ~220px columns as fit, with no breakpoints to maintain. Resize
  the preview pane and the count follows.
- **`[masonryColSpan]="2"`** on featured items, so one card is twice as wide.
- **Add, prepend, remove, shuffle.** Each button changes the array and nothing else. There is no
  `reloadItems()` — the grid watches its children and re-lays out on its own. "Add to front" is the
  one to try: item order comes from the DOM, so a prepended item appears first.
- **`width` and `height` on every `<img>`.** This is what keeps the grid from jumping while images
  load — the browser reserves the right space before the file arrives.
- **`grid.state()`** read through a template reference, showing the live column count and content
  height.

## Why this is separate from `projects/demo`

`projects/demo` resolves `masonry-angular` through a TypeScript path mapping to `dist/`, so it needs
the library built first — fine locally, slow and fragile in a browser sandbox. This project depends
on the registry version instead, so StackBlitz only has to run `npm install`.

It also means a broken publish shows up here immediately: if the package on npm is missing files or
has the wrong peer range, this example stops booting.
