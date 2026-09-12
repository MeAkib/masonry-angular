/**
 * masonry-angular — minimal starter.
 *
 * Everything the grid needs is in the template below. There is no layout code
 * to call and no `reloadItems()`: add, remove or reorder the array and the grid
 * follows on its own.
 */
import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { NG_MASONRY_GRID } from 'masonry-angular';

interface Photo {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly featured: boolean;
}

/** Deterministic sizes, so the grid looks the same every time it boots. */
const HEIGHTS = [300, 520, 260, 440, 310, 580, 350, 420, 280, 500, 330, 460];

function makePhoto(id: number): Photo {
  const height = HEIGHTS[id % HEIGHTS.length];
  return {
    id,
    url: `https://picsum.photos/seed/masonry-${id}/400/${height}`,
    title: `Photo ${id}`,
    width: 400,
    height,
    featured: id % 7 === 0,
  };
}

@Component({
  selector: 'app-root',
  imports: [NG_MASONRY_GRID],
  template: `
    <header>
      <h1>masonry-angular</h1>
      <p>
        {{ photos().length }} items · <strong>{{ grid.state().columns }}</strong> columns ·
        {{ round(grid.state().contentHeight) }}px tall
      </p>
      <div class="controls">
        <button type="button" (click)="add()">Add</button>
        <button type="button" (click)="prepend()">Add to front</button>
        <button type="button" (click)="removeFirst()" [disabled]="!photos().length">
          Remove first
        </button>
        <button type="button" (click)="shuffle()">Shuffle</button>
        <label>
          <input type="checkbox" [checked]="wide()" (change)="wide.set(!wide())" />
          Wider columns
        </label>
      </div>
    </header>

    <!--
      columnWidth = "as many columns of about this width as fit".
      No breakpoints to maintain — resize the preview pane and watch.
    -->
    <masonry-grid #grid="masonryGrid" [columnWidth]="wide() ? 320 : 220" gutter="16">
      @for (photo of photos(); track photo.id) {
        <article masonryGridItem [masonryColSpan]="photo.featured ? 2 : 1">
          <img
            [src]="photo.url"
            [alt]="photo.title"
            [width]="photo.width"
            [height]="photo.height"
          />
          <h2>{{ photo.title }}</h2>
        </article>
      }
    </masonry-grid>
  `,
})
export class App {
  private nextId = 13;

  readonly wide = signal(false);
  readonly photos = signal<Photo[]>(Array.from({ length: 12 }, (_, i) => makePhoto(i + 1)));

  round(value: number): number {
    return Math.round(value);
  }

  add(): void {
    this.photos.update((list) => [...list, makePhoto(this.nextId++)]);
  }

  /** Prepending proves order comes from the DOM, not from insertion time. */
  prepend(): void {
    this.photos.update((list) => [makePhoto(this.nextId++), ...list]);
  }

  removeFirst(): void {
    this.photos.update((list) => list.slice(1));
  }

  shuffle(): void {
    this.photos.update((list) => {
      const next = [...list];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  }
}

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
});
