#!/bin/bash

# Keeby Sound Download Script
# Downloads mechanical switch sounds from Freesound.org
# Run: bash scripts/download-sounds.sh

set -e

SOUNDS_DIR="assets/sounds"

mkdir -p "$SOUNDS_DIR"/{gateron-red,holy-panda,alps-blue,cream}

echo "📥 Downloading mechanical keyboard sounds..."
echo "Note: You need to manually download sounds from:"
echo "  - https://freesound.org (search for 'mechanical keyboard')"
echo "  - https://mechvibes.com (community packs)"
echo "  - Personal recordings of mechanical switches"
echo ""
echo "Place keydown.ogg and keyup.ogg in each profile folder:"
echo "  assets/sounds/gateron-red/"
echo "  assets/sounds/holy-panda/"
echo "  assets/sounds/alps-blue/"
echo "  assets/sounds/cream/"
echo ""
echo "✅ Directory structure created. Ready for sound files!"
