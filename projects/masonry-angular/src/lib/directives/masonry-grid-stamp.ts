import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { MasonryGridHost } from '../core/host';

/**
 * Marks a projected element as a stamp: a fixed region that grid items flow
 * around instead of overlapping.
 *
 * Position the stamp yourself — the grid only measures where you put it.
 *
 * ```html
 * <masonry-grid>
 *   <aside masonryGridStamp style="position: absolute; top: 0; right: 0; width: 320px">…</aside>
 *   <article masonryGridItem>…</article>
 * </masonry-grid>
 * ```
 */
@Directive({
  selector: '[masonryGridStamp]',
  exportAs: 'masonryGridStamp',
  host: { class: 'masonry-stamp' },
})
export class MasonryGridStamp {
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly grid = inject(MasonryGridHost);

  constructor() {
    afterNextRender(() => this.grid.addStamp(this.element));
    inject(DestroyRef).onDestroy(() => this.grid.removeStamp(this.element));
  }
}
