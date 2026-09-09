/**
 * The shorthand inputs — `columns`, `columnWidth`, `gutter`, `gutterX`,
 * `gutterY` — and how they layer with `[options]` and application defaults.
 *
 * These exist so the common case is a plain HTML attribute rather than an
 * object literal, which is the single biggest difference between using this
 * library and using every other masonry wrapper on npm. They are covered
 * separately from the layout suite because what matters here is the *merge*,
 * not the geometry it eventually produces.
 */
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MasonryGrid } from './masonry-grid';
import { MasonryGridItem } from './directives/masonry-grid-item';
import { provideNgMasonryGrid } from './providers';
import type { MasonryGridOptions } from './models';
import { GridTestHarness } from '../../testing/src/harness';

@Component({
  selector: 'shorthand-host',
  imports: [MasonryGrid, MasonryGridItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <masonry-grid
      [columns]="columns()"
      [columnWidth]="columnWidth()"
      [gutter]="gutter()"
      [gutterX]="gutterX()"
      [gutterY]="gutterY()"
      [options]="options()"
    >
      <div masonryGridItem>a</div>
    </masonry-grid>
  `,
})
class ShorthandHost {
  readonly columns = signal<number | Record<string, number> | undefined>(undefined);
  readonly columnWidth = signal<number | undefined>(undefined);
  readonly gutter = signal<number | undefined>(undefined);
  readonly gutterX = signal<number | undefined>(undefined);
  readonly gutterY = signal<number | undefined>(undefined);
  readonly options = signal<MasonryGridOptions | undefined>(undefined);
}

/** A grid configured entirely by static attributes — no bindings at all. */
@Component({
  selector: 'attribute-host',
  imports: [MasonryGrid, MasonryGridItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <masonry-grid columns="4" gutter="24"><div masonryGridItem>a</div></masonry-grid> `,
})
class AttributeHost {}

describe('shorthand inputs', () => {
  let harness: GridTestHarness;

  beforeEach(() => {
    harness = new GridTestHarness();
    harness.install();
  });

  afterEach(() => harness.uninstall());

  function build(): { host: ShorthandHost; read: () => MasonryGrid } {
    const fixture = TestBed.createComponent(ShorthandHost);
    const read = () => fixture.debugElement.children[0]!.componentInstance as MasonryGrid;
    return { host: fixture.componentInstance, read: () => (fixture.detectChanges(), read()) };
  }

  it('reads a plain attribute with no binding at all', () => {
    const fixture = TestBed.createComponent(AttributeHost);
    fixture.detectChanges();
    const grid = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;

    expect(grid.options().columns).toBe(4);
    expect(grid.options().gutterX).toBe(24);
    expect(grid.options().gutterY).toBe(24);
  });

  it('accepts a number, a numeric string and a breakpoint map for columns', () => {
    const { host, read } = build();

    host.columns.set(3);
    expect(read().options().columns).toBe(3);

    host.columns.set('5' as unknown as number);
    expect(read().options().columns).toBe(5);

    host.columns.set({ 0: 1, 768: 4 });
    expect(read().options().columns).toEqual({ 0: 1, 768: 4 });
  });

  it('spreads gutter across both axes, and lets each axis override it', () => {
    const { host, read } = build();

    host.gutter.set(12);
    expect(read().options().gutterX).toBe(12);
    expect(read().options().gutterY).toBe(12);

    host.gutterY.set(4);
    expect(read().options().gutterX).toBe(12);
    expect(read().options().gutterY).toBe(4);
  });

  it('treats an unset shorthand as absent rather than as zero', () => {
    const { read } = build();
    // Every shorthand is undefined here, so the defaults have to survive intact.
    expect(read().options().gutterX).toBe(16);
    expect(read().options().columns).toBeUndefined();
  });

  it('lets a shorthand win over the same field in [options]', () => {
    const { host, read } = build();

    host.options.set({ columns: 2, gutter: 8 });
    expect(read().options().columns).toBe(2);
    expect(read().options().gutterX).toBe(8);

    host.columns.set(6);
    expect(read().options().columns).toBe(6);
    // The rest of `[options]` is untouched by the shorthand.
    expect(read().options().gutterX).toBe(8);
  });

  it('keeps unrelated [options] fields when a shorthand changes', () => {
    const { host, read } = build();

    host.options.set({ entryAnimation: false, ssr: { fallback: 'none', columns: 2 } });
    host.gutter.set(30);

    expect(read().options().gutterX).toBe(30);
    expect(read().options().entryAnimation).toBe(false);
    expect(read().options().ssr.fallback).toBe('none');
  });

  it('clears the mutually exclusive sibling instead of failing validation', () => {
    const { host, read } = build();

    host.options.set({ columns: 3 });
    host.columnWidth.set(240);

    // `columns` and `columnWidth` cannot both be set; the shorthand is the later
    // source, so it replaces rather than collides.
    expect(read().options().columnWidth).toBe(240);
    expect(read().options().columns).toBeUndefined();
  });

  it('layers over application-wide defaults', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideNgMasonryGrid({ gutter: 40, columns: 2 })],
    });

    const fixture = TestBed.createComponent(ShorthandHost);
    fixture.componentInstance.columns.set(5);
    fixture.detectChanges();
    const grid = fixture.debugElement.children[0]!.componentInstance as MasonryGrid;

    expect(grid.options().columns).toBe(5);
    // Not restated by the shorthand, so the application default stands.
    expect(grid.options().gutterX).toBe(40);
  });

  it('keeps the resolved options reference stable when nothing changed', () => {
    const { host, read } = build();
    host.options.set({ gutter: 16 });

    const first = read().options();
    // A fresh literal with identical contents, as an inline `[options]="{...}"`
    // binding produces on every change detection run.
    host.options.set({ gutter: 16 });

    expect(read().options()).toBe(first);
  });
});
