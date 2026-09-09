# masonry-angular — workspace

Angular workspace for the **masonry-angular** library and its example app.

| Project | Path | |
| --- | --- | --- |
| `masonry-angular` | `projects/masonry-angular` | The publishable library. |
| `masonry-angular/testing` | `projects/masonry-angular/testing` | Test doubles, a secondary entry point. |
| `demo` | `projects/demo` | The example app. |

Cascading grid layout with its own solver — no `masonry-layout`, no jQuery, no runtime dependencies.
Signal-based, zoneless, SSR-safe, and 8.6 KB gzipped. With `native: true` it hands the whole layout
to browsers that ship `display: grid-lanes`.

```bash
npm install
npm start     # builds the library, then serves the examples on :4200
npm test      # 185 tests
```

The demo resolves `masonry-angular` through a path mapping to `dist/`, so the library has to be built
before the app runs. `npm start` does that; use `npm run watch:lib` in a second terminal while
working on both.

## Documentation

| | |
| --- | --- |
| [Getting started](projects/masonry-angular/GETTING-STARTED.md) | A tutorial, from install to a responsive gallery with SSR. |
| [Usage](projects/masonry-angular/README.md) | The short version — what it is and how to configure it. |
| [Full reference](projects/masonry-angular/DOCS.md) | Every option, spans, stamps, testing, migration. |
| [Changelog](CHANGELOG.md) | What changed in each release, and how to upgrade. |
| [Releasing](RELEASING.md) | Publishing to npm: account setup, the release loop, CI. |
| [Contributing](CONTRIBUTING.md) | Setup, where each file lives, how a layout pass works, how to make a change. |
| [Architecture](ARCHITECTURE.md) | How it works inside: the layout pass, invalidation, the solver. |

## License

MIT — see [LICENSE](LICENSE).
