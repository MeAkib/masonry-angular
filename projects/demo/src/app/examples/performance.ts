import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NG_MASONRY_GRID, type MasonryGridOptions, type MasonryLayoutEvent } from 'masonry-angular';

interface Tile {
  readonly id: number;
  readonly height: number;
  readonly hue: number;
}

function makeTiles(count: number): Tile[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    height: 60 + ((id * 37) % 190),
    hue: (id * 23) % 360,
  }));
}

/**
 * Scale. Every knob here maps to a specific cost the grid is designed to avoid:
 * per-frame allocation, layout thrash, and rendering work for off-screen items.
 */
@Component({
  selector: 'performance-example',
  imports: [NG_MASONRY_GRID, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lede">
      Solve time is measured across the whole pass — reading measurements, running the solver and
      writing every transform. Sizes arrive pre-computed from one shared
      <code>ResizeObserver</code>, so a pass performs no forced reflow, and repeated passes with
      identical input return before touching the DOM. Turn on <code>contentVisibility</code> to let
      the browser skip rendering off-screen tiles.
    </p>

    <section class="controls">
      <fieldset>
        <legend>tiles — {{ count() }}</legend>
        <input
          type="range"
          min="50"
          max="4000"
          step="50"
          [value]="count()"
          (input)="count.set(+$any($event.target).value)"
        />
      </fieldset>

      <fieldset>
        <legend>options</legend>
        <label>
          <input
            type="checkbox"
            [checked]="contentVisibility()"
            (change)="contentVisibility.set($any($event.target).checked)"
          />
          contentVisibility
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="transitions()"
            (change)="transitions.set($any($event.target).checked)"
          />
          position transitions
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="animate()"
            (change)="animate.set($any($event.target).checked)"
          />
          entry animation
        </label>
      </fieldset>

      @if (stats(); as stat) {
        <dl class="stats">
          <div>
            <dt>columns</dt>
            <dd>{{ stat.columns }}</dd>
          </div>
          <div>
            <dt>items</dt>
            <dd>{{ stat.itemCount }}</dd>
          </div>
          <div>
            <dt>height</dt>
            <dd>{{ stat.height | number: '1.0-0' }}px</dd>
          </div>
          <div>
            <dt>last pass</dt>
            <dd>{{ stat.durationMs | number: '1.2-2' }}ms</dd>
          </div>
          <div>
            <dt>passes</dt>
            <dd>{{ stat.pass }}</dd>
          </div>
        </dl>
      }
    </section>

    <masonry-grid [options]="options()" (layoutComplete)="stats.set($event)">
      @for (tile of tiles(); track tile.id) {
        <div masonryGridItem class="tile" [style.--hue]="tile.hue" [style.height.px]="tile.height">
          {{ tile.id }}
        </div>
      }
    </masonry-grid>
  `,
})
export class PerformanceExample {
  readonly count = signal(600);
  readonly contentVisibility = signal(true);
  readonly transitions = signal(true);
  readonly animate = signal(false);
  readonly stats = signal<MasonryLayoutEvent | undefined>(undefined);

  readonly tiles = computed(() => makeTiles(this.count()));

  readonly options = computed<MasonryGridOptions>(() => ({
    columnWidth: 150,
    gutter: 10,
    contentVisibility: this.contentVisibility(),
    transition: this.transitions() ? {} : { duration: 0 },
    entryAnimation: this.animate() ? { stagger: 4, maxStagger: 300 } : false,
    // Large grids benefit from riding out a resize drag before recomputing.
    resizeDebounce: 60,
  }));
}
