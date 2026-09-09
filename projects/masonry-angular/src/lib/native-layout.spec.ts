/**
 * End-to-end behaviour of `native: true`.
 *
 * The point of this suite is what the grid does *not* do: in a browser with
 * `display: grid-lanes` there must be no measuring, no observing, no inline
 * positioning and no hidden items — the browser owns the layout, and the
 * library's job is to get out of the way and stay correct.
 */
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MasonryGrid } from './masonry-grid';
import { MasonryGridItem } from './directives/masonry-grid-item';
import { setNativeMasonrySupportForTesting } from './core/native';
import type { MasonryGridOptions, MasonryLayoutEvent } from './models';
import { GridTestHarness } from '../../testing/src/harness';

@Component({
  selector: 'native-host',
  imports: [MasonryGrid, MasonryGridItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <masonry-grid [options]="options()" (layoutComplete)="events.push($event)">
      @for (item of items(); track item) {
        <div masonryGridItem [masonryColSpan]="spans()[item] ?? 1" [attr.data-id]="item">
          {{ item }}
        </div>
      }
    </masonry-grid>
  `,
})
class NativeHost {
  readonly items = signal<string[]>(['a', 'b', 'c']);
  readonly spans = signal<Record<string, number>>({});
  readonly options = signal<MasonryGridOptions>({ native: true, columns: 3, gutter: 10 });
  readonly events: MasonryLayoutEvent[] = [];
}

describe('native layout', () => {
  let harness: GridTestHarness;
  let fixture: ComponentFixture<NativeHost>;
  let host: NativeHost;
  let grid: HTMLElement;

  function instance(): MasonryGrid {
    return fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
  }

  function items(): HTMLElement[] {
    return [...grid.querySelectorAll<HTMLElement>('[data-id]')];
  }

  function settle(): void {
    fixture.detectChanges();
    harness.flushFrames();
    fixture.detectChanges();
    harness.flushFrames();
  }

  beforeEach(async () => {
    harness = new GridTestHarness();
    harness.install();
    setNativeMasonrySupportForTesting(true);

    await TestBed.configureTestingModule({ imports: [NativeHost] }).compileComponents();
    fixture = TestBed.createComponent(NativeHost);
    host = fixture.componentInstance;
    grid = fixture.nativeElement.querySelector('masonry-grid');
  });

  afterEach(() => {
    setNativeMasonrySupportForTesting(undefined);
    harness.uninstall();
  });

  describe('where the browser supports it', () => {
    it('marks the host so the @supports rule can take over', () => {
      settle();
      expect(grid.classList.contains('masonry-grid--native')).toBe(true);
      expect(grid.style.getPropertyValue('--masonry-native-columns')).toBe('repeat(3, 1fr)');
    });

    it('publishes the gutters as custom properties for the native gaps', () => {
      settle();
      expect(grid.style.getPropertyValue('--masonry-gutter-x')).toBe('10px');
      expect(grid.style.getPropertyValue('--masonry-gutter-y')).toBe('10px');
    });

    it('never positions an item', () => {
      settle();
      for (const item of items()) {
        expect(item.style.transform).toBe('');
        expect(item.style.position).toBe('');
        expect(item.style.top).toBe('');
      }
    });

    it('never hides an item, even with ssr.fallback set to none', () => {
      host.options.set({ native: true, columns: 3, ssr: { fallback: 'none', columns: 2 } });
      settle();
      for (const item of items()) {
        expect(item.style.visibility).toBe('');
      }
    });

    it('observes nothing for a fixed column count', () => {
      settle();
      // No ResizeObserver at all: not on the container, and not on any item.
      expect(harness.observedElements()).toEqual([]);
    });

    it('observes only the container for a breakpoint map, never the items', () => {
      host.options.set({ native: true, columns: { 0: 1, 768: 3 } });
      settle();

      const observed = harness.observedElements();
      expect(observed).toEqual([grid]);
      for (const item of items()) expect(observed).not.toContain(item);
    });

    it('leaves the multi-column fallback once the first pass runs', () => {
      settle();
      expect(grid.classList.contains('masonry-grid--fallback')).toBe(false);
      expect(instance().ready()).toBe(true);
    });

    it('writes a column span onto the item for the browser to read', () => {
      host.spans.set({ b: 2 });
      settle();

      const [a, b] = items();
      expect(b!.style.gridColumn).toBe('span 2');
      expect(a!.style.gridColumn).toBe('');
    });

    it('reports the item count and pass number without measuring anything', () => {
      settle();
      const state = instance().state();
      expect(state.itemCount).toBe(3);
      expect(state.columns).toBe(3);
      // The browser owns the track sizes and never reports them back.
      expect(state.columnWidth).toBe(0);
      expect(state.pass).toBeGreaterThan(0);
    });

    it('tracks items added and removed later', () => {
      settle();
      host.items.set(['a', 'b', 'c', 'd', 'e']);
      settle();
      expect(instance().state().itemCount).toBe(5);

      host.items.set(['a']);
      settle();
      expect(instance().state().itemCount).toBe(1);
    });

    it('emits layoutComplete so applications can react the same way either side', () => {
      settle();
      expect(host.events.length).toBeGreaterThan(0);
      expect(host.events.at(-1)!.itemCount).toBe(3);
    });

    it('turns a columnWidth grid into a single auto-fill declaration', () => {
      host.options.set({ native: true, columnWidth: 240 });
      settle();
      expect(grid.style.getPropertyValue('--masonry-native-columns')).toBe(
        'repeat(auto-fill, minmax(min(100%, 240px), 1fr))',
      );
      expect(harness.observedElements()).toEqual([]);
    });

    it('warns about options the browser cannot honour', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      host.options.set({ native: true, columns: 3, fitWidth: true, horizontalOrder: true });
      settle();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('`fitWidth`'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('`horizontalOrder`'));
      warn.mockRestore();
    });
  });

  describe('where the browser does not support it', () => {
    beforeEach(() => setNativeMasonrySupportForTesting(false));

    it('falls back to the JavaScript engine and positions items itself', () => {
      fixture.detectChanges();
      harness.flushFrames();

      const sizes = new Map<Element, { width: number; height: number }>();
      sizes.set(grid.parentElement!, { width: 320, height: 0 });
      sizes.set(grid, { width: 320, height: 0 });
      for (const item of items()) sizes.set(item, { width: 100, height: 50 });
      harness.measure(sizes);
      harness.flushFrames();
      fixture.detectChanges();
      harness.flushFrames();

      expect(instance().nativeActive()).toBe(false);
      expect(items()[0]!.style.transform).toContain('translate(');
      expect(items()[0]!.style.position).toBe('absolute');
    });

    it('still marks the host, so the @supports rule stays the only switch', () => {
      settle();
      // The class is unconditional: whether it does anything is the browser's
      // decision, made in CSS, not ours.
      expect(grid.classList.contains('masonry-grid--native')).toBe(true);
    });
  });
});
