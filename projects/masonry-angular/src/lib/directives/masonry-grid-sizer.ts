import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { MasonryGridHost } from '../core/host';

/**
 * Marks an element whose measured width is the grid's column width.
 *
 * This is the CSS-driven alternative to the `columnWidth` option, and the
 * replacement for `masonry-layout`'s `columnWidth: '.grid-sizer'` selector: the
 * column width lives in your stylesheet, where media queries and container
 * queries can own it, and the grid follows whatever the element reports.
 *
 * ```html
 * <masonry-grid>
 *   <div masonryGridSizer class="sizer"></div>
 *   <article masonryGridItem>…</article>
 * </masonry-grid>
 * ```
 *
 * ```css
 * .sizer { width: 50%; }
 * @media (min-width: 900px) { .sizer { width: 25%; } }
 * ```
 *
 * The element stays in normal flow and is never positioned, so give it no
 * height. A sizer takes precedence over both `columns` and `columnWidth`; a
 * development build warns if you set either alongside one.
 */
@Directive({
  selector: '[masonryGridSizer]',
  exportAs: 'masonryGridSizer',
  host: { class: 'masonry-sizer', 'aria-hidden': 'true' },
})
export class MasonryGridSizer {
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly grid = inject(MasonryGridHost);

  constructor() {
    afterNextRender(() => this.grid.setSizer(this.element));
    inject(DestroyRef).onDestroy(() => this.grid.clearSizer(this.element));
  }
}
