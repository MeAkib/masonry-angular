import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly examples = [
    { path: 'gallery', label: 'Gallery' },
    { path: 'spans', label: 'Spans & stamps' },
    { path: 'dashboard', label: 'Dashboard' },
    { path: 'dynamic', label: 'Dynamic items' },
    { path: 'performance', label: 'Performance' },
  ];
}
