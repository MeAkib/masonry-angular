/**
 * Making items appear, move and leave.
 *
 * Three separate effects live here, and it helps to keep them apart:
 *
 * - **entry** — a Web Animations effect played once, when an item is first
 *   positioned. Staggered across a batch so twenty new items cascade in.
 * - **movement** — a plain CSS `transition` on `transform`. Not an animation:
 *   once it is switched on, the browser eases every later position change for
 *   free, with no JavaScript involved.
 * - **exit** — played on a *clone*, for the reason explained on `playExit`.
 *
 * Everything here degrades quietly. If the Web Animations API is missing, or a
 * duration is `0`, or the config is `false`, the effect simply does not play and
 * the layout is unaffected.
 */

import type { ItemRecord, ResolvedMasonryGridOptions } from '../models';

/** Whether this environment can play Web Animations at all. */
function canAnimate(): boolean {
  return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
}

export class Motion {
  /** Clones currently playing an exit effect, keyed by the animation. */
  private readonly leavingClones = new Map<Animation, HTMLElement>();

  /** Items waiting for their movement transition to be switched on. */
  private readonly transitionQueue: ItemRecord[] = [];
  private transitionFrame = 0;

  private destroyed = false;

  constructor(
    private readonly container: HTMLElement,
    /**
     * Called once for each clone that finishes or is cancelled, so the grid can
     * count the removal and decide when to emit `removeComplete`.
     */
    private readonly onExitSettled: () => void,
  ) {}

  /** `true` while at least one exit effect is still playing. */
  get hasLeavingItems(): boolean {
    return this.leavingClones.size > 0;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.transitionFrame !== 0) {
      cancelAnimationFrame(this.transitionFrame);
      this.transitionFrame = 0;
    }
    for (const [animation, clone] of [...this.leavingClones]) {
      animation.cancel();
      clone.remove();
    }
    this.leavingClones.clear();
    this.transitionQueue.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Entry
  // ---------------------------------------------------------------------------

  /**
   * Play the entry effect across a batch of newly placed items.
   *
   * @param isFirstPass Server-rendered content is already on screen before we
   *   get here, so animating it in would be a flash of movement the visitor did
   *   not ask for. `animateInitial: false` suppresses exactly that.
   */
  playEntry(
    entering: readonly ItemRecord[],
    options: ResolvedMasonryGridOptions,
    isFirstPass: boolean,
  ): void {
    const config = options.entryAnimation;
    if (config === false || config.duration === 0) return;
    if (isFirstPass && !config.animateInitial) return;
    if (!canAnimate()) return;

    for (let i = 0; i < entering.length; i++) {
      // Capped, so a batch of five hundred items does not take a minute to finish.
      const delay = Math.min(i * config.stagger, config.maxStagger);

      // `fill: 'backwards'` holds the first keyframe during the stagger delay,
      // then releases every property it touched when the effect ends — so
      // nothing lingers to override a later layout write.
      entering[i]!.handle.element.animate(config.keyframes as Keyframe[], {
        duration: config.duration,
        easing: config.easing,
        delay,
        fill: 'backwards',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  /**
   * Switch on the movement transition, one frame after an item is first placed.
   *
   * The delay is the entire point. An item is placed by writing a `transform`
   * that moves it from the origin to its slot. If the transition were already
   * active, the visitor would watch every new item slide in from the top-left
   * corner. Waiting one frame means the item simply *appears* where it belongs,
   * and only its *later* moves are eased.
   */
  enableTransitions(entering: readonly ItemRecord[], options: ResolvedMasonryGridOptions): void {
    const { duration, easing } = options.transition;
    if (duration === 0) return;

    for (const record of entering) this.transitionQueue.push(record);
    if (this.transitionFrame !== 0) return;

    this.transitionFrame = requestAnimationFrame(() => {
      this.transitionFrame = 0;
      // `transform` only. Transitioning `width` would make the browser re-run
      // layout for every item on every frame of a window resize.
      const value = `transform ${duration}ms ${easing}`;
      for (const record of this.transitionQueue) {
        if (record.transitioned) continue;
        record.transitioned = true;
        record.handle.element.style.transition = value;
      }
      this.transitionQueue.length = 0;
    });
  }

  // ---------------------------------------------------------------------------
  // Exit
  // ---------------------------------------------------------------------------

  /**
   * Play the exit effect for a removed item. Returns `false` if it did not play.
   *
   * There is a catch that shapes this whole method: **by the time we hear that
   * an item was removed, Angular has already taken it out of the page.** The
   * directive's destroy hook runs after the element is detached, so there is
   * nothing left on screen to fade out.
   *
   * The way around it is to animate a copy. `cloneNode` gives us an identical
   * element that still carries the inline `position`, `width` and `transform`
   * the grid wrote — which is precisely what makes it land where the real item
   * was — and we append it, animate it, and throw it away when it finishes.
   *
   * The consequence to know about: the clone is a static picture. It has no
   * event handlers, no component state, and no live bindings. That is fine for
   * a fade or a shrink, and wrong for anything interactive.
   */
  playExit(record: ItemRecord, options: ResolvedMasonryGridOptions): boolean {
    const config = options.exitAnimation;
    if (config === false || config.duration === 0 || this.destroyed || !canAnimate()) return false;

    const clone = record.handle.element.cloneNode(true) as HTMLElement;
    clone.classList.add('masonry-item--leaving');
    // The clone is scenery: keep it away from assistive technology and the mouse.
    clone.setAttribute('aria-hidden', 'true');
    clone.style.pointerEvents = 'none';
    // Clear the movement transition, which would otherwise fight the keyframes.
    clone.style.transition = '';
    this.container.appendChild(clone);

    const animation = clone.animate(config.keyframes as Keyframe[], {
      duration: config.duration,
      easing: config.easing,
      fill: 'forwards',
    });
    this.leavingClones.set(animation, clone);

    const settle = (): void => {
      // `delete` returns false if we already cleaned up, which happens when both
      // `finish` and `cancel` fire. Guarding here keeps the count honest.
      if (!this.leavingClones.delete(animation)) return;
      clone.remove();
      if (this.destroyed) return;
      this.onExitSettled();
    };
    animation.addEventListener('finish', settle);
    animation.addEventListener('cancel', settle);
    return true;
  }
}
