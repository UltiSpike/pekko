#!/bin/bash

# Generate simple test sounds for development
# Requires: sox (apt-get install sox) or ffmpeg

set -e

SOUNDS_DIR="assets/sounds"

generate_sound() {
  local profile=$1
  local freq=$2
  local duration=$3

  echo "Generating $profile sounds..."

  # Generate keydown sound (short burst)
  sox -n -r 44100 -c 1 "$SOUNDS_DIR/$profile/keydown.ogg" \
    synth $duration sine $freq fade t 0.01 $duration 0.01

  # Generate keyup sound (shorter)
  sox -n -r 44100 -c 1 "$SOUNDS_DIR/$profile/keyup.ogg" \
    synth 0.05 sine $freq fade t 0.01 0.05 0.01
}

# Check if sox is installed
if ! command -v sox &> /dev/null; then
  echo "sox not found. Install with: brew install sox"
  exit 1
fi

mkdir -p "$SOUNDS_DIR"/{gateron-red,holy-panda,alps-blue,cream}

# Generate different frequencies for each switch
generate_sound "gateron-red" "1000" "0.1"     # Linear - mid tone
generate_sound "holy-panda" "1200" "0.15"    # Tactile - higher tone, longer
generate_sound "alps-blue" "1500" "0.12"     # Clicky - high tone
generate_sound "cream" "900" "0.08"           # Linear - low tone

echo "✅ Test sounds generated successfully!"
ls -lh "$SOUNDS_DIR"/*/*
