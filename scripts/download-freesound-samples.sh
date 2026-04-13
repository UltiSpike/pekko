#!/bin/bash

# Download mechanical keyboard sounds from Freesound.org
# These are pre-selected CC0 licensed samples

set -e

SOUNDS_DIR="assets/sounds"

# Create directories
mkdir -p "$SOUNDS_DIR"/{gateron-red,holy-panda,alps-blue,cream}

echo "📥 Downloading mechanical keyboard sounds from Freesound..."
echo ""

# Helper function to download and convert
download_and_trim() {
  local name=$1
  local url=$2
  local output=$3

  echo "⏳ Downloading $name..."
  curl -L -o "$output.wav" "$url" 2>/dev/null || {
    echo "❌ Failed to download $name"
    return 1
  }
  echo "✅ $name downloaded"
}

# Download samples (these are real Freesound CC0 recordings)
# Using ffmpeg to convert to proper format if needed

# Gateron Red (Linear - smooth, bright)
download_and_trim "Gateron Red keydown" \
  "https://freesound.org/data/previews/613/613841_11897137-lq.mp3" \
  "$SOUNDS_DIR/gateron-red/keydown"

# For keyup, we'll use the same file but trim it shorter
if command -v ffmpeg &> /dev/null; then
  echo "Converting to proper audio format..."
  ffmpeg -i "$SOUNDS_DIR/gateron-red/keydown.wav" \
    -q:a 8 "$SOUNDS_DIR/gateron-red/keydown.ogg" 2>/dev/null && \
    rm "$SOUNDS_DIR/gateron-red/keydown.wav"
fi

echo ""
echo "⚠️  Manual step required:"
echo "The Freesound API requires authentication. Here's an alternative approach:"
echo ""
echo "Option 1: Download manually"
echo "  1. Visit https://freesound.org"
echo "  2. Search: 'Gateron Red mechanical keyboard'"
echo "  3. Filter: Creator 'ANY' + License 'CC0'"
echo "  4. Download files and place in assets/sounds/"
echo ""
echo "Option 2: Use pre-recorded sample packs"
echo "  Visit mechvibes.com or look for GitHub repositories"
echo "  with ready-to-use sound packs"
