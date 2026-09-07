import type {
  MasonryEntryAnimation,
  MasonryExitAnimation,
  MasonryGridOptions,
  MasonryOptionIssue,
  ResolvedMasonryGridOptions,
} from '../models/options';
import { DEFAULT_MASONRY_GRID_OPTIONS } from './defaults';

export { DEFAULT_MASONRY_GRID_OPTIONS } from './defaults';

/**
 * `ngDevMode` is replaced with `false` by production builds, so every block
 * guarded by this expression — and every function only reachable from one — is
 * dropped by the bundler. That is what lets the checks below be as thorough as
 * they like without costing an application a single byte in production.
 *
 * The `typeof` arm keeps the checks live outside an Angular build (unit tests,
 * a plain Node import), where the symbol is simply not declared.
 */
declare const ngDevMode: boolean | undefined;

/** Thrown in development when `[options]` fails validation. */
export class MasonryGridOptionsError extends Error {
  constructor(
    message: string,
    readonly issues: readonly MasonryOptionIssue[],
  ) {
    super(message);
    this.name = 'MasonryGridOptionsError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fill every unset field from the defaults.
 *
 * This runs in production, so it stays deliberately dumb: no validation, no
 * error paths, just a merge. Nested groups are spread over their defaults so a
 * partial `{ ssr: { columns: 3 } }` keeps the default `fallback`.
 */
function resolve(input: MasonryGridOptions): ResolvedMasonryGridOptions {
  const d = DEFAULT_MASONRY_GRID_OPTIONS;
  const gutter = input.gutter ?? d.gutter;
  const entry = input.entryAnimation;
  const exit = input.exitAnimation;

  return {
    columns: input.columns,
    columnWidth: input.columnWidth,
    stretchColumns: input.stretchColumns ?? d.stretchColumns,
    minColumns: input.minColumns ?? d.minColumns,
    maxColumns: input.maxColumns,

    // Collapse the gutter shorthand once, so nothing downstream has to.
    gutter,
    gutterX: input.gutterX ?? gutter,
    gutterY: input.gutterY ?? gutter,

    horizontalOrder: input.horizontalOrder ?? d.horizontalOrder,
    direction: input.direction ?? d.direction,
    verticalOrigin: input.verticalOrigin ?? d.verticalOrigin,
    fitWidth: input.fitWidth ?? d.fitWidth,
    breakpointBasis: input.breakpointBasis ?? d.breakpointBasis,

    transition: { ...d.transition, ...input.transition },
    entryAnimation:
      entry === false ? false : { ...(d.entryAnimation as MasonryEntryAnimation), ...entry },
    exitAnimation:
      exit === false ? false : { ...(d.exitAnimation as MasonryExitAnimation), ...exit },

    autoLayout: input.autoLayout ?? d.autoLayout,
    observeResize: input.observeResize ?? d.observeResize,
    resizeContainer: input.resizeContainer ?? d.resizeContainer,
    awaitImages: input.awaitImages ?? d.awaitImages,
    resizeDebounce: input.resizeDebounce ?? d.resizeDebounce,
    contentVisibility: input.contentVisibility ?? d.contentVisibility,

    ssr: { ...d.ssr, ...input.ssr },
  };
}

// -----------------------------------------------------------------------------
// Development-only validation
//
// Everything below exists to turn a programmer's mistake into a precise message
// on first render. None of it survives a production build.
// -----------------------------------------------------------------------------

class IssueCollector {
  readonly issues: MasonryOptionIssue[] = [];

  add(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  /** Assert a finite number, optionally an integer, within `[min, max]`. */
  number(
    path: string,
    value: unknown,
    { min, max, integer }: { min?: number; max?: number; integer?: boolean } = {},
  ): void {
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.add(path, `Expected a number, received ${describe(value)}.`);
      return;
    }
    if (integer && !Number.isInteger(value)) {
      this.add(path, `Expected a whole number, received ${value}.`);
      return;
    }
    if (min !== undefined && value < min) {
      this.add(path, `Expected a number >= ${min}, received ${value}.`);
    }
    if (max !== undefined && value > max) {
      this.add(path, `Expected a number <= ${max}, received ${value}.`);
    }
  }

  boolean(path: string, value: unknown): void {
    if (value === undefined) return;
    if (typeof value !== 'boolean') {
      this.add(path, `Expected true or false, received ${describe(value)}.`);
    }
  }

  string(path: string, value: unknown): void {
    if (value === undefined) return;
    if (typeof value !== 'string' || value.length === 0) {
      this.add(path, `Expected a non-empty string, received ${describe(value)}.`);
    }
  }

  enum(path: string, value: unknown, allowed: readonly string[]): void {
    if (value === undefined) return;
    if (typeof value !== 'string' || !allowed.includes(value)) {
      this.add(
        path,
        `Expected one of ${allowed.map((option) => `'${option}'`).join(' | ')}, received ${describe(value)}.`,
      );
    }
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'object') return Array.isArray(value) ? 'an array' : 'an object';
  return String(value);
}

function validateColumns(collector: IssueCollector, columns: unknown): void {
  if (columns === undefined) return;

  if (typeof columns === 'number') {
    collector.number('columns', columns, { min: 1, integer: true });
    return;
  }

  if (!isPlainObject(columns)) {
    collector.add(
      'columns',
      `Expected a column count or a breakpoint map, received ${describe(columns)}.`,
    );
    return;
  }

  const keys = Object.keys(columns);
  if (keys.length === 0) {
    collector.add('columns', 'Provide at least one breakpoint, e.g. `{ 0: 1, 768: 2 }`.');
    return;
  }

  for (const key of keys) {
    const width = Number(key);
    if (!Number.isInteger(width) || width < 0) {
      collector.add(
        `columns.${key}`,
        `Breakpoint keys are minimum widths in px, so they must be whole non-negative numbers; received '${key}'.`,
      );
    }
    collector.number(`columns.${key}`, columns[key], { min: 1, integer: true });
  }
}

function validateAnimation(
  collector: IssueCollector,
  key: 'entryAnimation' | 'exitAnimation',
  animation: unknown,
): void {
  if (animation === undefined || animation === false) return;
  if (!isPlainObject(animation)) {
    collector.add(key, `Expected false or an object, received ${describe(animation)}.`);
    return;
  }
  const entry = animation;

  collector.number(`${key}.duration`, entry['duration'], { min: 0 });
  collector.string(`${key}.easing`, entry['easing']);
  if (key === 'entryAnimation') {
    collector.number(`${key}.stagger`, entry['stagger'], { min: 0 });
    collector.number(`${key}.maxStagger`, entry['maxStagger'], { min: 0 });
    collector.boolean(`${key}.animateInitial`, entry['animateInitial']);
  }

  const keyframes = entry['keyframes'];
  if (keyframes === undefined) return;
  if (!Array.isArray(keyframes)) {
    collector.add(
      'entryAnimation.keyframes',
      `Expected an array, received ${describe(keyframes)}.`,
    );
    return;
  }
  if (keyframes.length < 2) {
    collector.add('entryAnimation.keyframes', 'An entry animation needs at least two keyframes.');
  }
  keyframes.forEach((frame, index) => {
    if (!isPlainObject(frame)) {
      collector.add(
        `entryAnimation.keyframes.${index}`,
        `Expected an object, received ${describe(frame)}.`,
      );
      return;
    }
    if ('transform' in frame) {
      collector.add(
        `entryAnimation.keyframes.${index}.transform`,
        'Entry keyframes cannot animate `transform`; it is reserved for item positioning. Use `translate`, `scale` or `rotate` instead.',
      );
    }
  });
}

/** Collect every problem with an options object. Development builds only. */
function validate(input: MasonryGridOptions): readonly MasonryOptionIssue[] {
  const collector = new IssueCollector();
  const value = input as Record<string, unknown>;

  validateColumns(collector, value['columns']);
  collector.number('columnWidth', value['columnWidth'], { min: Number.MIN_VALUE });
  collector.boolean('stretchColumns', value['stretchColumns']);
  collector.number('minColumns', value['minColumns'], { min: 1, integer: true });
  collector.number('maxColumns', value['maxColumns'], { min: 1, integer: true });

  collector.number('gutter', value['gutter'], { min: 0 });
  collector.number('gutterX', value['gutterX'], { min: 0 });
  collector.number('gutterY', value['gutterY'], { min: 0 });

  collector.boolean('horizontalOrder', value['horizontalOrder']);
  collector.enum('direction', value['direction'], ['ltr', 'rtl']);
  collector.enum('verticalOrigin', value['verticalOrigin'], ['top', 'bottom']);
  collector.boolean('fitWidth', value['fitWidth']);
  collector.enum('breakpointBasis', value['breakpointBasis'], ['container', 'viewport']);

  const transition = value['transition'];
  if (transition !== undefined) {
    if (isPlainObject(transition)) {
      collector.number('transition.duration', transition['duration'], { min: 0 });
      collector.string('transition.easing', transition['easing']);
    } else {
      collector.add('transition', `Expected an object, received ${describe(transition)}.`);
    }
  }

  validateAnimation(collector, 'entryAnimation', value['entryAnimation']);
  validateAnimation(collector, 'exitAnimation', value['exitAnimation']);

  collector.boolean('autoLayout', value['autoLayout']);
  collector.boolean('observeResize', value['observeResize']);
  collector.boolean('resizeContainer', value['resizeContainer']);
  collector.boolean('awaitImages', value['awaitImages']);
  collector.number('resizeDebounce', value['resizeDebounce'], { min: 0 });
  collector.boolean('contentVisibility', value['contentVisibility']);

  const ssr = value['ssr'];
  if (ssr !== undefined) {
    if (isPlainObject(ssr)) {
      collector.enum('ssr.fallback', ssr['fallback'], ['columns', 'none']);
      collector.number('ssr.columns', ssr['columns'], { min: 1, integer: true });
    } else {
      collector.add('ssr', `Expected an object, received ${describe(ssr)}.`);
    }
  }

  // Cross-field rules, checked last so they read after the per-field results.
  if (value['columns'] !== undefined && value['columnWidth'] !== undefined) {
    collector.add(
      'columnWidth',
      'Set either `columns` or `columnWidth`, not both. `columns` fixes the count; `columnWidth` derives it from the available width.',
    );
  }

  const min = value['minColumns'];
  const max = value['maxColumns'];
  if (typeof min === 'number' && typeof max === 'number' && max < min) {
    collector.add(
      'maxColumns',
      `\`maxColumns\` (${max}) must be greater than or equal to \`minColumns\` (${min}).`,
    );
  }

  return collector.issues;
}

/** Render issues as a path-annotated report, one problem per line. */
function formatIssues(issues: readonly MasonryOptionIssue[]): string {
  return issues.map((issue) => `✖ ${issue.message}\n  → at ${issue.path}`).join('\n');
}

/**
 * Fill in options, validating them first in development.
 *
 * Invalid configuration is a programmer error, so development builds throw with
 * a readable, path-annotated report. Production builds do not check at all —
 * the validator is compiled out — and simply resolve what they were given.
 */
export function parseMasonryGridOptions(
  value: MasonryGridOptions | null | undefined,
): ResolvedMasonryGridOptions {
  const input = value ?? {};

  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    const issues = validate(input);
    if (issues.length > 0) {
      throw new MasonryGridOptionsError(
        `[masonry-angular] Invalid grid options.\n${formatIssues(issues)}`,
        issues,
      );
    }
  }

  return resolve(input);
}

/**
 * Merge option sources left to right, so component-level options layer cleanly
 * over application-wide defaults. Merging happens on the *unparsed* input, and
 * the result is validated once — a partial override never has to restate the
 * sibling fields of a nested group.
 */
export function mergeMasonryGridOptions(
  ...sources: readonly (MasonryGridOptions | null | undefined)[]
): MasonryGridOptions {
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    if (!source) continue;
    // `columns` and `columnWidth` are mutually exclusive, so setting one has to
    // clear the other rather than trip the exclusivity check.
    if (source.columns !== undefined) delete merged['columnWidth'];
    if (source.columnWidth !== undefined) delete merged['columns'];

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      const existing = merged[key];
      merged[key] =
        isPlainObject(existing) && isPlainObject(value) ? { ...existing, ...value } : value;
    }
  }
  return merged as MasonryGridOptions;
}

/** Structural comparison used to stop inline `[options]="{...}"` literals from re-laying out every check. */
export function masonryOptionsEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => masonryOptionsEqual(item, b[i]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      masonryOptionsEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
