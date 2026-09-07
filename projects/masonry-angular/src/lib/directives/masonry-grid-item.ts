import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';
import { MasonryGridHost } from '../core/host';
import type { MasonryItemHandle } from '../models';

/** Coerce `[masonryColSpan]` values, including the bare-attribute empty string. */
function coerceColSpan(value: number | string | undefined | null): number {
  if (value === '' || value === null || value === undefined) return 1;
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
}

/**
 * Marks a projected element as a grid item.
 *
 * ```html
 * <article masonryGridItem [masonryColSpan]="2">…</article>
 * ```
 */
@Directive({
  selector: '[masonryGridItem]',
  exportAs: 'masonryGridItem',
  host: { class: 'masonry-item' },
})
export class MasonryGridItem implements MasonryItemHandle {
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly grid = inject(MasonryGridHost);

  /** How many columns this item occupies. Clamped to the grid's column count. */
  readonly colSpan = input<number, number | string | undefined>(1, {
    alias: 'masonryColSpan',
    transform: coerceColSpan,
  });

  /**
   * Leave this item out of the layout and return it to normal flow, without
   * unregistering it. Toggling it back restores positioning on the next pass.
   */
  readonly ignored = input(false, { alias: 'masonryIgnore' });

  /** Cleared once every image inside the item has decoded. */
  private awaitingImages = false;

  constructor() {
    this.applyInitialStyles();

    // Registering after render guarantees the element is attached beneath the
    // grid, which is what lets the grid derive item order from its child list.
    afterNextRender(() => {
      this.grid.addItem(this);
      this.awaitImages();
    });

    // A span change only affects geometry, so no measurement is invalidated —
    // but the grid does have to rewrite item widths, which it otherwise skips
    // when the column geometry is unchanged.
    effect(() => {
      this.colSpan();
      this.ignored();
      this.grid.invalidateItemGeometry();
    });

    inject(DestroyRef).onDestroy(() => {
      // Releasing the pending count matters even here: an item torn down while
      // its images decode would otherwise hold `itemsLoaded` back forever.
      if (this.awaitingImages) {
        this.awaitingImages = false;
        this.grid.noteImagesSettled();
      }
      this.grid.removeItem(this);
    });
  }

  /** @internal Part of the grid's item contract. */
  measurable(): boolean {
    return !this.awaitingImages;
  }

  /**
   * Styles applied before the first layout pass. These also render on the
   * server, so the multi-column fallback produces a usable page without JS.
   */
  private applyInitialStyles(): void {
    const style = this.element.style;
    if (this.grid.options().ssr.fallback === 'columns') {
      style.breakInside = 'avoid';
      style.width = '100%';
    } else {
      // Without a fallback there is nothing meaningful to show until the first
      // pass, so stay hidden rather than flash an unstyled stack.
      style.visibility = 'hidden';
    }
  }

  /**
   * Hold the item back until its images have decoded.
   *
   * Unlike a `load` listener, `decode()` resolves only once the frame is ready
   * to paint, so the height we measure is the height that will be rendered.
   * Lazy images are never awaited: one that is still off-screen would never
   * resolve and would strand the item forever.
   */
  private awaitImages(): void {
    if (!this.grid.options().awaitImages) return;

    const pending: Promise<unknown>[] = [];
    for (const image of this.element.querySelectorAll('img')) {
      if (image.complete || image.loading === 'lazy' || !image.currentSrc) continue;
      pending.push(image.decode().catch(() => settled(image)));
    }
    if (pending.length === 0) return;

    this.awaitingImages = true;
    this.grid.noteImagesPending();
    void Promise.all(pending).then(() => {
      this.awaitingImages = false;
      this.grid.noteImagesSettled();
      this.grid.requestLayout();
    });
  }
}

/** Resolve when a broken or undecodable image has at least finished loading. */
function settled(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      resolve();
    };
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  });
}
