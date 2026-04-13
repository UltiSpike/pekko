import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsetDir = join(root, 'assets/icons/pekko.iconset');

// ── Bird shape: Phosphor Icons "Bird" (Fill), MIT License ──
// Original viewBox: 0 0 256 256
// Source: https://phosphoricons.com
const phosphorBirdPath = 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z';

// ── App icon SVG ──
function makeAppIconSvg(size) {
  // Center the 256x256 bird in a 512x512 canvas with padding
  // Scale 1.4x and offset to center nicely
  const birdScale = 1.4;
  const birdOffsetX = (512 - 256 * birdScale) / 2 + 8; // nudge right slightly
  const birdOffsetY = (512 - 256 * birdScale) / 2 + 4;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#2c2420"/>
      <stop offset="100%" stop-color="#181210"/>
    </linearGradient>
    <linearGradient id="birdGrad" x1="0.15" y1="0" x2="0.75" y2="1">
      <stop offset="0%" stop-color="#f2c864"/>
      <stop offset="50%" stop-color="#daa840"/>
      <stop offset="100%" stop-color="#c08a30"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.5">
      <stop offset="0%" stop-color="#f2c864" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#f2c864" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-10%" y="-5%" width="120%" height="125%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect width="512" height="512" rx="112" fill="url(#glow)"/>
  <g filter="url(#shadow)" transform="translate(${birdOffsetX}, ${birdOffsetY}) scale(${birdScale})">
    <path d="${phosphorBirdPath}" fill="url(#birdGrad)"/>
  </g>
</svg>`;
}

// ── Tray icon SVG (monochrome template image) ──
function makeTrayIconSvg(size) {
  // Fit the 256x256 bird into tray size with padding
  const padding = size * 0.1;
  const avail = size - padding * 2;
  const scale = avail / 256;
  const offset = padding;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${offset}, ${offset}) scale(${scale})">
    <path d="${phosphorBirdPath}" fill="#000"/>
  </g>
</svg>`;
}

// ── Generate all sizes ──
async function main() {
  if (!existsSync(iconsetDir)) mkdirSync(iconsetDir, { recursive: true });

  const appSizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of appSizes) {
    const svg = makeAppIconSvg(size);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();

    if (size <= 512) {
      const name = `icon_${size}x${size}.png`;
      writeFileSync(join(iconsetDir, name), buf);
      console.log(`  ✓ ${name}`);
    }
    const halfSize = size / 2;
    if (halfSize >= 16 && halfSize <= 512) {
      const name = `icon_${halfSize}x${halfSize}@2x.png`;
      writeFileSync(join(iconsetDir, name), buf);
      console.log(`  ✓ ${name}`);
    }
  }

  // .icns
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(root, 'assets/icons/app-icon.icns')}"`);
    console.log(`  ✓ app-icon.icns`);
  } catch (e) {
    console.log(`  ⚠ iconutil: ${e.message}`);
  }

  // Tray
  for (const [size, name] of [[18, 'tray-icon.png'], [36, 'tray-icon@2x.png']]) {
    const svg = makeTrayIconSvg(size);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(join(root, 'assets/icons', name), buf);
    console.log(`  ✓ ${name}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
