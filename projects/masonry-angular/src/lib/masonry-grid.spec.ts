import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MasonryGrid } from './masonry-grid';
import type { MasonryLayoutEvent, MasonryRemoveEvent } from './models';
import { MasonryGridItem } from './directives/masonry-grid-item';
import { MasonryGridStamp } from './directives/masonry-grid-stamp';
import { MasonryGridSizer } from './directives/masonry-grid-sizer';
import { provideNgMasonryGrid } from './providers';
import type { MasonryGridOptions } from './models';
import { GridTestHarness } from '../../testing/src/harness';

const CONTAINER_WIDTH = 320;

@Component({
  selector: 'test-host',
  imports: [MasonryGrid, MasonryGridItem, MasonryGridStamp, MasonryGridSizer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <masonry-grid
      [options]="options()"
      (layoutComplete)="events.push($event)"
      (removeComplete)="removals.push($event)"
      (itemsLoaded)="loaded.push($event)"
    >
      @if (stamped()) {
        <aside masonryGridStamp></aside>
      }
      @if (sized()) {
        <div masonryGridSizer data-sizer></div>
      }
      @for (item of items(); track item) {
        <div
          masonryGridItem
          [masonryColSpan]="spans()[item] ?? 1"
          [masonryIgnore]="ignored().includes(item)"
          [attr.data-id]="item"
        >
          {{ item }}
        </div>
      }
    </masonry-grid>
  `,
})
class TestHost {
  readonly items = signal<string[]>(['a', 'b', 'c']);
  readonly spans = signal<Record<string, number>>({});
  readonly stamped = signal(false);
  readonly sized = signal(false);
  readonly ignored = signal<string[]>([]);
  readonly options = signal<MasonryGridOptions>({ columns: 3, gutter: 10, entryAnimation: false });
  readonly events: MasonryLayoutEvent[] = [];
  readonly removals: MasonryRemoveEvent[] = [];
  readonly loaded: number[] = [];
}

describe('MasonryGrid', () => {
  let harness: GridTestHarness;
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;
  let grid: HTMLElement;

  /** Report a size for the container and every registered item, then run frames. */
  function measureAndFlush(heights: Record<string, number> = {}, defaultHeight = 50): void {
    const sizes = new Map<Element, { width: number; height: number }>();
    sizes.set(grid.parentElement!, { width: CONTAINER_WIDTH, height: 0 });
    sizes.set(grid, { width: CONTAINER_WIDTH, height: 0 });
    for (const element of items()) {
      const id = element.getAttribute('data-id')!;
      sizes.set(element, { width: 100, height: heights[id] ?? defaultHeight });
    }
    harness.measure(sizes);
    harness.flushFrames();
  }

  function items(): HTMLElement[] {
    return [...grid.querySelectorAll<HTMLElement>('[data-id]')];
  }

  /** Report a new container width, keeping every item's height unchanged. */
  function resizeContainerTo(width: number, heights: Record<string, number>): void {
    const sizes = new Map<Element, { width: number; height: number }>();
    sizes.set(grid.parentElement!, { width, height: 0 });
    sizes.set(grid, { width, height: 0 });
    for (const element of items()) {
      const id = element.getAttribute('data-id')!;
      sizes.set(element, { width: 100, height: heights[id] ?? 50 });
    }
    harness.measure(sizes);
    harness.flushFrames();
    fixture.detectChanges();
    harness.flushFrames();
  }

  function positionOf(id: string): [number, number] {
    const element = grid.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(element.style.transform);
    return match ? [Number(match[1]), Number(match[2])] : [Number.NaN, Number.NaN];
  }

  function settle(heights: Record<string, number> = {}, defaultHeight = 50): void {
    fixture.detectChanges();
    harness.flushFrames();
    measureAndFlush(heights, defaultHeight);
    fixture.detectChanges();
    harness.flushFrames();
  }

  beforeEach(async () => {
    harness = new GridTestHarness();
    harness.install();

    await TestBed.configureTestingModule({ imports: [TestHost] }).compileComponents();
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    grid = fixture.nativeElement.querySelector('masonry-grid');
  });

  afterEach(() => harness.uninstall());

  it('positions items into balanced columns', () => {
    settle({ a: 80, b: 40, c: 60 });

    expect(positionOf('a')).toEqual([0, 0]);
    expect(positionOf('b')).toEqual([110, 0]);
    expect(positionOf('c')).toEqual([220, 0]);
  });

  it('sizes items to the column width', () => {
    settle();

    expect(items().map((element) => element.style.width)).toEqual(['100px', '100px', '100px']);
  });

  it('sets the container height from the tallest column', () => {
    settle({ a: 80, b: 40, c: 60 });

    expect(grid.style.height).toBe('80px');
  });

  it('takes items out of flow only once they are positioned', () => {
    fixture.detectChanges();
    harness.flushFrames();

    // Registered but never measured: still in the multi-column fallback.
    expect(items()[0]!.style.position).toBe('');
    expect(grid.classList.contains('masonry-grid--fallback')).toBe(true);

    measureAndFlush();

    expect(items()[0]!.style.position).toBe('absolute');
    expect(grid.classList.contains('masonry-grid--fallback')).toBe(false);
  });

  it('exposes the resolved geometry as signals', () => {
    settle({ a: 80, b: 40, c: 60 });
    const instance = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;

    expect(instance.ready()).toBe(true);
    expect(instance.columns()).toBe(3);
    expect(instance.columnWidth()).toBe(100);
    expect(instance.contentHeight()).toBe(80);
    expect(instance.itemCount()).toBe(3);
  });

  it('emits layoutComplete with the pass summary', () => {
    settle({ a: 80, b: 40, c: 60 });

    const last = host.events.at(-1)!;
    expect(last).toMatchObject({ columns: 3, columnWidth: 100, itemCount: 3, height: 80 });
    expect(last.pass).toBeGreaterThan(0);
  });

  describe('item order', () => {
    it('follows the DOM, not registration order, when items are prepended', () => {
      settle({ a: 80, b: 40, c: 60 });

      host.items.update((current) => ['z', ...current]);
      settle({ z: 10, a: 80, b: 40, c: 60 });

      // The new item takes the first slot; everything else shifts along.
      expect(positionOf('z')).toEqual([0, 0]);
      expect(positionOf('a')).toEqual([110, 0]);
      expect(positionOf('b')).toEqual([220, 0]);
      expect(positionOf('c')).toEqual([0, 20]);
    });

    it('reflows after a removal without any manual reload', () => {
      settle({ a: 80, b: 40, c: 60 });

      host.items.set(['b', 'c']);
      settle({ b: 40, c: 60 });

      expect(positionOf('b')).toEqual([0, 0]);
      expect(positionOf('c')).toEqual([110, 0]);
      expect(grid.style.height).toBe('60px');
    });
  });

  describe('column spans', () => {
    it('widens a spanning item across its columns and gutters', () => {
      host.spans.set({ a: 2 });
      settle();

      expect(items()[0]!.style.width).toBe('210px');
    });

    it('relays out when a span changes', () => {
      settle();
      expect(items()[0]!.style.width).toBe('100px');

      host.spans.set({ a: 2 });
      settle();

      expect(items()[0]!.style.width).toBe('210px');
    });
  });

  describe('stamps', () => {
    it('pushes items past the stamped region', () => {
      host.stamped.set(true);
      settle();
      const stamp = grid.querySelector('aside')!;
      // jsdom reports zero offsets, so state the stamp's box directly.
      Object.defineProperties(stamp, {
        offsetLeft: { value: 0 },
        offsetTop: { value: 0 },
        offsetWidth: { value: 100 },
        offsetHeight: { value: 80 },
      });

      const instance = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
      instance.layout();

      expect(positionOf('a')).toEqual([110, 0]);
    });
  });

  describe('options', () => {
    it('applies a changed gutter', () => {
      settle();
      expect(items()[0]!.style.width).toBe('100px');

      host.options.set({ columns: 3, gutter: 20, entryAnimation: false });
      settle();

      // 320 minus two 20px gutters, split three ways.
      expect(items()[0]!.style.width).toBe(`${(320 - 40) / 3}px`);
    });

    it('relays out on an option change that alters no measurement', () => {
      settle();
      expect(positionOf('a')).toEqual([0, 0]);

      // `direction` changes nothing about any element's size, so no
      // ResizeObserver callback will arrive to prompt a pass. Changing the
      // option alone has to be enough.
      host.options.set({ columns: 3, gutter: 10, direction: 'rtl', entryAnimation: false });
      fixture.detectChanges();
      harness.flushFrames();

      expect(positionOf('a')).toEqual([220, 0]);
    });

    it('lays out right to left', () => {
      host.options.set({ columns: 3, gutter: 10, direction: 'rtl', entryAnimation: false });
      settle();

      expect(positionOf('a')).toEqual([220, 0]);
      expect(positionOf('c')).toEqual([0, 0]);
    });

    it('ignores an inline literal that is structurally unchanged', () => {
      settle();
      const passes = host.events.length;

      host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
      settle();

      expect(host.events.length).toBe(passes);
    });
  });

  it('skips the solve when nothing has changed', () => {
    settle({ a: 80, b: 40, c: 60 });
    const passes = host.events.length;

    // Re-report identical sizes: the signature is unchanged, so no pass runs.
    measureAndFlush({ a: 80, b: 40, c: 60 });

    expect(host.events.length).toBe(passes);
  });

  it('re-anchors an RTL grid when only the container width changes', () => {
    // A fixed `columnWidth` with no stretching makes the resolved geometry
    // independent of the container width: both widths below yield 3 columns of
    // 100px. RTL positions are anchored to the right edge, though, so the items
    // still have to move — a dirty check keyed on geometry alone would skip it.
    host.options.set({
      columnWidth: 100,
      stretchColumns: false,
      gutter: 10,
      direction: 'rtl',
      entryAnimation: false,
    });
    settle({ a: 80, b: 40, c: 60 });

    const instance = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
    expect(instance.columns()).toBe(3);
    expect(instance.columnWidth()).toBe(100);
    expect(positionOf('a')[0]).toBe(220);

    resizeContainerTo(CONTAINER_WIDTH + 20, { a: 80, b: 40, c: 60 });

    // Geometry is untouched; only the right edge moved.
    expect(instance.columns()).toBe(3);
    expect(instance.columnWidth()).toBe(100);
    expect(positionOf('a')[0]).toBe(240);
  });

  it('refreshes contain-intrinsic-size when an item height changes', () => {
    host.options.set({ columns: 3, gutter: 10, entryAnimation: false, contentVisibility: true });
    settle({ a: 80, b: 40, c: 60 });

    const first = items()[0]!;
    expect(first.style.contentVisibility).toBe('auto');
    expect(first.style.containIntrinsicSize).toBe('100px 80px');

    // The item grows without its width changing — the common case for content
    // that expands after layout.
    measureAndFlush({ a: 300, b: 40, c: 60 });
    fixture.detectChanges();
    harness.flushFrames();

    expect(first.style.containIntrinsicSize).toBe('100px 300px');
  });

  it('clears content-visibility styling when the option is turned off', () => {
    host.options.set({ columns: 3, gutter: 10, entryAnimation: false, contentVisibility: true });
    settle({ a: 80, b: 40, c: 60 });
    expect(items()[0]!.style.containIntrinsicSize).toBe('100px 80px');

    host.options.set({ columns: 3, gutter: 10, entryAnimation: false, contentVisibility: false });
    settle({ a: 80, b: 40, c: 60 });

    expect(items()[0]!.style.containIntrinsicSize).toBe('');
    expect(items()[0]!.style.contentVisibility).toBe('');
  });

  describe('removal', () => {
    function gridInstance(): MasonryGrid {
      return fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
    }

    it('animates a stand-in clone out and reports when it finishes', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
      settle({ a: 80, b: 40, c: 60 });

      host.items.set(['a', 'b']);
      fixture.detectChanges();
      harness.flushFrames();

      // The real element is gone, but a clone stands in at its last position.
      const clone = grid.querySelector('.masonry-item--leaving');
      expect(clone).not.toBeNull();
      expect(clone!.getAttribute('aria-hidden')).toBe('true');
      expect(host.removals).toHaveLength(0);

      harness.finishAnimations();

      expect(grid.querySelector('.masonry-item--leaving')).toBeNull();
      expect(host.removals).toEqual([{ removed: 1 }]);
    });

    it('reports a batch of removals once, not once per item', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
      settle({ a: 80, b: 40, c: 60 });

      host.items.set(['a']);
      fixture.detectChanges();
      harness.flushFrames();
      expect(grid.querySelectorAll('.masonry-item--leaving')).toHaveLength(2);

      harness.finishAnimations();

      expect(host.removals).toEqual([{ removed: 2 }]);
    });

    it('reports removals immediately when the exit effect is disabled', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false, exitAnimation: false });
      settle({ a: 80, b: 40, c: 60 });

      host.items.set(['a', 'b']);
      fixture.detectChanges();
      harness.flushFrames();
      measureAndFlush({ a: 80, b: 40 });

      expect(grid.querySelector('.masonry-item--leaving')).toBeNull();
      expect(host.removals).toEqual([{ removed: 1 }]);
    });

    it('leaves no clone behind when the grid is destroyed mid-exit', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
      settle({ a: 80, b: 40, c: 60 });
      host.items.set(['a', 'b']);
      fixture.detectChanges();
      harness.flushFrames();
      expect(grid.querySelector('.masonry-item--leaving')).not.toBeNull();

      fixture.destroy();

      expect(grid.querySelector('.masonry-item--leaving')).toBeNull();
      expect(host.removals).toHaveLength(0);
    });

    it('emits itemsLoaded once the last awaited item settles', () => {
      settle({ a: 80, b: 40, c: 60 });
      const instance = gridInstance();

      instance.noteImagesPending();
      instance.noteImagesPending();
      instance.noteImagesSettled();
      expect(host.loaded).toEqual([]);

      instance.noteImagesSettled();
      expect(host.loaded).toEqual([3]);
    });
  });

  describe('verticalOrigin', () => {
    it('stacks items up from the bottom edge', () => {
      host.options.set({
        columns: 1,
        gutter: 10,
        entryAnimation: false,
        verticalOrigin: 'bottom',
      });
      host.items.set(['a', 'b']);
      settle({ a: 80, b: 40 });

      // Content is 130 tall; 'a' sits at 130-80, 'b' at 130-90-40.
      expect(grid.style.height).toBe('130px');
      expect(positionOf('a')).toEqual([0, 50]);
      expect(positionOf('b')).toEqual([0, 0]);
    });

    it('warns when combined with a stamp, which it cannot support', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      host.options.set({
        columns: 3,
        gutter: 10,
        entryAnimation: false,
        verticalOrigin: 'bottom',
      });
      host.stamped.set(true);
      settle({ a: 80, b: 40, c: 60 });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('does not support stamps'));
      warn.mockRestore();
    });

    it('re-lays out when the origin flips', () => {
      host.options.set({ columns: 1, gutter: 10, entryAnimation: false });
      host.items.set(['a', 'b']);
      settle({ a: 80, b: 40 });
      expect(positionOf('a')).toEqual([0, 0]);

      host.options.set({
        columns: 1,
        gutter: 10,
        entryAnimation: false,
        verticalOrigin: 'bottom',
      });
      settle({ a: 80, b: 40 });

      expect(positionOf('a')).toEqual([0, 50]);
    });
  });

  it('rewrites item widths when a column span changes', () => {
    host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
    settle({ a: 80, b: 40, c: 60 });
    expect(items()[0]!.style.width).toBe('100px');

    // Widths are skipped on an unchanged pass, so the span change has to be
    // what marks them dirty again.
    host.spans.set({ a: 2 });
    settle({ a: 80, b: 40, c: 60 });

    expect(items()[0]!.style.width).toBe('210px');
  });

  describe('masonryIgnore', () => {
    it('drops an ignored item out of the layout and back into flow', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
      settle({ a: 80, b: 40, c: 60 });
      expect(items()[1]!.style.position).toBe('absolute');

      host.ignored.set(['b']);
      settle({ a: 80, b: 40, c: 60 });

      const b = items()[1]!;
      expect(b.style.position).toBe('');
      expect(b.style.width).toBe('');
      expect(b.style.transform).toBe('');
      // The remaining items close ranks.
      expect(host.events.at(-1)!.itemCount).toBe(2);
    });

    it('restores an item when it stops being ignored', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
      host.ignored.set(['b']);
      settle({ a: 80, b: 40, c: 60 });
      expect(items()[1]!.style.position).toBe('');

      host.ignored.set([]);
      settle({ a: 80, b: 40, c: 60 });

      expect(items()[1]!.style.position).toBe('absolute');
      expect(host.events.at(-1)!.itemCount).toBe(3);
    });
  });

  describe('masonryGridSizer', () => {
    /** Report sizes including a width for the sizer element. */
    function settleWithSizer(sizerWidth: number): void {
      fixture.detectChanges();
      harness.flushFrames();
      const sizes = new Map<Element, { width: number; height: number }>();
      sizes.set(grid.parentElement!, { width: CONTAINER_WIDTH, height: 0 });
      sizes.set(grid, { width: CONTAINER_WIDTH, height: 0 });
      const sizer = grid.querySelector('[data-sizer]');
      if (sizer) sizes.set(sizer, { width: sizerWidth, height: 0 });
      for (const element of items()) sizes.set(element, { width: 100, height: 50 });
      harness.measure(sizes);
      harness.flushFrames();
      fixture.detectChanges();
      harness.flushFrames();
    }

    it('derives the column width from the sizer element', () => {
      host.options.set({ gutter: 10, entryAnimation: false });
      host.sized.set(true);
      settleWithSizer(150);

      const instance = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
      // 320 wide, 150 + 10 track => 2 columns of exactly 150 (never stretched).
      expect(instance.columnWidth()).toBe(150);
      expect(instance.columns()).toBe(2);
    });

    it('follows the sizer when its width changes', () => {
      host.options.set({ gutter: 10, entryAnimation: false });
      host.sized.set(true);
      settleWithSizer(150);
      const instance = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
      expect(instance.columns()).toBe(2);

      settleWithSizer(100);

      expect(instance.columnWidth()).toBe(100);
      expect(instance.columns()).toBe(3);
    });

    it('warns when it contradicts an explicit column option', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false });
      host.sized.set(true);
      settleWithSizer(150);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('takes precedence'));
      warn.mockRestore();
    });
  });

  describe('escape hatches', () => {
    it('autoLayout:false holds the first pass until layout() is called', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false, autoLayout: false });
      settle({ a: 80, b: 40, c: 60 });

      expect(host.events).toHaveLength(0);
      expect(grid.classList.contains('masonry-grid--fallback')).toBe(true);

      (fixture.debugElement.children[0]!.componentInstance as MasonryGrid).layout();

      expect(host.events.length).toBeGreaterThan(0);
      expect(positionOf('a')).toEqual([0, 0]);
    });

    it('resizeContainer:false leaves the host height alone', () => {
      host.options.set({ columns: 3, gutter: 10, entryAnimation: false, resizeContainer: false });
      settle({ a: 80, b: 40, c: 60 });

      expect(grid.style.height).toBe('');
      // Items are still positioned; only the container height is left to CSS.
      expect(positionOf('a')).toEqual([0, 0]);
    });

    it('observeResize:false pins the layout to the first measured width', () => {
      host.options.set({ columns: 2, gutter: 10, entryAnimation: false, observeResize: false });
      settle({ a: 80, b: 40, c: 60 });
      const instance = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
      const width = instance.columnWidth();

      resizeContainerTo(CONTAINER_WIDTH * 2, { a: 80, b: 40, c: 60 });

      expect(instance.columnWidth()).toBe(width);
    });
  });

  it('exposes registered item elements in DOM order', () => {
    settle({ a: 80, b: 40, c: 60 });
    const instance = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;

    expect(instance.items().map((el) => el.getAttribute('data-id'))).toEqual(['a', 'b', 'c']);
  });

  it('stops observing and scheduling once destroyed', () => {
    settle();
    fixture.destroy();

    expect(() => harness.flushFrames()).not.toThrow();
    expect(harness.pendingFrames).toBe(0);
  });
});

describe('provideNgMasonryGrid', () => {
  it('rejects invalid application defaults at bootstrap', () => {
    expect(() => provideNgMasonryGrid({ columns: 3, columnWidth: 200 })).toThrow(/not both/);
  });
});
