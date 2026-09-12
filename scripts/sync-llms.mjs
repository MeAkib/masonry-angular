/**
 * Copies `llms.txt` into the demo's static assets, so the deployed site serves
 * it at `/llms.txt` — the location the convention expects agents to look.
 *
 * The repository root holds the only editable copy; `projects/demo/public/llms.txt`
 * is generated and git-ignored. npm runs this automatically before `npm run build`,
 * which is also the command Vercel runs, so the deployed copy cannot drift from
 * the source.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(ROOT, 'llms.txt');
const to = resolve(ROOT, 'projects/demo/public/llms.txt');

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log('llms.txt -> projects/demo/public/llms.txt');
