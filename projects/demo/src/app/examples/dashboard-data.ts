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

function list(
  id: number,
  title: string,
  hue: number,
  span: number,
  height: number,
  rows: readonly (readonly [string, string])[],
): Widget {
  return { id, title, span, height, kind: 'list', hue, rows };
}

/**
 * Twenty tiles, every one a fixed size. Deliberately more than fits on a screen,
 * so the deferred ones below the fold stay unrendered until you scroll.
 */
export const WIDGETS: readonly Widget[] = [
  kpi(1, 'Revenue', 262, '$48.2k', 12.4),
  bars(2, 'Sessions', 199, 2, 248, [42, 58, 51, 74, 66, 88, 79, 95, 71, 84, 92, 68]),
  kpi(3, 'Conversion', 152, '3.84%', 0.6),
  list(4, 'Traffic sources', 24, 1, 296, [
    ['Organic search', '41%'],
    ['Direct', '23%'],
    ['Referral', '16%'],
    ['Social', '11%'],
    ['Email', '6%'],
    ['Paid', '3%'],
  ]),
  bars(5, 'Latency p95', 291, 2, 176, [120, 138, 129, 154, 141, 133, 148, 162, 151, 139]),
  kpi(6, 'Error rate', 8, '0.42%', -1.8),
  bars(7, 'Deploys this week', 176, 3, 152, [3, 5, 2, 8, 6, 1, 4]),
  list(8, 'Top pages', 46, 2, 312, [
    ['/pricing', '12.4k'],
    ['/docs/quick-start', '9.8k'],
    ['/blog/masonry', '7.1k'],
    ['/changelog', '4.6k'],
    ['/docs/options', '3.9k'],
    ['/support', '2.2k'],
    ['/about', '1.7k'],
  ]),
  kpi(9, 'Uptime', 118, '99.98%', 0.01),
  bars(10, 'Queue depth', 218, 1, 208, [12, 19, 8, 26, 31, 17, 22, 14]),
  list(11, 'Storage', 330, 2, 192, [
    ['Postgres', '412 GB'],
    ['Object store', '2.8 TB'],
    ['Backups', '1.1 TB'],
  ]),
  kpi(12, 'Open alerts', 348, '3', -2),
  bars(13, 'Build minutes', 84, 2, 224, [180, 156, 204, 168, 232, 196, 148, 176, 212]),
  kpi(14, 'Active users', 208, '18.6k', 4.2),
  list(15, 'Slowest endpoints', 12, 2, 264, [
    ['POST /import', '1.9s'],
    ['GET /reports', '1.2s'],
    ['GET /search', '840ms'],
    ['POST /export', '760ms'],
    ['GET /feed', '410ms'],
  ]),
  kpi(16, 'Churn', 38, '1.9%', -0.4),
  bars(17, 'Cache hit rate', 142, 1, 184, [88, 91, 86, 94, 92, 89, 95]),
  list(18, 'Recent deploys', 250, 3, 208, [
    ['api · v2.14.0', '12m ago'],
    ['web · v3.2.1', '48m ago'],
    ['worker · v1.8.7', '3h ago'],
    ['api · v2.13.9', '9h ago'],
  ]),
  kpi(19, 'Support backlog', 300, '27', 8.5),
  bars(20, 'Signups', 168, 2, 200, [14, 22, 18, 31, 27, 35, 29, 41, 38, 46]),
];
