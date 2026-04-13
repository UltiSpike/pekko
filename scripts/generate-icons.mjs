/**
 * Pekko Icon Generator
 * Generates app icon (.icns) and tray icons from SVG design.
 * Uses Phosphor bird-fill (MIT license) as the base shape.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ICONS_DIR = join(ROOT, 'assets', 'icons')
const ICONSET_DIR = join(ICONS_DIR, 'pekko.iconset')

// Phosphor bird-fill path (MIT license)
const BIRD_PATH = 'M236.44,73.34 L213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88a104.11,104.11,0,0,0,104-104V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12,12,12,0,0,1-12,12Z'

// ── App Icon SVG ──────────────────────────────────────────
function appIconSvg(size) {
  const pad = size * 0.12           // padding from edge
  const birdSize = size * 0.52      // bird occupies ~52% of icon
  const birdX = (size - birdSize) / 2 + birdSize * 0.02  // slight left shift (bird faces right)
  const birdY = (size - birdSize) / 2 - size * 0.02      // slight up shift
  const cornerR = size * 0.22       // macOS-style corner radius
  const glowR = size * 0.32

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#1e1e2a"/>
      <stop offset="100%" stop-color="#0c0c12"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#e09830" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#e09830" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${cornerR}" fill="url(#bg)"/>
  <!-- Subtle border -->
  <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${cornerR}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <!-- Ambient glow behind bird -->
  <circle cx="${size / 2}" cy="${size * 0.46}" r="${glowR}" fill="url(#glow)"/>
  <!-- Bird -->
  <svg x="${birdX}" y="${birdY}" width="${birdSize}" height="${birdSize}" viewBox="0 0 256 256">
    <path fill="#e09830" d="${BIRD_PATH}"/>
  </svg>
</svg>`
}

// ── Tray Icon SVG (monochrome, template image) ───────────
function trayIconSvg(size) {
  const birdSize = size * 0.85
  const birdX = (size - birdSize) / 2
  const birdY = (size - birdSize) / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <svg x="${birdX}" y="${birdY}" width="${birdSize}" height="${birdSize}" viewBox="0 0 256 256">
    <path fill="black" d="${BIRD_PATH}"/>
  </svg>
</svg>`
}

// ── Render SVG → PNG ─────────────────────────────────────
function renderPng(svg, width) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
  })
  return resvg.render().asPng()
}

// ── Main ─────────────────────────────────────────────────
function main() {
  if (!existsSync(ICONSET_DIR)) mkdirSync(ICONSET_DIR, { recursive: true })

  console.log('Generating app icons...')

  // macOS iconset sizes: [size, suffix]
  const iconsetSizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ]

  // Generate master SVG at 1024px, then render at each size
  const masterSvg = appIconSvg(1024)

  for (const [size, filename] of iconsetSizes) {
    const png = renderPng(masterSvg, size)
    const outPath = join(ICONSET_DIR, filename)
    writeFileSync(outPath, png)
    console.log(`  ✓ ${filename} (${size}px)`)
  }

  // Build .icns from iconset
  console.log('Building .icns...')
  const icnsPath = join(ICONS_DIR, 'app-icon.icns')
  execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${icnsPath}"`)
  console.log(`  ✓ app-icon.icns`)

  // Generate tray icons (monochrome, template)
  console.log('Generating tray icons...')

  const tray16 = renderPng(trayIconSvg(16), 16)
  const tray32 = renderPng(trayIconSvg(32), 32)
  writeFileSync(join(ICONS_DIR, 'tray-icon.png'), tray16)
  writeFileSync(join(ICONS_DIR, 'tray-icon@2x.png'), tray32)
  console.log('  ✓ tray-icon.png (16px)')
  console.log('  ✓ tray-icon@2x.png (32px)')

  console.log('\nDone! All icons generated.')
}

main()
