// Generate all macOS icon sizes from a single source image
import sharp from 'sharp';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsetDir = join(root, 'assets/icons/pekko.iconset');
const sourcePath = join(root, 'assets/icons/source-icon-1024.png');

async function main() {
  if (!existsSync(iconsetDir)) mkdirSync(iconsetDir, { recursive: true });

  // Pre-upscale source to 1024 for best quality at all sizes
  const source1024 = await sharp(sourcePath)
    .resize(1024, 1024, { fit: 'cover', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // Save back as proper 1024 PNG
  writeFileSync(sourcePath, source1024);

  const sizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of sizes) {
    const buf = await sharp(source1024)
      .resize(size, size, { kernel: 'lanczos3' })
      .png()
      .toBuffer();

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

  // Tray icons — use Phosphor bird silhouette (H is too detailed for 18px)
  const phosphorPath = 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z';

  for (const [size, name] of [[18, 'tray-icon.png'], [36, 'tray-icon@2x.png']]) {
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
