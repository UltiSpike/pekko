// Pixel-art Pekko icon — a small bird on a warm dark background
// Matches the NES.css aesthetic of the app UI
import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsetDir = join(root, 'assets/icons/pekko.iconset');

// ── Color palette (warm, limited like a real NES palette) ──
const C = {
  _: null,           // transparent / background
  D: '#1e1814',      // dark bg
  B: '#2a2220',      // bg lighter (for subtle bg texture)
  G: '#e8a830',      // gold (main bird)
  L: '#f4c858',      // light gold (highlights)
  S: '#c08020',      // shadow gold (dark feathers)
  W: '#b06818',      // warm brown (wing/tail shadow)
  E: '#141010',      // eye black
  K: '#f8e8a0',      // eye highlight / beak tip
  O: '#d89028',      // orange (beak)
};

// ── 32x32 pixel bird ──
// A small round songbird facing right, perched.
// Grid: each cell is one "pixel" that gets scaled up.
const { _, D, G, L, S, W, E, K, O } = C;

// prettier-ignore
const birdGrid = [
//  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 0
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 1
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 2
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 3
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 4
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 5
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,S,S,S,S,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 6
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,S,S,G,G,G,G,S,S,_,_,_,_,_,_,_,_,_,_,_ ], // 7
  [ _,_,_,_,_,_,_,_,_,_,_,_,S,G,L,L,L,G,G,G,G,S,_,_,_,_,_,_,_,_,_,_ ], // 8
  [ _,_,_,_,_,_,_,_,_,_,_,S,G,L,L,L,G,G,G,G,G,G,S,_,_,_,_,_,_,_,_,_ ], // 9
  [ _,_,_,_,_,_,_,_,_,_,_,S,G,L,G,G,G,E,G,G,G,G,G,O,O,_,_,_,_,_,_,_ ], // 10  (eye + beak)
  [ _,_,_,_,_,_,_,_,_,_,S,G,G,G,G,G,G,G,G,G,G,G,O,O,K,_,_,_,_,_,_,_ ], // 11  (beak continues)
  [ _,_,_,_,_,_,_,_,_,_,S,G,G,G,G,G,G,G,G,G,G,G,O,O,_,_,_,_,_,_,_,_ ], // 12
  [ _,_,_,_,_,_,_,_,_,S,G,G,G,G,G,G,G,G,G,G,G,G,S,_,_,_,_,_,_,_,_,_ ], // 13
  [ _,_,_,_,_,_,_,_,_,S,G,G,G,G,G,G,G,G,G,G,G,S,_,_,_,_,_,_,_,_,_,_ ], // 14
  [ _,_,_,_,_,_,_,_,S,G,G,G,W,W,W,G,G,G,G,G,G,S,_,_,_,_,_,_,_,_,_,_ ], // 15  (wing starts)
  [ _,_,_,_,_,_,_,_,S,G,G,W,W,S,S,W,G,G,G,G,S,_,_,_,_,_,_,_,_,_,_,_ ], // 16
  [ _,_,_,_,_,_,_,_,S,G,G,W,S,S,S,W,G,G,G,G,S,_,_,_,_,_,_,_,_,_,_ ], // 17
  [ _,_,_,_,_,_,_,_,S,G,G,W,W,S,W,W,G,G,G,S,_,_,_,_,_,_,_,_,_,_,_,_ ], // 18
  [ _,_,_,_,_,_,_,_,_,S,G,G,W,W,W,G,G,G,G,S,_,_,_,_,_,_,_,_,_,_,_,_ ], // 19
  [ _,_,_,_,_,_,_,_,_,S,G,G,G,G,G,G,G,G,S,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 20
  [ _,_,_,_,_,_,_,_,_,_,S,G,G,G,G,G,G,S,S,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 21
  [ _,_,_,_,_,_,_,_,_,_,S,S,G,G,G,G,S,S,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 22
  [ _,_,_,_,_,_,_,S,S,S,S,S,S,G,G,S,S,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 23  (tail)
  [ _,_,_,_,_,_,S,W,W,W,S,_,S,S,S,S,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 24  (tail)
  [ _,_,_,_,_,S,W,W,S,S,_,_,_,S,E,S,E,S,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 25  (tail + feet)
  [ _,_,_,_,_,S,S,S,_,_,_,_,_,S,E,S,E,S,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 26  (feet)
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,S,_,_,S,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 27
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 28
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 29
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 30
  [ _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_ ], // 31
];

// ── Hex to RGB ──
function hex2rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ── Render pixel grid to PNG buffer at given size ──
async function renderIcon(size, withBg = true) {
  const gridSize = 32;
  const pixelSize = Math.ceil(size / gridSize); // size of each "pixel" in the output
  const canvasSize = pixelSize * gridSize;

  // Create raw pixel data
  const channels = 4; // RGBA
  const data = Buffer.alloc(canvasSize * canvasSize * channels);
  const bgRgb = hex2rgb(C.D);

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const color = birdGrid[gy]?.[gx];
      let r, g, b, a;

      if (color === null || color === undefined) {
        if (withBg) {
          [r, g, b] = bgRgb;
          a = 255;
        } else {
          r = g = b = a = 0;
        }
      } else {
        [r, g, b] = hex2rgb(color);
        a = 255;
      }

      // Fill the pixel block
      for (let py = 0; py < pixelSize; py++) {
        for (let px = 0; px < pixelSize; px++) {
          const x = gx * pixelSize + px;
          const y = gy * pixelSize + py;
          if (x < canvasSize && y < canvasSize) {
            const idx = (y * canvasSize + x) * channels;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }
      }
    }
  }

  // Create image and resize to exact target size
  return sharp(data, { raw: { width: canvasSize, height: canvasSize, channels } })
    .resize(size, size, { kernel: 'nearest' }) // nearest-neighbor preserves pixel edges
    .png()
    .toBuffer();
}

// ── Generate all sizes ──
async function main() {
  if (!existsSync(iconsetDir)) mkdirSync(iconsetDir, { recursive: true });

  const appSizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of appSizes) {
    const buf = await renderIcon(size, true);

    if (size <= 512) {
      const name = `icon_${size}x${size}.png`;
      writeFileSync(join(iconsetDir, name), buf);
      console.log(`  ✓ ${name}`);
    }
    const half = size / 2;
    if (half >= 16 && half <= 512) {
      const name = `icon_${half}x${half}@2x.png`;
      writeFileSync(join(iconsetDir, name), buf);
      console.log(`  ✓ ${name}`);
    }
  }

  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(root, 'assets/icons/app-icon.icns')}"`);
    console.log(`  ✓ app-icon.icns`);
  } catch (e) {
    console.log(`  ⚠ iconutil: ${e.message}`);
  }

  // Tray icon — same bird but no bg, black silhouette
  for (const [size, name] of [[18, 'tray-icon.png'], [36, 'tray-icon@2x.png']]) {
    // For tray: use Phosphor SVG (cleaner at tiny sizes than pixel art)
    const phosphorPath = 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z';
    const p = size * 0.1;
    const s = (size - p * 2) / 256;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><g transform="translate(${p},${p}) scale(${s})"><path d="${phosphorPath}" fill="#000"/></g></svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(join(root, 'assets/icons', name), buf);
    console.log(`  ✓ ${name}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
