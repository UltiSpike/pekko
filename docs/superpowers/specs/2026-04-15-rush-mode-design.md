# Rush Mode 设计规范

**日期**：2026-04-15
**作者**：pochita / Claude
**状态**：设计锁定，待评审

---

## 1. 目标与定位

给 Pekko 增加**音游式按键反馈体验**，让打字时获得类似 QQ 炫舞的连击 / 上头感，**不引入背景音乐、不引入独立游戏窗口、不打破用户现有工作流**——用户可能在听自己的音乐、在自己的编辑器里打字，Pekko 只是让**每一击的反馈**产生"连击堆叠、进入状态"的感觉。

### 使用定位

> **为冲刺时刻设计，不是长跑**（"Built for sprints, not marathons"）

Pekko 现有 4 个 Mode（Deep Focus / Cozy Writing / Thock / Classic Mech）都是长会话友好型。Rush 填补产品阵容里缺失的"**短时爆发**"档位。用户知道自己在冲刺、知道这是短时体验、不适合当 Cozy 的替代品——这个**预期管理直接写进 Mode 描述**，由此解除疲劳衰减的必要性（见 §7）。

### 非目标

- ❌ 不是独立游戏（无窗口、无谱面、无评分屏）
- ❌ 不引入背景音乐（用户自带）
- ❌ 不是节拍游戏（无 beat grid 量化判定，"按下即响"是硬规则）
- ❌ 不打破心流（无中心屏幕特效、无文字弹窗、无全屏 overlay）
- ❌ 不支持长会话持续使用（用户自行感知节奏）

---

## 2. 架构总览

Arcade feedback 是**引擎能力**，不是一种 Mode。两个入口：

1. **Rush Mode**（第 5 个 preset）：curated 打包完整体验，`arcadeEnabled: true` 默认 ON，配 `STYLE.rush` DSP + `bed: none`
2. **Custom Mode**：新增配置项 `customArcadeEnabled`，用户可在自己的 DSP 调音之上 opt-in arcade feedback

这个对偶与现有 `bed: BedType` 的设计同构——bed 既是 Cozy / Focus 的 curated 组成，也是 Custom 的可调项。

### 组件划分

```
 Main (Electron)                            Renderer (React)
 ┌────────────────────────┐              ┌──────────────────────────────┐
 │  TrayIconController    │◄─ rAF-batch ─│  ArcadeHudController        │
 │  (icon state: color,   │              │  (combo→icon stage mapping,  │
 │   pulse rate, flash)   │              │   2s PERFECT cooldown)      │
 │                        │              │                              │
 │                        │              │  AudioEngine                 │
 │                        │              │   ├─ main 24-voice pool     │
 │                        │              │   └─ ArcadeOverlayLayer     │
 │                        │              │        ├─ 12-voice pool     │
 │                        │              │        ├─ combo logic       │
 │                        │              │        ├─ PERFECT detector  │
 │                        │              │        └─ overlay bus       │
 │                        │              │          (bypass compressor)│
 └────────────────────────┘              └──────────────────────────────┘
```

### 激活条件

```
currentMode.arcadeEnabled === true
  ├─ ArcadeOverlayLayer.activate()   (解码采样、allocate 12-voice pool)
  └─ ArcadeHudController.activate()  (托盘图标开始接收状态)
```

切回 `arcadeEnabled: false` 时两者 teardown（释放 overlay pool、托盘图标恢复默认）。

---

## 3. 数据模型

### `Mode` 接口扩展

在 `src/shared/modes.ts` 中：

```ts
interface Mode {
  id: string
  name: string
  subtitle: string
  description: string
  bed: BedType
  bedGainDb: number
  style: ModeStyle
  arcadeEnabled: boolean  // NEW
}
```

4 个现有 preset 硬编码 `arcadeEnabled: false`。

### Rush Mode 定义

```ts
{
  id: 'rush',
  name: 'Rush',
  subtitle: 'Combo overlay · momentum HUD',
  description: 'Percussive hits stack with combo, pulse tracks the flow. Built for sprints, not marathons.',
  bed: 'none',
  bedGainDb: -80,
  style: STYLE.rush,
  arcadeEnabled: true,
}
```

### `STYLE.rush` 定义

