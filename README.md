# masonry-angular — workspace

Angular workspace for the **masonry-angular** library and its example app.

| Project | Path | |
| --- | --- | --- |
| `masonry-angular` | `projects/masonry-angular` | The publishable library. |
| `masonry-angular/testing` | `projects/masonry-angular/testing` | Test doubles, a secondary entry point. |
| `demo` | `projects/demo` | The example app, deployed to Vercel. |
| starter | `examples/stackblitz` | A minimal example that installs the package from npm. |

Cascading grid layout with its own solver — no `masonry-layout`, no jQuery, no runtime dependencies.
Signal-based, zoneless, SSR-safe, 8.6 KB gzipped, and works on Angular 17.1 through 22. With `native: true` it hands the whole layout
to browsers that ship `display: grid-lanes`.

```bash
npm install
npm start     # builds the library, then serves the examples on :4200
npm test      # 185 tests
```

The demo resolves `masonry-angular` through a path mapping to `dist/`, so the library has to be built
before the app runs. `npm start` does that; use `npm run watch:lib` in a second terminal while
working on both.

## Live examples

| | |
| --- | --- |
| [Open in StackBlitz](https://stackblitz.com/github/MeAkib/masonry-angular/tree/main/examples/stackblitz) | A minimal grid, installing `masonry-angular` from npm. Boots in the browser, nothing to set up. |
| Demo app | The five examples in `projects/demo`, deployed to Vercel. <!-- add the URL after the first deploy --> |

### Deploying

The demo deploys from `vercel.json`: `npm ci`, then `npm run build` (which builds the library before
the app), serving `dist/demo/browser`. Client-side routes are rewritten to `index.html`.

```bash
npx vercel        # preview deployment
npx vercel --prod # production
```

The Angular CLI needs Node `^22.22.3 || ^24.15.0 || >=26.0.0`, declared in `engines` so Vercel picks
a matching version. If a build fails on the Node version, set it in the Vercel project settings.

StackBlitz needs no deployment — it reads `examples/stackblitz` straight from GitHub.

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

## Contributing

Issues and pull requests are welcome, including from people who have never contributed to an
open-source project before.

At version 0.0.1 the most valuable contribution is not code — it is someone using this in a real
project and reporting what broke or what was confusing. Browser and device reports, an accessibility
audit, translations, and new demo examples are all wanted too, and none of them require
understanding the layout engine.

[**Ways to help**](CONTRIBUTING.md#ways-to-help) lists what would help most right now.
[Opening a pull request](CONTRIBUTING.md#opening-a-pull-request) is three commands and no ceremony.

If it works well for you, a star helps other people find it — search and recommendations both weigh
it. If it doesn't, an issue helps more.

## License

MIT — see [LICENSE](LICENSE).
