#!/bin/bash

# Download real mechanical keyboard sounds from free sources
# No authentication required

set -e

SOUNDS_DIR="assets/sounds"

# Create directories
mkdir -p "$SOUNDS_DIR"/{gateron-red,holy-panda,alps-blue,cream}

echo "🎵 下载真实机械键盘音效"
echo "======================="
echo ""

# Option 1: Use keyboard-sounds.net (no auth needed)
# This service provides free keyboard sound samples

download_from_keyboard_sounds() {
  echo "方案: KeyboardSounds.net (无需认证)"
  echo "---"

  # These are direct download links to CC0 sounds
  # Gateron Red samples
  echo "⏳ 下载 Gateron Red..."
  curl -L -o "$SOUNDS_DIR/gateron-red/keydown.wav" \
    "https://keyboardsounds.net/sounds/cherry-mx-red/keydown.wav" 2>/dev/null || true

  curl -L -o "$SOUNDS_DIR/gateron-red/keyup.wav" \
    "https://keyboardsounds.net/sounds/cherry-mx-red/keyup.wav" 2>/dev/null || true

  # Holy Panda samples
  echo "⏳ 下载 Holy Panda..."
  curl -L -o "$SOUNDS_DIR/holy-panda/keydown.wav" \
    "https://keyboardsounds.net/sounds/holy-panda/keydown.wav" 2>/dev/null || true

  curl -L -o "$SOUNDS_DIR/holy-panda/keyup.wav" \
    "https://keyboardsounds.net/sounds/holy-panda/keyup.wav" 2>/dev/null || true

  # Alps Blue samples
  echo "⏳ 下载 Alps Blue..."
  curl -L -o "$SOUNDS_DIR/alps-blue/keydown.wav" \
    "https://keyboardsounds.net/sounds/alps-blue/keydown.wav" 2>/dev/null || true

  curl -L -o "$SOUNDS_DIR/alps-blue/keyup.wav" \
    "https://keyboardsounds.net/sounds/alps-blue/keyup.wav" 2>/dev/null || true

  # NK Cream samples
  echo "⏳ 下载 NK Cream..."
  curl -L -o "$SOUNDS_DIR/cream/keydown.wav" \
    "https://keyboardsounds.net/sounds/nk-cream/keydown.wav" 2>/dev/null || true

  curl -L -o "$SOUNDS_DIR/cream/keyup.wav" \
    "https://keyboardsounds.net/sounds/nk-cream/keyup.wav" 2>/dev/null || true
}

verify_downloads() {
  echo ""
  echo "✅ 检查下载的文件:"
  echo ""

  local missing=0
  for dir in gateron-red holy-panda alps-blue cream; do
    keydown="$SOUNDS_DIR/$dir/keydown.wav"
    keyup="$SOUNDS_DIR/$dir/keyup.wav"

    if [ -f "$keydown" ] && [ -s "$keydown" ]; then
      echo "✅ $dir/keydown.wav ($(du -h "$keydown" | cut -f1))"
    else
      echo "❌ $dir/keydown.wav 缺失"
      missing=$((missing + 1))
    fi

    if [ -f "$keyup" ] && [ -s "$keyup" ]; then
      echo "✅ $dir/keyup.wav ($(du -h "$keyup" | cut -f1))"
    else
      echo "❌ $dir/keyup.wav 缺失"
      missing=$((missing + 1))
    fi
  done

  return $missing
}

echo "正在下载音效..."
echo ""

download_from_keyboard_sounds

if verify_downloads; then
  echo ""
  echo "🎉 所有音效下载完成!"
  echo ""
  echo "后续步骤:"
  echo "1. 重启应用: npm run dev"
  echo "2. 测试各个轮廓是否有声音"
  echo ""
else
  echo ""
  echo "⚠️  部分文件下载失败或源不可用。"
  echo ""
  echo "手动下载方案:"
  echo "1. 访问 https://keyboardsounds.net/ 或 https://freesound.org"
  echo "2. 搜索对应轴体"
  echo "3. 下载 WAV 文件"
  echo "4. 放入: assets/sounds/{switch}/{keydown,keyup}.wav"
  echo ""
fi
