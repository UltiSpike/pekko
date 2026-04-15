// Generate @1x (22x22) and @2x (44x44) PNGs from SVG sources into
// assets/icons/tray-rush/. macOS tray icon standard is 18pt; we render 22pt
// (+ some padding) so the amber fill has breathing room.
const fs = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')

const ROOT = path.join(__dirname, '..')
const ICON_DIR = path.join(ROOT, 'assets', 'icons', 'tray-rush')

const SVGS = ['rush-base', 'rush-bright', 'rush-perfect']
const SIZES = [
  { scale: 1, suffix: '' },      // 22x22
  { scale: 2, suffix: '@2x' },   // 44x44
]

function render(svgName) {
  const svgPath = path.join(ICON_DIR, `${svgName}.svg`)
  const svg = fs.readFileSync(svgPath)

  for (const { scale, suffix } of SIZES) {
    const width = 22 * scale
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
    const png = resvg.render().asPng()
    const out = path.join(ICON_DIR, `${svgName}${suffix}.png`)
    fs.writeFileSync(out, png)
    console.log(`[rush-icons] ${out} (${width}x${width})`)
  }
}

for (const name of SVGS) render(name)
