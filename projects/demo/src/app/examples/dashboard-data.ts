/** Static tile definitions for the dashboard example. */

export type WidgetKind = 'kpi' | 'bars' | 'list';

export interface Widget {
  readonly id: number;
  readonly title: string;
  /** Width in whole columns. The grid clamps this to the current column count. */
  readonly span: number;
  /** Height in CSS pixels. Fixed by the author; the grid never writes a height. */
  readonly height: number;
  readonly kind: WidgetKind;
  readonly hue: number;
  readonly value?: string;
  readonly delta?: number;
  readonly series?: readonly number[];
  readonly rows?: readonly (readonly [string, string])[];
}

function kpi(id: number, title: string, hue: number, value: string, delta: number): Widget {
  return { id, title, span: 1, height: 132, kind: 'kpi', hue, value, delta };
}

function bars(
  id: number,
  title: string,
  hue: number,
  span: number,
  height: number,
  series: readonly number[],
): Widget {
  return { id, title, span, height, kind: 'bars', hue, series };
}

/**
 * A list tile's height follows from its rows rather than being chosen.
 *
 * `.widget ul` uses `flex: 1`, so a list stretches to whatever height the
 * author set — pick a number too large and the rows bunch at the top with dead
 * space under them, which is what used to happen here. Measured against the
 * rendered tile: 14px padding top and bottom, a 20px header, an 8px gap below
 * it, and rows on a 28px pitch whose last gap is not drawn.
 */
function listHeight(rows: number): number {
  return 48 + 28 * rows;
}

function list(
  id: number,
  title: string,
  hue: number,
  span: number,
  rows: readonly (readonly [string, string])[],
): Widget {
  return { id, title, span, height: listHeight(rows.length), kind: 'list', hue, rows };
}

/**
 * Twenty tiles, every one a fixed size. Deliberately more than fits on a
 * screen, so the deferred ones below the fold stay unrendered until you scroll.
 *
 * Both the order and the mix of widths are deliberate. A tile spanning two
 * columns cannot start until both are free, so one arriving while the columns
 * are uneven leaves a hole under the shorter one — this board used to open with
 * a 296px void under the second KPI. And with more wide tiles than narrow ones,
 * the third column can never keep up, so it finished hundreds of pixels short
 * of its neighbours.
 *
 * Eight wide tiles to twelve narrow ones, emitted so the wide ones land while
 * the columns are level, gives a board with no interior holes and a bottom edge
 * that finishes together. Checked by simulating the packing at one to five
 * columns, then measuring the rendered board in a browser.
 */
export const WIDGETS: readonly Widget[] = [
  // The headline numbers first, as a dashboard would open.
  kpi(1, 'Revenue', 262, '$48.2k', 12.4),
  kpi(2, 'Conversion', 152, '3.84%', 0.6),
  kpi(3, 'Error rate', 8, '0.42%', -1.8),
  kpi(4, 'Churn', 38, '1.9%', -0.4),

  bars(5, 'Sessions', 199, 2, 248, [42, 58, 51, 74, 66, 88, 79, 95, 71, 84, 92, 68]),
  kpi(6, 'Open alerts', 348, '3', -2),
  list(7, 'Recent deploys', 250, 1, [
    ['api · v2.14.0', '12m ago'],
    ['web · v3.2.1', '48m ago'],
    ['worker · v1.8.7', '3h ago'],
    ['api · v2.13.9', '9h ago'],
  ]),
  bars(8, 'Cache hit rate', 142, 1, 184, [88, 91, 86, 94, 92, 89, 95]),
  kpi(9, 'Active users', 208, '18.6k', 4.2),
  bars(10, 'Signups', 168, 2, 200, [14, 22, 18, 31, 27, 35, 29, 41, 38, 46]),
  kpi(11, 'Support backlog', 300, '27', 8.5),
  kpi(12, 'Uptime', 118, '99.98%', 0.01),
  list(13, 'Top pages', 46, 2, [
    ['/pricing', '12.4k'],
    ['/docs/quick-start', '9.8k'],
    ['/blog/masonry', '7.1k'],
    ['/changelog', '4.6k'],
    ['/docs/options', '3.9k'],
    ['/support', '2.2k'],
    ['/about', '1.7k'],
  ]),
  bars(14, 'Latency p95', 291, 2, 176, [120, 138, 129, 154, 141, 133, 148, 162, 151, 139]),
  bars(15, 'Build minutes', 84, 2, 224, [180, 156, 204, 168, 232, 196, 148, 176, 212]),
  bars(16, 'Queue depth', 218, 1, 208, [12, 19, 8, 26, 31, 17, 22, 14]),
  list(17, 'Traffic sources', 24, 1, [
    ['Organic search', '41%'],
    ['Direct', '23%'],
    ['Referral', '16%'],
    ['Social', '11%'],
    ['Email', '6%'],
    ['Paid', '3%'],
  ]),
  list(18, 'Slowest endpoints', 12, 2, [
    ['POST /import', '1.9s'],
    ['GET /reports', '1.2s'],
    ['GET /search', '840ms'],
    ['POST /export', '760ms'],
    ['GET /feed', '410ms'],
  ]),
  bars(19, 'Deploys this week', 176, 1, 152, [3, 5, 2, 8, 6, 1, 4]),
  list(20, 'Storage', 330, 1, [
    ['Postgres', '412 GB'],
    ['Object store', '2.8 TB'],
    ['Backups', '1.1 TB'],
  ]),
];
