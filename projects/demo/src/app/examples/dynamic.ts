import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NG_MASONRY_GRID, type MasonryGridOptions } from 'masonry-angular';

import { makeCards, type DemoCard } from './cards';

const OPTIONS: MasonryGridOptions = {
  columns: { xs: 1, sm: 2, md: 3, xl: 4 },
  gutter: 16,
};

/**
 * Collection churn. The grid reads item order from its own child list on every
 * pass, so prepends, removals and shuffles land in the right place without any
 * imperative "reload items" call.
 */
@Component({
  selector: 'dynamic-example',
  imports: [NG_MASONRY_GRID],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lede">
      Every button below mutates the source array and nothing else. Item order is derived from the
      DOM at layout time, so a prepend really lands first — the ordering bug that makes other
      masonry wrappers expose a manual <code>reloadItems()</code> cannot occur here.
    </p>

    <section class="controls">
      <fieldset>
        <legend>items — {{ cards().length }}</legend>
        <button type="button" (click)="append(1)">append</button>
        <button type="button" (click)="append(6)">append 6</button>
        <button type="button" (click)="prepend()">prepend</button>
        <button type="button" (click)="removeFirst()">remove first</button>
        <button type="button" (click)="removeRandom()">remove random</button>
        <button type="button" (click)="shuffle()">shuffle</button>
        <button type="button" (click)="reset()">reset</button>
      </fieldset>
    </section>

    <masonry-grid [options]="options">
      @for (card of cards(); track card.id) {
        <article masonryGridItem class="card" [style.--hue]="card.hue">
          <div class="card-body" [style.min-height.px]="card.height">
            <h2>{{ card.title }}</h2>
            <p>{{ card.body }}</p>
          </div>
        </article>
      }
    </masonry-grid>
  `,
})
export class DynamicExample {
  readonly options = OPTIONS;
  readonly cards = signal<DemoCard[]>(makeCards(15));

  #nextId = 15;

  append(count: number): void {
    const added = makeCards(count, this.#nextId);
    this.#nextId += count;
    this.cards.update((cards) => [...cards, ...added]);
  }

  prepend(): void {
    const [card] = makeCards(1, this.#nextId++);
    this.cards.update((cards) => [card!, ...cards]);
  }

  removeFirst(): void {
    this.cards.update((cards) => cards.slice(1));
  }

  removeRandom(): void {
    this.cards.update((cards) => {
      if (cards.length === 0) return cards;
      const index = Math.floor(Math.random() * cards.length);
      return cards.filter((_, i) => i !== index);
    });
  }

  shuffle(): void {
    this.cards.update((cards) => {
      const next = [...cards];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j]!, next[i]!];
      }
      return next;
    });
  }

  reset(): void {
    this.#nextId = 15;
    this.cards.set(makeCards(15));
  }
}