```ts
rush: {
  pitchJitter: 0.010,
  volumeJitter: 0.05,
  intensityLocked: true,
  airLpfHz: 14000,
  highShelfDb: 1.5,
  lowShelfDb: 1.5,
  wetMix: 0.10,
}
```

所有字段在 `CUSTOM_RANGE` 可调范围内——Custom Mode 用户能完全复现 Rush 的 DSP。

**关键非直觉决策 · `intensityLocked: true`**：避免"力度变化 + combo 层数变化"两个强度维度互相稀释。锁死 intensity，让 combo 成为**唯一**强度变量。

### `AppSettings` 扩展

```ts
interface AppSettings {
  // ... 现有字段
  customArcadeEnabled: boolean  // NEW, 默认 false
}
```

`buildCustomMode(style, bed, bedGainDb)` 扩展为 `buildCustomMode(style, bed, bedGainDb, arcadeEnabled)`，透传至 `Mode.arcadeEnabled`。

---

## 4. Combo 机制

### 判定（方案 γ：混合）

两个维度分离：
- **Combo 数**：用**连续性**计——相邻两键 inter-key interval ≤ 600ms → combo + 1；> 600ms 或停手 → reset 为 0
- **PERFECT 评级**：用**节奏稳定度**判——最近 8 键 inter-key 方差 / 均值 < 0.15 → 触发

思考型场景（写代码、写作）combo 能涨（只要你在敲），进入打字 flow 时额外获得 PERFECT 奖励。双路径都能通。

### 阈值参数

| 参数 | 值 | 理由 |
|-----|---|------|
| Combo reset interval | **600ms** | 100 WPM 间隔 ~120ms，留 5× 缓冲容忍意图停顿 |
| PERFECT 窗口大小 | 最近 **8** 键 | 太小容易 false-positive，太大反应迟钝 |
| PERFECT 阈值 | `σ/μ < 0.15`（15%）| 方差 / 均值比，尺度无关 |
| PERFECT 冷却 | **2 秒** | 避免锁定状态下连续闪烁 |

### 状态重置

切换 Mode（Rush ↔ 其他）时 combo 立即清零，L4 pad 淡出 500ms——**Mode 切换即新会话**，不跨 Mode 保留 combo。

---

## 5. Overlay 鼓组分档（D3 核心）

**核心原则**：一条清晰的 escalation 曲线，combo = 唯一强度变量，频段分工避免层间互相糊。

### 四层结构

| # | 层 | 阈值 | 触发 | 采样 | 基础音量 | 淡入 | 频段 |
|---|---|-----|------|-----|---------|------|------|
| L1 | **Kick** | combo ≥ 2 | 每击 | 软合成 kick，无 click，~120ms tail | −15 dB | 300ms | 60–120 Hz |
| L2 | **Clap** | combo ≥ 10 | 每击 | 短 clap / rimshot，~80ms | −12 dB | 300ms | 1–3 kHz |
| L3 | **Closed Hat** | combo ≥ 25 | 每击 | brushed 闭镲，~40ms | −18 dB | 400ms | 8–10 kHz |
| L4 | **Shimmer Swell** | combo ≥ 50 | 持续（非每击） | 宽频轻薄 pad，loop | −20 dB | 1s attack / 500ms release | 4–6 kHz |

### 每层设计要点

**Kick (L1)**
- 软合成 kick，**去掉 attack click**（轴体音已有 click，重复 click 会打架）
- tail <150ms 避免高 WPM 时堆积成 sub buzz
- Pan 正中，不跟随 key-pan

**Clap (L2)**
- 短 clap 或 rimshot，**避开 snare**（snare 容易和 `springNotch @2.5kHz` 撞）
- 80ms 以内干声，无 per-层 reverb（reverb 由 L4 负责）

**Closed Hat (L3)**
- 闭镲，**不用 open hat**（尾太长，高 WPM 下糊成连片 hiss）
- 音量最轻，高频疲劳控制

**Shimmer Swell (L4)**
- **非打击**——这是"进入 zone"的氛围 reward
- 宽频轻薄 pad，高频有光感（类似 reverse cymbal swell 尾声）
- 1s 缓入 → 渐现 "我进 zone 了" 的感知

### 音量预算

