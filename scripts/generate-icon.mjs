import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsetDir = join(root, 'assets/icons/pekko.iconset');

// ── Bird shape: Phosphor Icons "Bird" (Fill), MIT License ──
// Source: https://phosphoricons.com — viewBox 0 0 256 256
const phosphorBirdPath = 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z';

// ── App icon SVG ──
// Layered lighting: background glow → bird body → top highlight → bottom shadow
function makeAppIconSvg(size) {
  const s = 1.4;
  const ox = (512 - 256 * s) / 2 + 8;
  const oy = (512 - 256 * s) / 2 + 4;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <!-- Background: warm dark gradient with subtle vignette -->
    <radialGradient id="bgRad" cx="0.5" cy="0.42" r="0.7">
      <stop offset="0%" stop-color="#342a24"/>
      <stop offset="100%" stop-color="#140e0a"/>
    </radialGradient>

    <!-- Bird body: rich amber gradient, top-left lit -->
    <linearGradient id="birdMain" x1="0.1" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="#fad272"/>
      <stop offset="40%" stop-color="#e8ac3c"/>
      <stop offset="100%" stop-color="#b8802c"/>
    </linearGradient>

    <!-- Top-light overlay: simulates light hitting the top of the bird -->
    <radialGradient id="topLight" cx="0.4" cy="0.2" r="0.55">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>

    <!-- Bottom shadow overlay: simulates underside shadow -->
    <linearGradient id="bottomDark" x1="0" y1="0.4" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.2"/>
    </linearGradient>

    <!-- Warm ambient glow behind the bird -->
    <radialGradient id="ambientGlow" cx="0.52" cy="0.46" r="0.38">
      <stop offset="0%" stop-color="#f0b840" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#f0b840" stop-opacity="0"/>
    </radialGradient>

    <!-- Drop shadow -->
    <filter id="birdShadow" x="-15%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#0a0604" flood-opacity="0.55"/>
    </filter>

    <!-- Clip for overlay layers to bird shape -->
    <clipPath id="birdClip">
      <path d="${phosphorBirdPath}" transform="translate(${ox}, ${oy}) scale(${s})"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="112" fill="url(#bgRad)"/>

  <!-- Ambient glow behind bird -->
  <rect width="512" height="512" rx="112" fill="url(#ambientGlow)"/>

  <!-- Bird with shadow -->
  <g filter="url(#birdShadow)">
    <path d="${phosphorBirdPath}" fill="url(#birdMain)" transform="translate(${ox}, ${oy}) scale(${s})"/>
  </g>

  <!-- Top highlight (clipped to bird) -->
  <rect width="512" height="512" fill="url(#topLight)" clip-path="url(#birdClip)"/>

  <!-- Bottom darken (clipped to bird) -->
  <rect width="512" height="512" fill="url(#bottomDark)" clip-path="url(#birdClip)"/>

  <!-- Subtle edge highlight on top-left — simulates rim light -->
  <path d="${phosphorBirdPath}" fill="none" stroke="url(#topLight)" stroke-width="1.5"
        transform="translate(${ox}, ${oy}) scale(${s})" opacity="0.4"/>
</svg>`;
}

// ── Tray icon SVG (monochrome template image) ──
function makeTrayIconSvg(size) {
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

// ── Generate ──
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

  for (const [size, name] of [[18, 'tray-icon.png'], [36, 'tray-icon@2x.png']]) {
    const svg = makeTrayIconSvg(size);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(join(root, 'assets/icons', name), buf);
    console.log(`  ✓ ${name}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
