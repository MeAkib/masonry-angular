import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NG_MASONRY_GRID, type MasonryGridOptions } from 'masonry-angular';

import { WIDGETS } from './dashboard-data';
import { DashboardWidget } from './dashboard-widget';

/**
 * Fixed-size tiles, loaded on demand.
 *
 * Two things meet here. Every tile declares its own height in pixels and its
 * own width in whole columns, so the solver does pure packing — nothing is
 * measured from content. And because the size is known before the content
 * exists, each body can sit behind an `@defer (on viewport)` block: the grid
 * lays out the full board immediately from the placeholders, then bodies load
 * as they scroll into view without moving a single tile.
 *
 * Widths have to go through `masonryColSpan` rather than CSS, because the grid
 * writes `style.width` on every item to fit the column geometry.
 */
@Component({
  selector: 'dashboard-example',
  imports: [NG_MASONRY_GRID, DashboardWidget],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lede">
      Twenty tiles, each a static size: height in pixels, width in whole columns via
      <code>masonryColSpan</code>. No body is rendered up front — every one sits behind
      <code>&#64;defer (on viewport)</code> and loads as its placeholder scrolls into view. Because
      the tile already owns its height, the swap costs no relayout: the grid positioned the board
      from the skeletons, and the real content lands in exactly the same box.
    </p>

    <section class="controls">
      <fieldset>
        <legend>packing</legend>
        <label>
          <input
            type="checkbox"
            [checked]="horizontalOrder()"
            (change)="horizontalOrder.set($any($event.target).checked)"
          />
          horizontal order
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="dense()"
            (change)="dense.set($any($event.target).checked)"
          />
          dense gutter
        </label>
      </fieldset>

      <fieldset>
        <legend>max columns — {{ maxColumns() }}</legend>
        <input
          type="range"
          min="2"
          max="6"
          [value]="maxColumns()"
          (input)="maxColumns.set(+$any($event.target).value)"
        />
      </fieldset>
    </section>

    <masonry-grid [options]="options()">
      @for (widget of widgets; track widget.id) {
        <article
          masonryGridItem
          [masonryColSpan]="widget.span"
          class="widget"
          [style.--hue]="widget.hue"
          [style.height.px]="widget.height"
        >
          <header>
            <h2>{{ widget.title }}</h2>
            <span class="dims">{{ widget.span }} col · {{ widget.height }}px</span>
          </header>

          <!--
            The item element stays outside the block, so the tile is registered
            with the grid — and holds its place — from the very first pass. Only
            the body is deferred, and the viewport trigger watches the placeholder.
          -->
          @defer (on viewport) {
            <dashboard-widget [widget]="widget" />
          } @placeholder (minimum 400ms) {
            <div class="skeleton" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
          }
        </article>
      }
    </masonry-grid>
  `,
})
export class DashboardExample {
  readonly widgets = WIDGETS;

  readonly horizontalOrder = signal(false);
  readonly dense = signal(false);
  readonly maxColumns = signal(4);

  readonly options = computed<MasonryGridOptions>(() => ({
    columns: { 0: 1, 620: 2, 980: 3, 1320: 4, 1680: 5, 2000: 6 },
    maxColumns: this.maxColumns(),
    gutter: this.dense() ? 8 : 16,
    horizontalOrder: this.horizontalOrder(),
  }));
}
