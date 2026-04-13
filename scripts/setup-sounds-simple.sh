#!/bin/bash

# Simple sound setup guide
# This script provides direct links to download mechanical keyboard sounds

set -e

SOUNDS_DIR="assets/sounds"

echo "🎵 Keeby Sound Setup"
echo "===================="
echo ""
echo "下面提供几个获取免费机械键盘音效的方案："
echo ""

echo "方案 1️⃣ : Freesound.org (推荐)"
echo "-----"
echo "最简单的方式 - 直接下载真实录音"
echo ""
echo "步骤："
echo "1. 访问: https://freesound.org"
echo "2. 搜索每个轴体: "
echo "   - 'Gateron Red switch sound'"
echo "   - 'Holy Panda switch sound'"
echo "   - 'Alps Blue switch sound'"
echo "   - 'NK Cream switch sound'"
echo "3. 筛选条件: License = 'CC0' 或 'CC-BY'"
echo "4. 下载 WAV 或 OGG 文件"
echo "5. 放入对应目录:"
echo "   assets/sounds/gateron-red/{keydown,keyup}.wav"
echo "   assets/sounds/holy-panda/{keydown,keyup}.wav"
echo "   assets/sounds/alps-blue/{keydown,keyup}.wav"
echo "   assets/sounds/cream/{keydown,keyup}.wav"
echo ""

echo "方案 2️⃣ : Mechvibes GitHub"
echo "-----"
echo "从 Mechvibes 项目提取音效"
echo ""
echo "1. 访问: https://github.com/hainguyents13/mechvibes"
echo "2. 找到 'Sounds' 或 'Resources' 目录"
echo "3. 下载对应的轴体音效"
echo "4. 转换为 WAV/OGG 并放入对应目录"
echo ""

echo "方案 3️⃣ : 自己录制"
echo "-----"
echo "用手机录制你的机械键盘："
echo "1. 用 iPhone/Android 录一段 5-10 秒的敲键盘声"
echo "2. 编辑：分离按下和释放两部分"
echo "3. 导出为 WAV 格式"
echo "4. 放入对应目录"
echo ""

echo "✅ 文件结构:"
find "$SOUNDS_DIR" -type d | sort | sed 's|^|   |'
echo ""
echo "用 ✖️ 表示缺少的文件："
find "$SOUNDS_DIR" -type d -empty -prune -o -type d -print | while read dir; do
  if [ -d "$dir" ] && [ "$dir" != "$SOUNDS_DIR" ]; then
    count=$(find "$dir" -type f | wc -l)
    if [ $count -lt 2 ]; then
      echo "   $dir (缺少文件)"
    fi
  fi
done

echo ""
echo "💡 提示："
echo "  - WAV 和 OGG 格式都支持"
echo "  - 按下声音: 60-120ms"
echo "  - 释放声音: 40-80ms"
echo "  - 样本率: 44.1kHz 最佳"
echo ""
