#!/usr/bin/env node
/**
 * Generate Pekko pixel-art woodpecker icons
 * Uses raw PNG encoding (no dependencies)
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// 16×16 pixel art woodpecker (indexed by row, left to right)
// Color key: 0=transparent, 1=#1a1423(bg), 2=#e43b44(red crest), 3=#feae34(beak/accent),
//            4=#ead4aa(cream body), 5=#262b44(dark body), 6=#181425(outline), 7=#63c74d(eye)
const SPRITE_16 = [
  [0,0,0,0,0,0,6,6,6,0,0,0,0,0,0,0],
  [0,0,0,0,0,6,2,2,2,6,0,0,0,0,0,0],
  [0,0,0,0,6,2,2,2,2,2,6,0,0,0,0,0],
  [0,0,0,0,6,2,2,2,2,2,6,0,0,0,0,0],
  [0,0,0,6,6,4,4,4,4,6,6,0,0,0,0,0],
  [0,0,0,6,4,4,7,4,4,4,6,0,0,0,0,0],
  [0,0,6,5,4,4,4,4,4,5,6,3,3,0,0,0],
  [0,0,6,5,5,4,4,4,5,5,6,3,3,3,0,0],
  [0,0,6,5,5,5,4,5,5,5,6,0,3,0,0,0],
  [0,0,0,6,5,5,5,5,5,6,0,0,0,0,0,0],
  [0,0,0,6,5,5,5,5,5,6,0,0,0,0,0,0],
  [0,0,0,0,6,5,5,5,6,0,0,0,0,0,0,0],
  [0,0,0,0,6,5,6,5,6,0,0,0,0,0,0,0],
  [0,0,0,0,6,5,6,5,6,0,0,0,0,0,0,0],
  [0,0,0,6,3,6,0,6,3,6,0,0,0,0,0,0],
  [0,0,0,6,6,0,0,0,6,6,0,0,0,0,0,0],
]

const PALETTE = {
  0: [0, 0, 0, 0],         // transparent
  1: [26, 20, 35, 255],     // bg
  2: [228, 59, 68, 255],    // red crest
  3: [254, 174, 52, 255],   // beak/accent
  4: [234, 212, 170, 255],  // cream body
  5: [38, 43, 68, 255],     // dark body
  6: [24, 20, 37, 255],     // outline
  7: [99, 199, 77, 255],    // eye (green)
}

function createPNG(pixels, width, height) {
  // RGBA raw data
  const raw = Buffer.alloc(height * (1 + width * 4)) // filter byte per row
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter: None
    for (let x = 0; x < width; x++) {
      const c = PALETTE[pixels[y][x]] || PALETTE[0]
      const offset = y * (1 + width * 4) + 1 + x * 4
      raw[offset] = c[0]; raw[offset+1] = c[1]; raw[offset+2] = c[2]; raw[offset+3] = c[3]
    }
  }

  const compressed = zlib.deflateSync(raw)

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type)
    const crcData = Buffer.concat([typeB, data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcData) >>> 0)
    return Buffer.concat([len, typeB, data, crc])
  }

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const idat = chunk('IDAT', compressed)
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, chunk('IHDR', ihdr), idat, iend])
}

// CRC32 table
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[n] = c
}
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF)
}

// Scale up a sprite by factor
function scaleSprite(sprite, factor) {
  const result = []
  for (const row of sprite) {
    const newRow = []
    for (const pixel of row) for (let i = 0; i < factor; i++) newRow.push(pixel)
    for (let i = 0; i < factor; i++) result.push([...newRow])
  }
  return result
}

// Generate icons
const iconsDir = path.join(__dirname, '..', 'assets', 'icons')
fs.mkdirSync(iconsDir, { recursive: true })

// Tray icon: 16×16 (1x) and 32×32 (2x retina)
const png16 = createPNG(SPRITE_16, 16, 16)
fs.writeFileSync(path.join(iconsDir, 'tray-icon.png'), png16)
console.log('✓ tray-icon.png (16x16)')

const sprite32 = scaleSprite(SPRITE_16, 2)
const png32 = createPNG(sprite32, 32, 32)
fs.writeFileSync(path.join(iconsDir, 'tray-icon@2x.png'), png32)
console.log('✓ tray-icon@2x.png (32x32)')

// App icon sizes for .iconset: 16, 32, 128, 256, 512
const sizes = [
  [16, 1], [16, 2], [32, 1], [32, 2],
  [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2]
]

const iconsetDir = path.join(iconsDir, 'pekko.iconset')
fs.mkdirSync(iconsetDir, { recursive: true })

for (const [base, scale] of sizes) {
  const px = base * scale
  const factor = Math.max(1, Math.round(px / 16))
  const scaled = scaleSprite(SPRITE_16, factor)
  const png = createPNG(scaled, px, px)
  const name = scale === 1 ? `icon_${base}x${base}.png` : `icon_${base}x${base}@2x.png`
  fs.writeFileSync(path.join(iconsetDir, name), png)
  console.log(`✓ ${name} (${px}x${px})`)
}

console.log('\nRun: iconutil -c icns assets/icons/pekko.iconset -o assets/icons/app-icon.icns')
