// Takes the 1024px Blender render and generates all macOS icon sizes + tray icons
import sharp from 'sharp';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsetDir = join(root, 'assets/icons/pekko.iconset');
const renderPath = join(iconsetDir, 'icon_render_1024.png');

async function main() {
  if (!existsSync(iconsetDir)) mkdirSync(iconsetDir, { recursive: true });

  // App icon sizes
  const sizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of sizes) {
    const buf = await sharp(renderPath).resize(size, size, { fit: 'contain' }).png().toBuffer();

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

  // .icns
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(root, 'assets/icons/app-icon.icns')}"`);
    console.log(`  ✓ app-icon.icns`);
  } catch (e) {
    console.log(`  ⚠ iconutil: ${e.message}`);
  }

  // Tray icons — extract bird silhouette from render, threshold to black
  for (const [size, name] of [[18, 'tray-icon.png'], [36, 'tray-icon@2x.png']]) {
    // For tray, use the Phosphor SVG path (simpler, cleaner at small sizes)
    const phosphorPath = 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z';
    const padding = size * 0.1;
    const avail = size - padding * 2;
    const scale = avail / 256;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <g transform="translate(${padding}, ${padding}) scale(${scale})">
        <path d="${phosphorPath}" fill="#000"/>
      </g>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(join(root, 'assets/icons', name), buf);
    console.log(`  ✓ ${name}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
