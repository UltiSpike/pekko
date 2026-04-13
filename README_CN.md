<div align="center">

<img src="assets/icons/pekko.iconset/icon_256x256.png" width="128" />

# Pekko

**打字的质感。**

macOS 键盘音效引擎 · 开源 · 完全离线

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Apache_2.0-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/UltiSpike/pekko/releases"><img src="https://img.shields.io/badge/v0.1.0-green?style=flat-square" alt="Version" /></a>
  <img src="https://img.shields.io/badge/macOS_11+-000?style=flat-square&logo=apple&logoColor=white" alt="macOS" />
</p>

</div>

&nbsp;

<!-- TODO: 录屏 — 30s，展示启动→打字→切轴→切主题的完整流程 -->
<!-- <p align="center"><img src="assets/preview.gif" width="640" /></p> -->

Cherry 蓝轴清脆的段落声。Topre 柔韧的触底。Holy Panda 回弹时短促的高频。

十三种轴体录音，经空间声学引擎逐键定位在立体声场上。每一声，都在它该在的位置。

&nbsp;

```bash
git clone https://github.com/UltiSpike/pekko.git && cd pekko && npm i && npm run dev
```

`←` `→` 切换轴体 · `Q` `E` 切换主题 · `⇧⌘K` 全局开关

<sub>macOS 11+ / Node 18+ / 首次启动需授予辅助功能权限 — 仅读取键码，不读取输入内容（<a href="PRIVACY.md">隐私声明</a>）</sub>

&nbsp;

---

&nbsp;

## 声学引擎

每次按键经过一条完整的房间声学处理链。低频塑形还原轴体的物理重量；中高频校正去除录音的数码刺感；12 毫秒延迟层模拟声音从桌面弹回的路径；104 个键按物理位置分布在立体声场的左右声道上。

连续打字时，引擎自动衰减音量至稳态，停顿后回满。按键间隔越短力度越轻，越长越重。环境层以极低电平的棕噪声补充房间感。24 声部预分配，按键瞬间零分配、零 GC。端到端延迟低于 10 毫秒。

<details>
<summary>信号链与参数</summary>

&nbsp;

```
                       ┌──── 干声 (88%) ────┐
  主增益 ──────────────┤                    ├── 低频搁架 ── 中频凹陷 ── 高频搁架 ── 空气LPF ── 压缩器 ──▶ 输出
                       └── 12ms 延迟 ── 桌面LPF ── 湿声 (12%) ──┘
```

| 节点 | 参数 |
|------|------|
| 低频搁架 | +2.5 dB @ 180 Hz |
| 中频凹陷 | -3 dB @ 3.8 kHz, Q 1.5 |
| 高频搁架 | +0.5 dB @ 9 kHz |
| 空气低通 | 13 kHz, Q 0.5 |
| 桌面反射 | 12ms delay → 3.5 kHz LPF, 12% wet |
| 压缩器 | -18 dB threshold, 2.5:1, 35ms attack |
| 环境层 | 棕噪声, 800 Hz bandpass, -35 dB |

</details>

&nbsp;

---

&nbsp;

## 十三种轴体，六套主题

Cherry MX Black · Blue · Brown · Red · NK Cream · Topre Purple · Holy Panda · Buckling Spring · Box Navy · Gateron Red Ink · Blue Alps · Turquoise · Alpaca

Catppuccin · Tokyo Night · Rosé Pine · Nord · Dracula · Gruvbox

每把轴的音色差异来自录音本身。空间感、厚度、动态响应 —— 来自引擎。

&nbsp;

---

&nbsp;

## 拆开它

Pekko 的每一层都可以打开。

**轴体录音** — 把音频文件和 `config.json` 放进 `assets/sounds-hq/<id>/`，在 `profiles/index.json` 注册，启动即可。支持 sprite、multi、kbsim 三种格式。

**引擎参数** — EQ 频点、压缩比、反射延迟、底噪电平，全在 [`AudioEngine.ts`](src/renderer/audio/AudioEngine.ts)。

**视觉主题** — CSS 变量 + `data-theme`，一组颜色值就是一套新主题。

[SOUNDS.md](SOUNDS.md) · [DESIGN.md](DESIGN.md)

&nbsp;

---

&nbsp;

<details>
<summary>架构</summary>

&nbsp;

```
  Main (Electron)                            Renderer (React)
 ┌────────────────────────┐              ┌───────────────────────────┐
 │  uiohook-napi ──────── MessagePort ──▶  AudioEngine              │
 │  (全局键盘钩子)         │              │  (24 声部池, StereoPanner) │
 │  IPC Handlers ◄────── invoke ────────▶  React UI                 │
 │  Tray · Store (JSON)   │              │  (NES.css + 毛玻璃)       │
 └────────────────────────┘              └───────────────────────────┘
```

```
src/
├── main/
│   ├── index.ts             # 生命周期、全局快捷键
│   ├── keyboard.ts          # uiohook → MessagePort
│   ├── ipc-handlers.ts      # 音效包加载（白名单 + 路径安全）
│   ├── preload.ts           # contextBridge (7 methods)
│   ├── store.ts             # JSON 持久化
│   └── tray.ts              # 托盘菜单
├── renderer/
│   ├── audio/AudioEngine.ts # 心理声学引擎
│   ├── components/          # UI 组件
│   └── hooks/               # useAudioEngine, useProfiles
└── shared/
    ├── types.ts
    └── key-positions.ts     # 104 键声像映射
```

</details>

<details>
<summary>安全</summary>

&nbsp;

完全离线。代码库中没有 `fetch`、`http` 或任何出站调用。

`contextIsolation: true` · `nodeIntegration: false` · `contextBridge` 暴露 7 个只读方法 · Profile ID 白名单校验 + 路径遍历拦截。

</details>

<details>
<summary>开发命令</summary>

&nbsp;

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite + Electron 开发模式 |
| `npm run dev:debug` | 同上 + DevTools |
| `npm run build` | 构建 |
| `npm run package` | 打包 .dmg + .zip (arm64 & x64) |

</details>

&nbsp;

---

&nbsp;

[贡献](CONTRIBUTING.md) · [Mechvibes](https://mechvibes.com) · [uiohook-napi](https://github.com/nickolay/uiohook-napi) · [NES.css](https://nostalgic-css.github.io/NES.css/)

[Apache 2.0](LICENSE) — 音效包遵循各自许可（[NOTICE](NOTICE)）
