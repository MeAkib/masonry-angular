/**
 * Server entry point, used only at build time.
 *
 * The demo deploys as static files — `outputMode: 'static'` in `angular.json`
 * renders every route once during the build and writes plain HTML. Nothing here
 * runs in production; there is no server and no serverless function.
 *
 * It exists because AI crawlers do not execute JavaScript. GPTBot, ClaudeBot,
 * PerplexityBot and the search-time crawlers fetch a URL and read whatever HTML
 * comes back. For a client-rendered Angular app that is an empty
 * `<app-root></app-root>`, so every example, explanation and code block on this
 * site was invisible to them. Prerendering puts the text in the response.
 *
 * The `BootstrapContext` third argument is not optional: without it Angular has
 * no server platform registered and route extraction fails with NG0401.
 */
import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
