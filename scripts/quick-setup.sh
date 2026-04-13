#!/bin/bash

# Keeby Quick Setup - 快速配置脚本
# 支持多种方式快速获取和配置音效

set -e

SOUNDS_DIR="assets/sounds"
COLORS='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${COLORS}🎵 Keeby 音效配置${NC}"
echo "===================="
echo ""
echo "选择获取音效的方式:"
echo ""
echo "1️⃣  Freesound.org (我要手动下载真实音效)"
echo "2️⃣  自己录制 (我要用手机录制)"
echo "3️⃣  GitHub 资源 (我要从开源项目提取)"
echo "4️⃣  跳过 (保持占位符声音，仅用于测试)"
echo ""
read -p "请选择 (1-4): " choice

case $choice in
  1)
    echo ""
    echo "📖 Freesound 方案"
    echo "---"
    echo "1. 访问: https://freesound.org"
    echo "2. 搜索: 'Gateron Red mechanical keyboard'"
    echo "3. 下载 CC0 许可的 WAV 文件"
    echo "4. 保存到: $SOUNDS_DIR/gateron-red/keydown.wav"
    echo ""
    echo "重复上述步骤for:"
    echo "   • holy-panda (Holy Panda switch sound)"
    echo "   • alps-blue (Alps Blue switch sound)"
    echo "   • cream (NK Cream switch sound)"
    echo ""
    echo "✨ 文件结构:"
    tree "$SOUNDS_DIR" 2>/dev/null || find "$SOUNDS_DIR" -type f | sort | sed 's|^|   |'
    ;;

  2)
    echo ""
    echo "🎤 自己录制方案"
    echo "---"
    echo "步骤:"
    echo "1. 用手机语音备忘录录制 10 秒敲键盘声"
    echo "2. 用 GarageBand/Audacity 分离按下和释放声"
    echo "3. 导出为 WAV 格式到:"
    echo "   $SOUNDS_DIR/{gateron-red,holy-panda,alps-blue,cream}/{keydown,keyup}.wav"
    echo ""
    echo "📝 建议:"
    echo "   • 环境安静，靠近麦克风"
    echo "   • keydown: 完整的敲击声 (60-120ms)"
    echo "   • keyup: 仅释放的声音 (40-80ms)"
    ;;

  3)
    echo ""
    echo "📦 GitHub 开源项目"
    echo "---"
    echo "Mechvibes 项目: https://github.com/hainguyents13/mechvibes"
    echo ""
    echo "1. git clone https://github.com/hainguyents13/mechvibes.git temp-mechvibes"
    echo "2. 在 sounds/ 目录中找到对应的轴体"
    echo "3. 复制 OGG 文件到 $SOUNDS_DIR/"
    echo "4. 如需转换格式:"
    echo "   ffmpeg -i input.ogg -c:a libvorbis -q:a 8 output.ogg"
    ;;

  4)
    echo ""
    echo "✅ 保持占位符配置"
    echo "当前文件:"
    find "$SOUNDS_DIR" -name "*.wav" -o -name "*.ogg" | sort | sed 's|^|   ✓ |'
    echo ""
    echo "💡 这些占位符可用于测试。任何时候可以替换为真实音效。"
    ;;

  *)
    echo "❌ 无效选择"
    exit 1
    ;;
esac

echo ""
echo "===================="
echo "✨ 配置完成！"
echo ""
echo "下一步:"
echo "1. 启动应用: npm run dev"
echo "2. 选择轮廓试听"
echo "3. 如需更换音效，重复此流程"
echo ""
echo "📖 更多信息: 查看 INSTALL_SOUNDS.md"