```
overlayMasterGain = -6 dB (相对主音)
  ├─ L1 kick:   -15 dB (层内相对)
  ├─ L2 clap:   -12 dB
  ├─ L3 hat:    -18 dB
  └─ L4 swell:  -20 dB
```

确保轴体音色始终占主导，overlay 是配角。

### 禁止项

Overlay 层**不做**以下任何一项：
- ❌ Pitch jitter（combo 是唯一强度变量）
- ❌ Key-based pan（overlay 是 meta 层，不绑定按键空间）
- ❌ Velocity / intensity 变化（`STYLE.rush` 已锁 intensity）
- ❌ 节拍量化（按下即响，硬规则）

---

## 6. HUD（托盘图标动效）

**严格遵守**：Pekko 的心流守则——**只留在视觉外围**，无数字、无文字、无窗口浮层、无屏幕中心元素。

### 图标状态机（与 overlay 阈值严格对齐）

| Combo | Overlay | 托盘图标 | 语义 |
|------|---------|---------|-----|
| 0–1 | 无 | 原色静止 | idle |
| 2–9 | + L1 kick | 暖色微染 20% 饱和 | 启动 |
| 10–24 | + L2 clap | 暖色加深 50% 饱和 | 堆叠中 |
| 25–49 | + L3 hat | 慢脉冲（2s/cycle）| flow |
| 50+ | + L4 swell | 快脉冲（1s/cycle）| zone |

**PERFECT 触发**：亮闪 200ms（当前阶梯饱和度 +30%）后回复——2s 冷却避免连续闪烁。

**Combo 断开**：500ms 淡回原色，**不闪**——悄悄退场，不打扰。

### 工程实现

- 渲染进程 `ArcadeHudController` 持有图标状态
- `requestAnimationFrame` batch，**~16ms 节流**，避免 IPC 风暴
- `ipcRenderer.send`（**不是 invoke**）——fire-and-forget，不阻塞音频线程
- Main 进程 `TrayIconController` 接收状态，更新 `Tray.setImage()` / `Tray.setTitle()`

托盘图标动效逻辑即使 main 进程慢 50ms 也不影响音频延迟（音频已经 scheduled 并播放）。

---

## 7. 疲劳衰减

**Rush Mode 砍掉 D6 疲劳衰减**（不同于现有 `updateAdaptiveVolume()` 对其他 Mode 的处理）。

### 理由

- "Rush" 名字天生绑定"不降温"预期
- 30 秒后自动拉低音量 → 用户觉得"说好的 Rush 呢"
- Mode 描述 `Built for sprints, not marathons` 已做预期管理——用户知道这是短时体验
- Pekko 已有 3 个长会话友好 Mode（Focus / Cozy / Thock），缺的就是一个"短时爆发"档位

### 实现

- `STYLE.rush` + `arcadeEnabled` 组合时，`updateAdaptiveVolume()` 对 Rush 短路（`adaptiveMultiplier = 1.0` 恒定）
- Custom Mode 下 `customArcadeEnabled: true` 时是否砍衰减？**保留衰减**（Custom 的语义是"用户自定义"，不随 arcade toggle 影响现有 DSP 行为）

### 安全边界（不因为砍衰减就"无上限"）

- 现有主路径 compressor 仍然在（限幅保护）
- Overlay 总线 -6 dB 相对主音，不会因为 arcade 开启就整体变响
- 用户仍可通过 Volume slider 控制总音量

---

## 8. 采样包策略（D8）

### 混合策略

| 层 | 来源 | 理由 |
|---|-----|------|
| L1 Kick | **Web Audio 合成** | sine 60Hz + envelope，参数可调，零 license，体积为零 |
| L2 Clap | **CC0 采样** | 合成 clap 不够"人声感"，用 freesound.org CC0 资源精选 |
| L3 Hat | **Web Audio 合成** | filtered noise + envelope，参数可调 |
| L4 Swell | **CC0 采样** | 复杂和声纹理合成困难，用 CC0 reverse cymbal / shimmer pad |

### License

- CC0 采样：无归属要求，但会在 `NOTICE` 中列出来源作为礼貌性致谢
- 合成采样：代码生成，无 license 负担

### 文件组织

