// Renders an SVG in public/ (default icon.svg) to the PNG icons iOS and the web manifest need.
// Usage: npm run icons   or, to try another design: npm run icons -- my-draft.svg   (commit the PNGs it writes to public/)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let Resvg;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  console.error('Missing dependency. Run: npm install -D @resvg/resvg-js');
  process.exit(1);
}

const publicDir = new URL('../public/', import.meta.url);
const source = process.argv[2] ?? 'icon.svg';
const svg = readFileSync(fileURLToPath(new URL(source, publicDir)));
console.log(`rendering public/${source}`);

const targets = [
  ['apple-touch-icon.png', 180],
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
];

for (const [file, size] of targets) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(fileURLToPath(new URL(file, publicDir)), png);
  console.log(`wrote public/${file} (${size}px)`);
}
