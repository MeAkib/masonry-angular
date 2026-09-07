import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NG_MASONRY_GRID, type MasonryGridOptions } from 'masonry-angular';

import { makeCards, type DemoCard } from './cards';

/**
 * Placement controls: multi-column items, a stamped region items flow around,
 * row-first ordering, and right-to-left layout.
 */
@Component({
  selector: 'spans-example',
  imports: [NG_MASONRY_GRID],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lede">
      <code>masonryColSpan</code> widens an item across whole columns; the solver drops it into the
      group of columns with the lowest shared top edge. A <code>masonryGridStamp</code> element is
      positioned by you and treated as an obstacle. <code>horizontalOrder</code> switches from
      shortest-column packing to strict row order.
    </p>

    <section class="controls">
      <fieldset>
        <legend>placement</legend>
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
            [checked]="rtl()"
            (change)="rtl.set($any($event.target).checked)"
          />
          right to left
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="stamped()"
            (change)="stamped.set($any($event.target).checked)"
          />
          stamp
        </label>
      </fieldset>

      <fieldset>
        <legend>wide cards — every {{ spanEvery() }}th</legend>
        <input
          type="range"
          min="3"
          max="12"
          [value]="spanEvery()"
          (input)="spanEvery.set(+$any($event.target).value)"
        />
      </fieldset>
    </section>

    <masonry-grid [options]="options()">
      @if (stamped()) {
        <aside masonryGridStamp class="stamp">
          <strong>Stamped region</strong>
          <span>Items flow around this box instead of overlapping it.</span>
        </aside>
      }

      @for (card of cards(); track card.id) {
        <article
          masonryGridItem
          [masonryColSpan]="spanOf(card)"
          class="card"
          [style.--hue]="card.hue"
        >
          <div class="card-body" [style.min-height.px]="card.height">
            <h2>{{ card.title }}</h2>
            @if (spanOf(card) > 1) {
              <span class="badge">spans {{ spanOf(card) }} columns</span>
            }
          </div>
        </article>
      }
    </masonry-grid>
  `,
})
export class SpansExample {
  readonly cards = signal<DemoCard[]>(makeCards(22));
  readonly horizontalOrder = signal(false);
  readonly rtl = signal(false);
  readonly stamped = signal(true);
  readonly spanEvery = signal(5);

  readonly options = computed<MasonryGridOptions>(() => ({
    columns: { 0: 1, 560: 2, 900: 3, 1280: 4 },
    gutter: 18,
    horizontalOrder: this.horizontalOrder(),
    direction: this.rtl() ? 'rtl' : 'ltr',
  }));

  spanOf(card: DemoCard): number {
    return card.id % this.spanEvery() === 2 ? 2 : 1;
  }
}