```
src/renderer/audio/arcade/
├── synth/
│   ├── kick.ts      (生成 120ms kick AudioBuffer)
│   └── hat.ts       (生成 40ms closed-hat AudioBuffer)
└── samples/
    ├── clap.wav     (~80ms CC0)
    └── swell.wav    (~2s CC0, looped)
```

采样体积预算：**总计 < 200 KB**。

### 预加载时机

Rush Mode 激活时（或 Custom + arcade toggle 切开时）一次性：
1. 运行 synth 函数生成 kick + hat AudioBuffer
2. `decodeAudioData` 解码 clap + swell
3. 全部缓存至 `ArcadeOverlayLayer` 实例

后续 hot path 零 I/O。

---

## 9. 延迟保证（6 条硬规则）

**承诺**：Rush Mode 维持 Pekko 现有 <10ms 端到端延迟，单键 `SCHEDULE_OFFSET = 2ms` 不变。

| # | 规则 | 违反后果 |
|---|------|---------|
| R1 | Overlay 采样**预解码**（Mode 激活时一次性） | hot path I/O，延迟不可控 |
| R2 | Overlay 层与主音**同 `playTime`** 调度 | 感知延迟叠加 |
| R3 | **独立 overlay 声部池**（12 voices，和主 24 池隔离） | combo 高时挤占主池，触发 8ms 偷声部 click |
| R4 | Overlay 总线**绕过主压缩器**，直连 destination | 打击层触发 compressor pump，主音被挤弱 |
| R5 | 托盘图标更新 **`ipcRenderer.send` + rAF 节流** | 阻塞音频线程或 IPC 风暴 |
| R6 | **禁止节拍量化**——按下即响 | 引入最多一个 beat 的滞后 |

### 会涨延迟的坑（不踩）

- ❌ 按键同步做 DOM 改动（HUD 更新必须 rAF batch）
- ❌ 新 FX 插入主 dry 路径
- ❌ overlay 走 `invoke` 回 main 再播
- ❌ 任何 per-press 异步 I/O

### 容量核算

Combo 50+ 满层情况，150 WPM：
- 4 层 × 12.5 keys/sec = 50 overlay voices/sec spawning
- 每层 tail ~40–150ms → ~7.5 concurrent voices 平均
- 12-voice 独立池容纳充分

Combo 100+ 场景无额外声部压力（阈值只到 50）。

---

## 10. 用户体验流程

### 首次使用

1. 用户按 `‹` `›` 循环到 **Rush** Mode
2. `ArcadeOverlayLayer.activate()` 同步返回（采样预加载 <100ms）
3. 托盘图标切回默认静止态（combo = 0）
4. 用户开始打字——combo 2 时首次感受到 kick overlay 和图标微染

### 正常使用

```
用户敲 "the quick brown fox" (18 字符)
  ↓
combo 涨：1, 2 [kick↑], ..., 10 [clap↑], ..., 18
图标：静 → 暖微染（20%）→ 暖加深（50%）
声音：轴体音 → +kick → +kick+clap
```

### PERFECT 场景

```
用户进入节奏稳定的连续打字（σ/μ < 0.15）
  ↓
图标亮闪 200ms（饱和 +30%）→ 回当前阶梯
音频无变化（纯视觉奖励，避免打断节奏）
  ↓
2s 冷却后可再次触发
```

### Combo 断开

```
用户停手 800ms（思考或切窗口）
  ↓
combo 立即 reset = 0
L1-L3 下次按键不触发（阈值 ≥ 2）
L4 swell 500ms 淡出
图标 500ms 淡回原色（不闪）
```

### 切出 Rush Mode

```
用户按 `›` 切到 Thock
  ↓
ArcadeOverlayLayer.deactivate()
  ├─ 所有 overlay voices fade-out + release
  ├─ 12-voice pool 释放
  └─ overlayBus 断开
ArcadeHudController.deactivate()
  └─ 托盘图标 setImage 回默认
```

---

## 11. 不做的事（YAGNI 清单）

v1 明确不做，未来可议：

- ❌ 用户自定义采样包（v1 内置，后续可议）
- ❌ Combo 阈值可调（v1 写死 2/10/25/50）
- ❌ Overlay 音量 slider（v1 固定音量预算）
- ❌ "GREAT" 中间级判定（二值锁定 / 未锁定足够）
- ❌ 历史最高 combo 记录 / 统计
- ❌ 社交分享 / 截图
- ❌ 节拍游戏化 / 谱面
- ❌ Arcade Mode 的 style 变体（subtle / full 档）
- ❌ 跨 Mode 保留 combo 状态

