import type { Signal } from '@angular/core';
import type { MasonryItemHandle } from '../models/item';
import type { ResolvedMasonryGridOptions } from '../models/options';

/**
 * The contract an item or stamp directive needs from its grid.
 *
 * Declaring it as an abstract class lets the grid provide itself under this
 * token, so the directives depend on the contract rather than on the component
 * — no `forwardRef` cycles between files, and the grid stays mockable in tests.
 */
export abstract class MasonryGridHost {
  /** Validated, fully defaulted options currently in effect. */
  abstract readonly options: Signal<ResolvedMasonryGridOptions>;
  /** `true` once the client has taken over layout from the SSR fallback. */
  abstract readonly ready: Signal<boolean>;
  /**
   * `true` when the browser is laying this grid out itself with native CSS
   * masonry, so the directives can skip work the browser already does — item
   * measurement, image awaiting, and the pre-layout hidden state.
   *
   * Always `false` on the server, where the answer would be about the wrong
   * machine; the stylesheet's `@supports` rule is what makes server output
   * correct.
   */
  abstract readonly nativeActive: Signal<boolean>;

  abstract addItem(item: MasonryItemHandle): void;
  abstract removeItem(item: MasonryItemHandle): void;
  abstract addStamp(element: HTMLElement): void;
  abstract removeStamp(element: HTMLElement): void;

  /** Register the element whose width dictates the column width. */
  abstract setSizer(element: HTMLElement): void;
  abstract clearSizer(element: HTMLElement): void;

  /** Coalesced request for a layout pass on the next animation frame. */
  abstract requestLayout(): void;

  /**
   * Tell the grid an item's column span changed, so the next pass rewrites
   * item widths. Widths are otherwise only recomputed when the geometry moves,
   * which keeps large grids off an O(items) walk on every pass.
   */
  abstract invalidateItemGeometry(): void;

  /** Track how many items are holding back layout while their images decode. */
  abstract noteImagesPending(): void;
  abstract noteImagesSettled(): void;
}
