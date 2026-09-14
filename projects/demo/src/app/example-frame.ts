import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

type Panel = 'none' | 'notes' | 'config' | 'code';

/**
 * The shell every example sits in.
 *
 * Two decisions worth knowing about.
 *
 * Every panel is closed by default. This is a demo for a layout library, so the
 * layout is what a visitor came to see — the explanation used to sit above it as
 * two paragraphs of prose, which pushed the grid most of a screen down. The
 * title and a one-line summary stay visible; everything longer is a click away.
 *
 * The preview is never hidden. Tabs that swap the grid out would take it to
 * `display: none`, where it measures zero and has to lay out again on the way
 * back — a flicker caused entirely by the demo, in the one place a visitor is
 * judging whether the layout is steady. So panels open above a preview that
 * stays mounted, which also lets you read the code and watch the result at once.
 */
@Component({
  selector: 'demo-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="example-head">
      <div class="titles">
        <h2>{{ heading() }}</h2>
        <p>{{ summary() }}</p>
      </div>

      <div class="switch" role="group" aria-label="example details">
        <button
          type="button"
          [class.on]="panel() === 'notes'"
          [attr.aria-pressed]="panel() === 'notes'"
          (click)="toggle('notes')"
        >
          Notes
        </button>
        <button
          type="button"
          [class.on]="panel() === 'config'"
          [attr.aria-pressed]="panel() === 'config'"
          (click)="toggle('config')"
        >
          Config
        </button>
        <button
          type="button"
          [class.on]="panel() === 'code'"
          [attr.aria-pressed]="panel() === 'code'"
          (click)="toggle('code')"
        >
          Code
        </button>
      </div>
    </header>

    @if (panel() === 'notes') {
      <div class="panel notes">
        <ng-content select="[lede]" />
      </div>
    }

    <!-- The example supplies its own controls markup, so it keeps the styling it
         already had; this only decides whether it is shown. -->
    @if (panel() === 'config') {
      <div class="panel">
        <ng-content select="[config]" />
      </div>
    }

    @if (panel() === 'code') {
      <div class="panel code-panel">
        <button type="button" class="copy" (click)="copy()">
          {{ copied() ? 'Copied' : 'Copy' }}
        </button>
        <pre class="code"><code>{{ code() }}</code></pre>
      </div>
    }

    <ng-content select="[preview]" />
  `,
  styles: `
    :host {
      display: block;
    }

    .example-head {
      display: flex;
      flex-wrap: wrap;
      gap: var(--s4);
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: var(--s5);
    }

    .titles h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 620;
      letter-spacing: -0.02em;
    }

    .titles p {
      margin: 4px 0 0;
      max-width: 62ch;
      color: var(--muted);
      font-size: 0.9rem;
    }

    /* A segmented control: one object, three states, rather than three buttons. */
    .switch {
      display: flex;
      flex-shrink: 0;
      padding: 3px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--sunken);
    }

    .switch button {
      padding: 5px 13px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-size: 0.82rem;
      line-height: 1.4;
      cursor: pointer;
      transition:
        background 0.12s ease,
        color 0.12s ease;
    }

    .switch button:hover {
      color: var(--text);
    }

    .switch button.on {
      background: var(--panel);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
      color: var(--text);
      font-weight: 600;
    }

    .panel {
      margin-bottom: var(--s5);
    }

    .notes {
      padding: var(--s4) var(--s5);
      border: 1px solid var(--line);
      border-left: 2px solid var(--accent);
      border-radius: var(--r2);
      background: var(--panel);
    }

    .code-panel {
      position: relative;
    }

    .copy {
      position: absolute;
      top: var(--s3);
      right: var(--s3);
      z-index: 1;
      padding: 4px 11px;
      font-size: 0.76rem;
    }

    .code {
      margin: 0;
      padding: var(--s4) var(--s5);
      max-height: 440px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: var(--r2);
      background: var(--panel);
      font-family: var(--mono);
      font-size: 0.8rem;
      line-height: 1.6;
      tab-size: 2;
    }

    @media (max-width: 560px) {
      .switch {
        width: 100%;
      }

      .switch button {
        flex: 1;
      }
    }
  `,
})
export class DemoExample {
  /** The example's name, shown as the heading. */
  readonly heading = input.required<string>();

  /** One line, always visible. Everything longer belongs in the notes panel. */
  readonly summary = input.required<string>();

  /** The snippet shown under "Code", and what the copy button puts on the clipboard. */
  readonly code = input.required<string>();

  readonly panel = signal<Panel>('none');
  readonly copied = signal(false);

  toggle(which: Panel): void {
    this.panel.update((current) => (current === which ? 'none' : which));
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
    } catch {
      // Clipboard access is refused in some embedded contexts (an iframe without
      // permission, or plain http). Fall back to a selection the visitor can
      // copy with the keyboard rather than failing silently.
      const area = document.createElement('textarea');
      area.value = this.code();
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      try {
        document.execCommand('copy');
      } finally {
        area.remove();
      }
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1600);
  }
}