---

## 12. 开放项

以下点未在本 spec 完全敲定，实现阶段再决：

1. **具体 CC0 采样文件**——到 freesound.org 实际挑选时再定（clap + swell 各 1-2 个备选）
2. **合成 kick / hat 的参数**——基于 DAW A/B 或 Web Audio 直接试听调音，体感优先
3. **托盘图标的"暖色"**——具体 hue 实现时 A/B（考虑 macOS light/dark menu bar 两套）
4. **Pulse 动画曲线**——`ease-in-out` 还是 `sine`，实现阶段对比
5. **CC0 采样是否预打包进 app bundle** 还是首次激活时从某处下载——v1 预打包，体积预算 <200 KB 容得下

---

## 13. 验收标准

实现完成的评判：

1. 切到 Rush Mode，连续打字 10+ 键：听感上叠加 kick 清晰可辨
2. 连续打字 25+ 键：clap 加入，音色变厚
3. 连续打字 50+ 键：能听到 shimmer pad 铺底
4. 停手 600ms+：所有 overlay 层干净退出，无残留
5. 单键延迟测量（`AudioContext.outputLatency + baseLatency + SCHEDULE_OFFSET`）与 Thock Mode **差异 ≤ 0.5ms**
6. 切到 Classic Mech / Thock：托盘图标恢复默认、overlay pool 完全释放（内存测量）
7. Custom Mode 开启 `customArcadeEnabled`：overlay + HUD 行为与 Rush Mode 一致
8. 连续打字 5 分钟：无 voice starvation、无 compressor pump、无 click artifacts

---

## 附录 A · 决策索引

| ID | 决策 | 结论 |
|---|-----|------|
| D1 | Mode 名字 | **Rush** |
| D2 | Combo 判定 | γ 混合（连续性 + 稳定度分离）|
| D3 | Overlay 鼓组分档 | 4 层 @ combo 2/10/25/50 |
| D4 | PERFECT 判定 | 最近 8 键 σ/μ < 0.15，2s 冷却 |
| D5 | HUD 形态 | 仅托盘图标动效，无数字/文字/浮层 |
| D6 | 疲劳衰减 | Rush 下砍掉，sprint-mode 定位 |
| D7 | Bed（Rush Mode）| `none` |
| D8 | 采样来源 | 合成 + CC0 混合 |
| D9 | `STYLE.rush` | 独立定义，bright + 干 + 轻 body |
| D10 | 架构归属 | Rush 是独立 Mode + Custom 有 toggle |

## 附录 B · 与现有系统的对接点

- `src/shared/modes.ts`：扩 `Mode` 接口、新增 `STYLE.rush` / Rush Mode 定义、扩 `buildCustomMode`
- `src/renderer/audio/AudioEngine.ts`：`playSound()` 调用 `overlayLayer.onKeypress()`；`setMode()` 切换时 activate / deactivate
- `src/renderer/audio/arcade/`（新）：`ArcadeOverlayLayer.ts` + `ArcadeHudController.ts` + `synth/*` + `samples/*`
- `src/main/tray.ts`：新增 IPC handler 接收 hud state 更新图标
- `src/main/preload.ts`：新增 `updateArcadeHud(state)` 到 contextBridge 白名单
- `src/main/store.ts`：`AppSettings.customArcadeEnabled` 字段持久化

## 附录 C · 音游元素取舍

| 元素 | Rush 采纳 | 理由 |
|-----|----------|-----|
| 每击叠打击采样 | ✅ | 核心爽点 |
| Combo 越高音色越厚 | ✅ | 核心爽点 |
| Combo 计数 | ✅（隐式，不显示）| 内部状态 |
| 边缘脉冲 / 屏幕涟漪 | ❌ | 打破心流 |
| PERFECT / GREAT 文字 | ❌ | 打破心流 |
| 音高量化（C-E-G）| ❌ | 和用户自带音乐调性冲突 |
| 背景乐 / 谱面 / 评分 | ❌ | 已排除 |
| 节拍量化判定 | ❌ | 引入延迟 |
