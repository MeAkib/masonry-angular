import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

type Panel = 'none' | 'config' | 'code';

/**
 * The shell every example sits in: a description, a toggle for the controls, a
 * toggle for the source, and a copy button.
 *
 * The preview is never hidden. Tabs that swap the grid out would take it to
 * `display: none`, where it measures zero and has to lay out again on the way
 * back — a flicker caused entirely by the demo, in the one place a visitor is
 * judging whether the layout is steady. So the panels open *above* a preview
 * that stays mounted, which also lets you read the code and watch the result at
 * the same time.
 */
@Component({
  selector: 'demo-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lede-slot">
      <ng-content select="[lede]" />
    </div>

    <div class="toolbar" role="group" aria-label="example views">
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

      @if (panel() === 'code') {
        <button type="button" class="copy" (click)="copy()">
          {{ copied() ? 'Copied' : 'Copy' }}
        </button>
      }
    </div>

    <!-- The example supplies its own controls section, so it keeps the styling
         it already had; this only decides whether it is shown. -->
    <div [hidden]="panel() !== 'config'">
      <ng-content select="[config]" />
    </div>

    @if (panel() === 'code') {
      <pre class="code"><code>{{ code() }}</code></pre>
    }

    <ng-content select="[preview]" />
  `,
  styles: `
    :host {
      display: block;
    }

    .toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      margin: 0 0 14px;
    }

    .toolbar button {
      padding: 5px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--muted);
      font: inherit;
      font-size: 0.82rem;
      cursor: pointer;
    }

    .toolbar button:hover {
      color: var(--text);
    }

    .toolbar button.on {
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }

    .toolbar .copy {
      margin-left: auto;
    }

    .code {
      margin: 0 0 18px;
      padding: 14px 16px;
      max-height: 420px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel);
      font-size: 0.8rem;
      line-height: 1.55;
      tab-size: 2;
    }

    .controls {
      margin-bottom: 18px;
    }
  `,
})
export class DemoExample {
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
      // Clipboard access is refused in some embedded contexts (an iframe
      // without permission, or plain http). Fall back to a selection the
      // visitor can copy with the keyboard rather than failing silently.
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
