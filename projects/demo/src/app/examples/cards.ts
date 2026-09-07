/** Sample data shared by the examples. Deterministic, so layouts are stable. */

export interface DemoCard {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly height: number;
  readonly hue: number;
  readonly span: number;
  readonly image: boolean;
}

const NOTES = [
  'Columns balance themselves as content settles.',
  'Positioning runs on transforms, off the layout path.',
  'A single ResizeObserver watches the whole grid.',
  'Order comes from the DOM, so nothing shuffles.',
  'Options are validated in development and compiled out of production.',
  'Items hold their place until their images decode.',
  'Repeated passes with identical input do no work.',
];

export function makeCard(id: number): DemoCard {
  return {
    id,
    title: `Card ${id + 1}`,
    body: NOTES[id % NOTES.length]!,
    height: 90 + ((id * 53) % 170),
    hue: (id * 47) % 360,
    span: id % 11 === 4 ? 2 : 1,
    image: id % 5 === 2,
  };
}

export function makeCards(count: number, offset = 0): DemoCard[] {
  return Array.from({ length: count }, (_, i) => makeCard(offset + i));
}

/**
 * A deterministic inline image. Using a data URI keeps the examples working
 * offline while still exercising the `awaitImages` decode path.
 */
export function artwork(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 62%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 60) % 360} 70% 44%)"/>
    </linearGradient></defs>
    <rect width="400" height="260" fill="url(#g)"/>
    <circle cx="300" cy="70" r="46" fill="hsl(${hue} 90% 88%)" opacity="0.45"/>
    <circle cx="86" cy="196" r="30" fill="hsl(${(hue + 180) % 360} 90% 90%)" opacity="0.35"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
