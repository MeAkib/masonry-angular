/**
 * Coalesces any number of layout requests per frame into a single run.
 *
 * Every source of invalidation — resize observations, item registration, image
 * decoding, option changes — funnels through here, so a burst of a hundred
 * appended items still costs exactly one layout pass.
 */
export class FrameScheduler {
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor(private readonly task: () => void) {}

  get pending(): boolean {
    return this.frame !== 0 || this.timer !== undefined;
  }

  /**
   * Request a run on the next animation frame, optionally after a debounce.
   * Repeated calls collapse; a debounced call restarts the timer.
   */
  schedule(debounceMs = 0): void {
    if (this.destroyed || typeof requestAnimationFrame !== 'function') return;

    if (debounceMs > 0) {
      if (this.timer !== undefined) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.requestFrame();
      }, debounceMs);
      return;
    }

    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.requestFrame();
  }

  /** Run now if a pass is pending, dropping the scheduled one. */
  flush(): void {
    if (!this.pending || this.destroyed) return;
    this.cancel();
    this.task();
  }

  cancel(): void {
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  destroy(): void {
    this.cancel();
    this.destroyed = true;
  }

  private requestFrame(): void {
    if (this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.destroyed) this.task();
    });
  }
}
