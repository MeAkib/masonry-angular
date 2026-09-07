import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NG_MASONRY_GRID, type MasonryGridOptions, type MasonryLayoutEvent } from 'masonry-angular';

import { artwork, makeCards, type DemoCard } from './cards';

type SizingMode = 'breakpoints' | 'fixed' | 'columnWidth';

/**
 * The everyday case: a responsive gallery of mixed-height cards, some of them
 * carrying images the grid waits on before positioning.
 */
@Component({
  selector: 'gallery-example',
  imports: [NG_MASONRY_GRID, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lede">
      Column count follows the container width through a breakpoint map. Cards with images are held
      back until <code>decode()</code> resolves, so they never land at the wrong height and shove
      their neighbours around.
    </p>

    <section class="controls">
      <fieldset>
        <legend>sizing</legend>
        <label>
          <input
            type="radio"
            name="sizing"
            [checked]="sizing() === 'breakpoints'"
            (change)="sizing.set('breakpoints')"
          />
          breakpoints
        </label>
        <label>
          <input
            type="radio"
            name="sizing"
            [checked]="sizing() === 'fixed'"
            (change)="sizing.set('fixed')"
          />
          3 columns
        </label>
        <label>
          <input
            type="radio"
            name="sizing"
            [checked]="sizing() === 'columnWidth'"
            (change)="sizing.set('columnWidth')"
          />
          260px columns
        </label>
      </fieldset>

      <fieldset>
        <legend>gutter — {{ gutter() }}px</legend>
        <input
          type="range"
          min="0"
          max="48"
          [value]="gutter()"
          (input)="gutter.set(+$any($event.target).value)"
        />
      </fieldset>

      <fieldset>
        <legend>entry animation</legend>
        <label>
          <input
            type="checkbox"
            [checked]="animate()"
            (change)="animate.set($any($event.target).checked)"
          />
          enabled
        </label>
        <button type="button" (click)="reload()">replay</button>
      </fieldset>

      @if (stats(); as stat) {
        <dl class="stats">
          <div>
            <dt>columns</dt>
            <dd>{{ stat.columns }}</dd>
          </div>
          <div>
            <dt>column width</dt>
            <dd>{{ stat.columnWidth | number: '1.0-0' }}px</dd>
          </div>
          <div>
            <dt>items</dt>
            <dd>{{ stat.itemCount }}</dd>
          </div>
          <div>
            <dt>pass</dt>
            <dd>{{ stat.durationMs | number: '1.2-2' }}ms</dd>
          </div>
        </dl>
      }
    </section>

    <masonry-grid [options]="options()" (layoutComplete)="stats.set($event)">
      @for (card of cards(); track card.id) {
        <article masonryGridItem class="card" [style.--hue]="card.hue">
          @if (card.image) {
            <img [src]="artwork(card.hue)" width="400" height="260" [alt]="card.title" />
          }
          <div class="card-body" [style.min-height.px]="card.height">
            <h2>{{ card.title }}</h2>
            <p>{{ card.body }}</p>
          </div>
        </article>
      }
    </masonry-grid>
  `,
})
export class GalleryExample {
  readonly cards = signal<DemoCard[]>(makeCards(24));
  readonly sizing = signal<SizingMode>('breakpoints');
  readonly gutter = signal(16);
  readonly animate = signal(true);
  readonly stats = signal<MasonryLayoutEvent | undefined>(undefined);

  readonly artwork = artwork;

  /**
   * A fresh object literal every change detection run. The grid compares it
   * structurally, so an unchanged configuration never queues a relayout.
   */
  readonly options = computed<MasonryGridOptions>(() => ({
    ...this.#sizingOptions(),
    gutter: this.gutter(),
    entryAnimation: this.animate() ? {} : false,
  }));

  reload(): void {
    this.cards.set([]);
    queueMicrotask(() => this.cards.set(makeCards(24)));
  }

  #sizingOptions(): MasonryGridOptions {
    switch (this.sizing()) {
      case 'fixed':
        return { columns: 3 };
      case 'columnWidth':
        return { columnWidth: 260 };
      default:
        return { columns: { 0: 1, 560: 2, 900: 3, 1280: 4, 1700: 5 } };
    }
  }
}
