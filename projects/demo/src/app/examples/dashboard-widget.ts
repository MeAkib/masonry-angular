import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { Widget } from './dashboard-data';

/**
 * The body of a dashboard tile.
 *
 * It lives in its own component because the dashboard references it *only*
 * inside an `@defer` block. That is what lets the compiler move it into a
 * lazily-loaded chunk: a `@defer` block whose contents use nothing but plain
 * markup defers rendering, but ships in the initial bundle regardless.
 */
@Component({
  selector: 'dashboard-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'widget-body' },
  template: `
    @switch (widget().kind) {
      @case ('kpi') {
        <div class="kpi">
          <b>{{ widget().value }}</b>
          <span class="delta" [class.down]="(widget().delta ?? 0) < 0">
            {{ (widget().delta ?? 0) < 0 ? '▾' : '▴' }} {{ abs(widget().delta ?? 0) }}%
            <small>vs last week</small>
          </span>
        </div>
      }
      @case ('bars') {
        <div class="bars">
          @for (value of widget().series ?? []; track $index) {
            <i [style.height.%]="scale(value, widget().series ?? [])"></i>
          }
        </div>
      }
      @case ('list') {
        <ul>
          @for (row of widget().rows ?? []; track row[0]) {
            <li>
              <span>{{ row[0] }}</span>
              <b>{{ row[1] }}</b>
            </li>
          }
        </ul>
      }
    }
  `,
})
export class DashboardWidget {
  readonly widget = input.required<Widget>();

  abs(value: number): number {
    return Math.abs(value);
  }

  /** Bar height as a percentage of the tallest value in its own series. */
  scale(value: number, series: readonly number[]): number {
    const max = Math.max(...series, 1);
    return Math.max(4, Math.round((value / max) * 100));
  }
}
