/**
 * Test doubles for the two browser APIs the grid drives its layout from.
 *
 * jsdom implements neither `ResizeObserver` nor real layout, so these let a
 * test state exactly what the browser "measured" and exactly when a frame
 * runs — which makes the grid's multi-pass behaviour deterministic to assert.
 */

interface Size {
  readonly width: number;
  readonly height: number;
}

class FakeResizeObserver implements ResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];

  readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  emit(sizes: ReadonlyMap<Element, Size>): void {
    const entries = [...sizes]
      .filter(([target]) => this.targets.has(target))
      .map(([target, size]) => entryFor(target, size));
    if (entries.length > 0) this.callback(entries, this);
  }
}

function entryFor(target: Element, size: Size): ResizeObserverEntry {
  const box: ResizeObserverSize = { inlineSize: size.width, blockSize: size.height };
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: size.width,
    bottom: size.height,
    width: size.width,
    height: size.height,
    toJSON: () => ({}),
  } as DOMRectReadOnly;

  return {
    target,
    contentBoxSize: [box],
    borderBoxSize: [box],
    devicePixelContentBoxSize: [box],
    contentRect: rect,
  };
}

/**
 * Stand-in for a Web Animations `Animation`.
 *
 * jsdom implements no part of the Web Animations API, so entry and exit effects
 * cannot run — and cannot be asserted on — without one. This records what the
 * grid asked for and lets a test decide when the effect ends.
 */
export class FakeAnimation {
  static readonly instances: FakeAnimation[] = [];

  private listeners = new Map<string, (() => void)[]>();
  finished = false;
  cancelled = false;

  constructor(
    readonly target: Element,
    readonly keyframes: unknown,
    readonly options: unknown,
  ) {
    FakeAnimation.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type);
    if (existing) existing.push(listener);
    else this.listeners.set(type, [listener]);
  }

  removeEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type);
    if (existing)
      this.listeners.set(
        type,
        existing.filter((entry) => entry !== listener),
      );
  }

  private emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  /** Run the effect to completion, as the browser would. */
  finish(): void {
    if (this.finished || this.cancelled) return;
    this.finished = true;
    this.emit('finish');
  }

  cancel(): void {
    if (this.finished || this.cancelled) return;
    this.cancelled = true;
    this.emit('cancel');
  }
}

export class GridTestHarness {
  private readonly frames = new Map<number, FrameRequestCallback>();
  private nextFrameId = 1;
  private originalRaf: typeof requestAnimationFrame | undefined;
  private originalCaf: typeof cancelAnimationFrame | undefined;
  private originalObserver: typeof ResizeObserver | undefined;
  private originalAnimate: Element['animate'] | undefined;

  install(): void {
    this.originalRaf = globalThis.requestAnimationFrame;
    this.originalCaf = globalThis.cancelAnimationFrame;
    this.originalObserver = globalThis.ResizeObserver;

    globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = this.nextFrameId++;
      this.frames.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id: number): void => {
      this.frames.delete(id);
    };
    globalThis.ResizeObserver = FakeResizeObserver;
    FakeResizeObserver.instances.length = 0;

    this.originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      keyframes: unknown,
      options: unknown,
    ): Animation {
      return new FakeAnimation(this, keyframes, options) as unknown as Animation;
    } as Element['animate'];
    FakeAnimation.instances.length = 0;
  }

  uninstall(): void {
    if (this.originalRaf) globalThis.requestAnimationFrame = this.originalRaf;
    if (this.originalCaf) globalThis.cancelAnimationFrame = this.originalCaf;
    if (this.originalObserver) globalThis.ResizeObserver = this.originalObserver;
    if (this.originalAnimate) Element.prototype.animate = this.originalAnimate;
    else delete (Element.prototype as Partial<Element>).animate;
    this.frames.clear();
    FakeResizeObserver.instances.length = 0;
    FakeAnimation.instances.length = 0;
  }

  /** Every animation the grid has started since `install()`. */
  get animations(): readonly FakeAnimation[] {
    return FakeAnimation.instances;
  }

  /** Finish every animation still running, then drain any frames that queued. */
  finishAnimations(): void {
    for (const animation of [...FakeAnimation.instances]) animation.finish();
    this.flushFrames();
  }

  /** Run every queued frame callback, repeatedly, until the queue drains. */
  flushFrames(maxRounds = 10): number {
    let rounds = 0;
    while (this.frames.size > 0 && rounds < maxRounds) {
      const batch = [...this.frames.values()];
      this.frames.clear();
      for (const callback of batch) callback(performance.now());
      rounds++;
    }
    return rounds;
  }

  get pendingFrames(): number {
    return this.frames.size;
  }

  /** Report sizes for the given elements to every observer watching them. */
  measure(sizes: ReadonlyMap<Element, Size>): void {
    for (const observer of FakeResizeObserver.instances) observer.emit(sizes);
  }

  /**
   * Every element currently being observed, across all observers.
   *
   * Useful for asserting what a grid *is not* doing — that a native grid
   * measures nothing, or that a destroyed grid let go of its items.
   */
  observedElements(): readonly Element[] {
    const seen = new Set<Element>();
    for (const observer of FakeResizeObserver.instances) {
      for (const target of observer.targets) seen.add(target);
    }
    return [...seen];
  }
}
