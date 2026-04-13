# 安装真实机械键盘音效

当前应用有 4 个轮廓的**占位符音效**（简单的测试音）。为了获得真实的机械键盘声音，有以下几种方案：

## 🚀 最快方案: 直接复制粘贴

### 方案 1: Freesound.org (推荐 ⭐⭐⭐)

**优点**: 最真实的录音，CC0 许可

**步骤** (5 分钟):

1. **访问** https://freesound.org（免费注册）

2. **下载音效** - 搜索每个轴体：
   ```
   搜索关键词:
   • "Gateron Red mechanical keyboard" - 线性轴 
   • "Holy Panda tactile keyboard" - 段落轴
   • "Alps Blue clicky keyboard" - 青轴
   • "NK Cream mechanical keyboard" - 线性轴
   ```

3. **选择 CC0 许可的音效** - 点击最具代表性的录音

4. **下载文件** - 保存为 WAV 格式

5. **保存位置**:
   ```
   assets/sounds/gateron-red/keydown.wav      (第一个下载的文件)
   assets/sounds/gateron-red/keyup.wav        (第二个下载的文件)
   assets/sounds/holy-panda/keydown.wav
   assets/sounds/holy-panda/keyup.wav
   assets/sounds/alps-blue/keydown.wav
   assets/sounds/alps-blue/keyup.wav
   assets/sounds/cream/keydown.wav
   assets/sounds/cream/keyup.wav
   ```

6. **重启应用**:
   ```bash
   npm run dev
   ```
   选择不同轮廓 → 应该听到新音效！

---

### 方案 2: 自己录制 (最经济)

**优点**: 100% 免费，个性化

**步骤** (10 分钟):

1. **用手机录制** 你自己的机械键盘：
   - 打开 iPhone 语音备忘录 或 Android 录音机
   - 靠近键盘，轻轻敲几十次按键
   - 录 5-10 秒即可

2. **编辑音频** (用 GarageBand, Audacity 等):
   - 打开录音
   - 分离 **按下声音** (keydown): 找到最清晰的敲击声，剪裁为 60-120ms
   - 分离 **释放声音** (keyup): 更短的声音，约 40-80ms

3. **导出**:
   - 格式: WAV 或 OGG
   - 采样率: 44100 Hz
   - 比特率: 128 kbps 或更高

4. **保存** 到 `assets/sounds/` 对应的目录

---

### 方案 3: GitHub 开源项目

**Mechvibes 项目** (完整音效包)

访问: https://github.com/hainguyents13/mechvibes

步骤:
1. Clone 项目: `git clone https://github.com/hainguyents13/mechvibes.git`
2. 找到 `sounds/` 或 `resources/` 目录
3. 提取对应的轴体 OGG 文件
4. 复制到 `assets/sounds/`
5. 如需转换格式:
   ```bash
   ffmpeg -i input.ogg -c:a libvorbis -q:a 8 output.ogg
   ```

---

### 方案 4: 在线工具

**KeyboardSounds.net** - 已有完整轮廓

访问: https://keyboardsounds.net/

- 提供预制的轴体声音
- 可直接下载为 OGG 格式
- 无需注册

---

## 📁 正确的文件结构

```
assets/sounds/
├── gateron-red/
│   ├── keydown.wav  ← 按下声音（60-120ms）
│   └── keyup.wav    ← 释放声音（40-80ms）
├── holy-panda/
│   ├── keydown.wav
│   └── keyup.wav
├── alps-blue/
│   ├── keydown.wav
│   └── keyup.wav
└── cream/
    ├── keydown.wav
    └── keyup.wav
```

## 🎯 音效要求

| 参数 | 要求 |
|------|------|
| **格式** | WAV, OGG, MP3, FLAC |
| **采样率** | 44100 Hz (任何都可用，但这个最常见) |
| **声道** | 单声道或立体声都行 |
| **按下时长** | 60-120 毫秒 |
| **释放时长** | 40-80 毫秒 |
| **响度** | 规范化至 -3dB 最佳 |

## ✅ 验证

添加文件后，重启应用并：

1. 打开 Keeby
2. 从下拉菜单选择一个轮廓
3. **敲键盘** → 应该听到对应的音效
4. **切换轮廓** → 声音应该改变

## 🛠️ 格式转换

如果下载的是 MP3/OGG 需要转换:

### 用 ffmpeg (安装: `brew install ffmpeg`)

```bash
# MP3 → WAV
ffmpeg -i input.mp3 -acodec pcm_s16le -ar 44100 output.wav

# OGG → WAV
ffmpeg -i input.ogg -acodec pcm_s16le -ar 44100 output.wav

# WAV → OGG (更小的文件)
ffmpeg -i input.wav -q:a 8 output.ogg
```

### 用 Audacity (图形界面)
1. 文件 → 打开音频文件
2. 编辑 → 选中全部
3. 效果 → 标准化 (减少到 -3dB)
4. 文件 → 导出 → 选择格式

---

## 💡 建议

**最简单**: 直接从 Freesound 下载 2-3 个通用键盘声音，对所有轮廓使用相同音效

**最真实**: 为每个轮廓找到对应的轴体声音（Freesound 有很多特定轴体的录音）

**最个性**: 用自己的键盘录制（录一次，多次使用）

---

## 🆘 故障排查

| 问题 | 解决方案 |
|------|------|
| 添加文件后还是没声音 | 重启应用、检查文件名是否正确（必须是 keydown/keyup） |
| 声音太小 | 调整应用的音量滑块，或用 ffmpeg 提升音频 |
| 文件格式不支持 | 改为 WAV 或 OGG 格式 |
| 不知道哪个文件是按下/释放 | 在 Audacity 中预听，按时长判断（短 = keyup） |

---

**有问题?** 参考主目录的 `SOUNDS.md` 或 `GETTING_STARTED.md`
