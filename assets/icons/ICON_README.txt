Icon Files Required
===================

You need to provide two icon files:

1. app-icon.icns
   - macOS app icon for .app bundle
   - Size: 512x512 pixels or larger
   - Format: .icns (use Image2Icon or similar tool)
   - Can be generated from PNG using: iconutil -c icns icon.png -o app-icon.icns

2. tray-icon.png
   - Menu bar icon
   - Size: 18x18 and 36x36 (retina)
   - Format: PNG
   - Should be a simple, clean icon that works well in the menu bar

You can create a simple icon using:
- https://icon.kitchen (online icon generator)
- Figma / Sketch
- ImageMagick

For a quick placeholder, you can create a simple icon with:
  convert -size 512x512 xc:white -fill black -pointsize 400 -gravity center -annotate +0+0 'K' app-icon.png
