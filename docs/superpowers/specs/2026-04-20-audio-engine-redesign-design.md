# Pekko 声音引擎重新设计

- **Date**: 2026-04-20
- **Status**: Design approved, pending implementation plan
- **Author**: brainstormed with Claude (superpowers:brainstorming)
- **Supersedes**: 当前 `src/renderer/audio/AudioEngine.ts` + `src/renderer/hooks/useAudioEngine.ts` + `src/main/keyboard.ts` 里的音频相关部分

---

## 1. 问题与目标

### 1.1 问题陈述

用户反馈"经常没声音"，且 8 类触发器（冷启动、sleep/wake、锁屏、切 mode、切 profile、mute toggle、使用中随机、HMR）**全部出现过**。这不是单点 bug，而是系统性脆弱。

### 1.2 根因分析（当前架构的结构性问题）

| # | 问题 | 后果 |
|---|------|------|
| 1 | 单例 `AudioEngine` + `destroy()` 写在 `useAudioEngine` 的 useEffect cleanup | React strict mode 会 init→destroy→init；destroy 可能在 loadProfile 完成前触发 |
| 2 | God object：一个类负责 DSP / 采样 / 加载 / 分析 / 电源 / arcade 动画，近 820 行 | 任何一块坏都拖死整条链路 |
| 3 | `playSound` 5 条 early-return（`_enabled`、ctx、masterGain、pack、buffer）均静默失败 | 用户无感，只能重启 app |
| 4 | `playSound` 里 `if (type === 'repeat')` 整段重复两次（L486–516, L525–556），疑似合并冲突遗留 | 代码腐败信号 |
| 5 | MessagePort 无握手：一次性 postMessage，renderer reload/HMR/崩溃后无法重建 | 键桥一断就永断 |
| 6 | `resume()` 与 `wake()` 并存，各自判 state 又互相触发 | 并发 wake 会 destroy 正在 playSound 的 engine |
| 7 | 无显式状态机：ctx.state × `_enabled` × pack loaded × masterGain ≈ 5 维布尔 | 32 种组合无不变式，无法推理"此刻能不能出声" |
| 8 | Web Audio 在 Electron 桌面场景的结构性问题：autoplay policy、后台节流、CoreAudio 设备绑定丢失 | 单纯修 renderer 代码无法根治 a/b/c 类失败 |

### 1.3 目标

1. **可靠性优先**：目标是消除 §1.1 列出的全部 8 类失败模式——
   - a (冷启动)、b (sleep/wake)、c (锁屏) → 通过"音频在 main 进程 + 每次 wake 强制 close→open"根治
   - d (切 mode)、e (切 profile) → 通过 Lifecycle FSM + ramp 防 click 根治
   - f (mute toggle) → 通过"mute 只改 gain 不改 FSM"根治
   - g (随机静音) → 通过状态机 + 可观测性消除（如真发生，用户能看见 Failed 并 Retry）
   - h (HMR) → 通过"音频脱离 renderer 生命周期"根治
2. **可维护性**：把 god object 拆成 ≤ 200 行的 7 个模块，纯逻辑与副作用分离，可单测。
3. **可观测**：失败不再静默——进入 Failed 状态时托盘图标暗红 + HelpPanel 提供诊断与 Retry。

### 1.4 非目标（YAGNI）

- 不设计插件系统
- 不支持多输出设备
- 不做录音 / 实时监听 / MIDI
- 不测 DSP 频响曲线（已由耳朵调过）
- 不重写 arcade combo / synth 内部（已有 `combo.test.ts` / `synth.test.ts`，保留）

---

## 2. 关键决策

| 决策 | 选项 | 取舍 |
|---|---|---|
| 方案类型 | **B. 把音频搬进 main 进程（native audio 原生绑定）** | 相对 A（原地重构）能根治 a/b/c 类失败（AudioContext autoplay / 后台节流 / 设备绑定）；相对 C（双进程协议）彻底解决 god object |
| 范围 | **B. 按键声 + 电源生命周期 + arcade 边界** | arcade overlay 内部合成不动；UI sounds (`uiSounds.ts`) 不动 |
| Arcade overlay 位置 | **先留 renderer（combo 判定搬 main，合成留 renderer）** | 隔离更干净；spike 时测延迟，可接受就定型；若不可接受再搬进 main |
| 安全网 | **双轨并行 ≥ 2 周 + spike 失败回退到方案 A** | 可回退 |

---

## 3. 架构

### 3.1 进程边界

```
┌──────────────── MAIN PROCESS (Node) ────────────────┐
│                                                     │
│  uiohook-napi ──► KeySource (现有)                  │
│                     │                               │
│                     ▼                               │
│           ┌─────────────────────┐                   │
│           │  AudioCoreService   │◄── IPC commands   │
│           │   (新, native)      │                   │
│           │                     │                   │
│           │  ┌───────────────┐  │                   │
│           │  │ KeySampler    │  │                   │
│           │  │ TypingAnalyt. │  │                   │
│           │  │ AudioGraph    │──┼──► 原生音频库     │
│           │  │ Lifecycle FSM │  │    (miniaudio /   │
│           │  │ SoundPackStore│  │     PortAudio)    │
│           │  │ ComboMachine  │  │         │         │
│           │  └───────────────┘  │         ▼         │
│           └──────────┬──────────┘  ┌───────────────┐│
│                      │             │ CoreAudio /   ││
│                      │             │ WASAPI / ALSA ││
│                      │             └───────────────┘│
│                      ▼                              │
│             AudioState broadcast                    │
└──────────────────────┼──────────────────────────────┘
                       │ ipcRenderer events
                       ▼
┌──────────────── RENDERER (UI only) ─────────────────┐
│  useAudioState() — 订阅 health / wpm / typing       │
│  Tune / Mode picker / HelpPanel / TrayIconState     │
│  ArcadeOverlayLayer (4-voice synth) + HUD           │
│     ↑ 订阅 main 的 combo stage 事件                  │
└─────────────────────────────────────────────────────┘
```

### 3.2 边界原则

| 层 | 职责 | 不负责 |
|---|---|---|
| Main / KeySource | 捕获 OS 键事件、hold-repeat 过滤 | 决定音色 |
| Main / AudioCoreService | 键→音全链路（选 buffer、DSP、调度、输出） + combo 状态机 | UI 呈现 |
| Renderer | UI、Mode/DSP 选择、arcade 合成与 HUD | 音频生命周期 |

### 3.3 vs 当前架构的关键变化

1. **MessagePort 消失**：键事件不再跨进程到音频层；renderer reload/HMR 不再能"断音"。
2. **React lifecycle 脱钩**：engine 生命周期 = app 生命周期，不再因 useEffect cleanup 被 destroy。
3. **AudioState 唯一权威**：main 持状态，renderer 只订阅。
4. **Arcade 拆两半**：combo 判定在 main / AudioCoreService；视觉合成与 HUD 留 renderer；通过 IPC 事件推 combo stage（延迟预计 1–3ms，spike 验证）。

---

## 4. 模块拆分

### 4.1 目录结构

```
src/main/audio/
├── index.ts               — AudioCoreService 门面（对外唯一入口）
├── AudioGraph.ts          — 原生 mixer + DSP 链封装
├── SoundPackStore.ts      — 采样加载 / 缓存 / 查询
├── KeySampler.ts          — keycode+type → buffer + 播放参数（纯）
├── TypingAnalytics.ts     — intensity / WPM / 疲劳衰减（纯）
├── Lifecycle.ts           — FSM + 电源自愈
├── ComboMachine.ts        — arcade combo 状态机（从 renderer 迁移）
├── bindings/
│   ├── types.ts           — AudioBackend 接口
│   └── miniaudio.ts       — 实现（或 portaudio.ts，spike 后定）
└── __tests__/             — 纯逻辑单测
```

### 4.2 模块 API 摘要

| 模块 | 公开 API（摘要） | 依赖 | 纯度 |
|---|---|---|---|
| **AudioCoreService** | `start()` `stop()` `onKey(kc, type, tsMs)` `setMode(m)` `setProfile(id)` `setVolume(v)` `setEnabled(b)` `applySwitchDsp(d)` `manualRetry()` `getState()` `on(event, cb)` | 下面所有 | 编排 |
| **AudioGraph** | `init()` `playBuffer(buf, params)` `rampFilter(name, target, ms)` `setMasterGain(v)` `teardown()` | AudioBackend | 副作用 |
| **SoundPackStore** | `load(profileId)` `get(profileId)` `getBuffer(profileId, kc, type)` | fs / backend.decode | 副作用 + 纯查询 |
| **KeySampler** | `pick(pack, kc, type, snapshot, mode, dsp, activeVoices) → {buffer, volume, pitch, pan, duration}` | — | **纯** |
| **TypingAnalytics** | `recordKey(tsMs, kc, type)` `snapshot() → {intensity, adaptiveMul, wpm, typingActive}` | — | **纯** |
| **Lifecycle** | `state` `transition(event)` `on('state', cb)` | AudioGraph / AudioBackend | FSM |
| **ComboMachine** | `onKeydown(tsMs)` `reset()` `on('stage', cb) on('perfect', cb)` | — | **纯** |
| **AudioBackend** (接口) | `open(sampleRate)` `decode(bytes) → Buffer` `play(buf, params) → voiceId` `stop(voiceId)` `close()` | 原生 binding | 适配 |

### 4.3 两条设计约束

1. **`KeySampler.pick` 是纯函数**——当前 `playSound` 里 70 行副作用缠绕的逻辑变为可单测的纯计算。
2. **`TypingAnalytics.snapshot()` 是 pull 模式**（KeySampler 主动拉），而非 push（analytics 广播）。单测 KeySampler 不需要 mock 时间流。

---

## 5. 关键数据流

### 5.1 按键 → 出声（happy path）

```
uIOhook keydown
  → KeySource 过滤 hold-repeat（现有逻辑不变）
  → AudioCoreService.onKey(kc, type, tsMs)
    ├─ Lifecycle.state === 'Ready'?  否则 → drop + emit('degraded')
    ├─ TypingAnalytics.recordKey(tsMs, kc, type)
    ├─ snapshot = TypingAnalytics.snapshot()
    ├─ pack = SoundPackStore.get(activeProfile)
    ├─ params = KeySampler.pick(pack, kc, type, snapshot, mode, dsp, activeVoices)
    ├─ AudioGraph.playBuffer(params.buffer, {vol, pitch, pan, dur})
    └─ if (mode.arcadeEnabled && type === 'down')
         ComboMachine.onKeydown(tsMs)  → IPC event → renderer overlay
```

**目标延迟**：`onKey` → `AudioGraph.playBuffer` 内部 ≤ 0.5ms；`playBuffer` → 扬声器由原生库决定（spike 验证 ≤ 20ms）。

### 5.2 Mode / Profile / DSP / Volume 变更

```
Renderer UI → ipcRenderer.invoke('audio:setMode', id)
  → AudioCoreService.setMode(id)
  → AudioGraph.rampFilter(airLpf, target, 300ms) ...  // linear ramp 防 click
  → emit('state-changed', { mode })
  → Main → webContents.send('audio:state', payload) → renderer 订阅更新
```

### 5.3 Cold boot

```
app 'ready'
  → AudioCoreService.start()
  → Lifecycle: Cold → Booting
  → AudioBackend.open(44100)        ← 可能失败（设备忙 / 权限）
  → AudioGraph.init()
  → SoundPackStore.load(defaultProfile)
  → Lifecycle: Booting → Ready
  → emit('state-changed', { phase: 'ready' })
```

**关键**：主进程启动即打开音频设备。无 autoplay policy，无用户手势门槛——根治 a 类失败（冷启动静音）。

### 5.4 电源自愈（sleep/wake/lock）

```
powerMonitor 'suspend' | 'lock-screen'
  → AudioCoreService.pause()
  → Lifecycle: Ready → Suspended
  → AudioBackend.close()  ← 释放设备，避免"绑在死设备上"

powerMonitor 'resume' | 'unlock-screen' | 'user-did-become-active'
  → AudioCoreService.resume()
  → Lifecycle: Suspended → Recovering
  → AudioBackend.open() 重试 3 次 (250ms backoff)
     ├─ 成功 → AudioGraph.reinit() → SoundPackStore 复用缓存 buffer → Ready
     └─ 全失败 → Failed（托盘暗红 + HelpPanel 手动 Retry 入口）
```

**核心改进**：每次 wake 强制 `close → open`（不信任 "resume 就能活"），CoreAudio 设备绑定重新建立。SoundPackStore 的 decoded buffer 是纯内存，close→open 不丢。

### 5.5 Mute toggle（⇧⌘K）

```
globalShortcut → AudioCoreService.setEnabled(!enabled)
  → Lifecycle 不变（仍是 Ready）
  → AudioGraph.setMasterGain(enabled ? baseVolume : 0)
  → emit('state-changed', { enabled })
  → tray icon + renderer 同步
```

**注意**：mute 不改 Lifecycle 状态，只是 gain=0。unmute 时不触发任何自愈动作——根治 f 类失败。

### 5.6 优雅退出

```
app 'before-quit'
  → stopKeyboardListener()
  → AudioCoreService.stop()
  → Lifecycle: * → Shutdown
  → AudioGraph.teardown()
  → AudioBackend.close()
```

### 5.7 三个不变式

1. `AudioBackend.open/close` 只由 Lifecycle 驱动——没有任何"在 playSound 里判 state 再 wake"的反射弧。
2. `onKey` 不触发任何异步恢复——degraded/failed 时直接 drop；恢复由外部 Lifecycle 事件驱动。
3. `SoundPackStore` 的 buffer 生命周期 = app 生命周期——close→open 不重新解码。

---

## 6. 状态机与可观测性

### 6.1 Lifecycle FSM

```
                 ┌─────────┐
   start() ────► │  Cold   │
                 └────┬────┘
                      │ start()
                      ▼
                 ┌─────────┐  open fail    ┌────────┐
                 │ Booting │──────────────►│ Failed │◄─┐
                 └────┬────┘               └───┬────┘  │
                      │ open ok + init         │ retry │
                      ▼                        │ button│
                 ┌─────────┐                   │       │
       ┌───────► │  Ready  │                   │       │
       │         └────┬────┘                   │       │
       │              │ suspend / lock         │       │
       │              ▼                        │       │
       │         ┌───────────┐                 │       │
       │         │ Suspended │                 │       │
       │         └────┬──────┘                 │       │
       │              │ resume / unlock /      │       │
       │              │ user-did-become-active │       │
       │              ▼                        │       │
       │         ┌────────────┐ 3× fail        │       │
       └─────────┤ Recovering ├────────────────┘       │
         ok      └────────────┘                        │
                                                       │
                       ┌─────────┐                     │
                  * ──►│ Shutdown│◄──── quit           │
                       └─────────┘                     │
```

### 6.2 六状态 + 不变式

| State | 能播声？ | 能接受命令？ | 不变式 |
|---|---|---|---|
| Cold | ✕ | 仅 `start()` | backend 未 open |
| Booting | ✕ | 否 | 正在 open + 初始化 graph |
| Ready | ✓ | 全部 | backend open、graph 存在、≥ 1 个 pack 已加载 |
| Suspended | ✕ | setMode/setProfile 缓存，不真正应用 | backend 已 close，buffer 仍在 |
| Recovering | ✕ | 否 | 正在 open 重试（≤ 3 次） |
| Failed | ✕ | 仅 `manualRetry()` | backend close、原因已记录 |
| Shutdown | ✕ | 否 | 所有资源释放，终态 |

### 6.3 对外可观测信号

```ts
type AudioHealth =
  | { phase: 'ready'; enabled: boolean; activeProfile: string }
  | { phase: 'booting' }
  | { phase: 'suspended'; reason: 'sleep' | 'lock' | 'manual' }
  | { phase: 'recovering'; attempt: 1 | 2 | 3 }
  | { phase: 'failed'; reason: string; canRetry: boolean }
```

### 6.4 UI 呈现（守"心流"原则）

| 状态 | Tray 图标 | HelpPanel | 打扰度 |
|---|---|---|---|
| Ready + enabled | 默认 | — | 无 |
| Ready + muted | 静音图案（现有） | — | 无 |
| Booting / Recovering | 淡灰脉动 1×/s | — | 极低 |
| Suspended | 淡灰静态 | — | 无 |
| **Failed** | **暗红静态** | 出现 "Retry audio" 按钮 + 诊断原因 | tooltip: "Audio unavailable — click tray to retry" |

失败不静默：进入 Failed 的路径都记录 reason（`device busy` / `open timeout` / `decode error` / `unknown`），写入 ring buffer（最近 20 条），HelpPanel 可查。

### 6.5 诊断模式

默认关闭，`DEBUG_AUDIO=1` 环境变量开启：
- 每次 onKey 记录 `{ts, kc, type, state, latency_us}`
- 每次 state transition 记录 `{from, to, cause}`
- 写到 `~/Library/Logs/Pekko/audio.log`，滚动 5MB

---

## 7. 测试策略

### 7.1 三层金字塔

| 层 | 范围 | 工具 | 数量级 |
|---|---|---|---|
| 单测 | `KeySampler.pick` / `TypingAnalytics` / `Lifecycle` FSM / `SoundPackStore` 查询 / `ComboMachine` | 现有 Vitest | 30–50 |
| 集成 | `AudioCoreService` + 真实或 mock `AudioBackend` | Vitest + mock backend | 10–15 |
| 手测 | 8 条失败模式清单 | checklist | 每次 release |

### 7.2 单测必须覆盖

- `KeySampler.pick` 的 volume 公式边界：`activeVoices ∈ {0, 8, 16, 24}`
- `TypingAnalytics`：fresh start / fast / slow / idle-then-resume
- `Lifecycle` FSM：每条合法转移 + 每条非法转移被拒
- `SoundPackStore.getBuffer` fallback：未命中 / special key 命中 / variant 轮选不重复
- Mode style 切换时 `rampFilter` 调用参数

### 7.3 集成关键用例

```
describe('AudioCoreService', () => {
  it('drops onKey when state !== Ready')
  it('survives 100 rapid suspend/resume cycles')
  it('close→open on wake rebinds device correctly')
  it('Failed state blocks all commands except manualRetry')
  it('setMode during Suspended caches and applies on Recovery')
})
```

### 7.4 手测清单（对应失败模式 a–h）

| # | 场景 | 预期 |
|---|---|---|
| a | 冷启动后第一次按键 | 立即有声 |
| b | 合盖 5 分钟开盖 | wake 后 1s 内恢复 |
| c | 锁屏解锁 | unlock 后立即恢复 |
| d | Classic → Rush → Classic 快速切 | 无 click、音色切换 |
| e | 切 3 把 profile | 无静音期 |
| f | ⇧⌘K 切 10 次 | 每次都响应 |
| g | 连续打字 10 分钟 | 不"随机哑" |
| h | dev HMR reload | 无需重启 app 声音就回 |

CI 过单测 + 集成；手测清单每次 release 前人工走，写入 `docs/superpowers/release-checklist.md`。

---

## 8. 迁移计划（6 个独立 PR）

**总原则**：每一步可单独 ship，main 永远可跑；不做大爆炸替换。

| PR | 内容 | 风险 | 可验证指标 |
|---|---|---|---|
| **PR-0** | Spike：试 `miniaudio-napi` / `naudiodon` 两库，各 50 行 demo，跑延迟 + sprite 切片 + 代码签名 | 高 | 延迟 ≤ 20ms；sprite 无爆音；notarize 通过 |
| **PR-1** | 纯逻辑提取：`KeySampler.pick` + `TypingAnalytics` 抽为独立纯模块。**不改运行时行为** | 低 | 8 条手测清单全过 |
| **PR-2** | Main 新建 `src/main/audio/`，搭 `AudioBackend` + `AudioGraph` + `SoundPackStore` + `Lifecycle`，跑通"主进程播 beep" | 中 | 集成测"播 beep"过 |
| **PR-3** | **双轨并行**：feature flag `AUDIO_BACKEND=main\|renderer`（默认 renderer）；两后端都能工作 | 中 | flag 切换测 8 条清单全过 |
| **PR-4** | 切默认为 `main`；renderer `AudioEngine` 进入 deprecation；combo 状态机搬 main，renderer 只留合成层 | 中 | 8 条清单全绿 |
| **PR-5** | 删 renderer 侧 `AudioEngine.ts` / `useAudioEngine` 生命周期、feature flag、MessagePort 键桥 | 低 | 回归手测 |

### 8.1 安全网

- **PR-0 fail → 回退方案 A（原地重构）**，不硬上 native binding。
- **PR-3 双后端共存 ≥ 2 周**，日常使用验证；稳定后才走 PR-4。
- **PR-5 之前**，任何时候 flag 切回 `renderer` 能恢复旧行为。

### 8.2 时间估算（参考，不承诺）

| PR | 粗估 |
|---|---|
| PR-0 spike | 1–2 天 |
| PR-1 纯逻辑提取 | 半天 |
| PR-2 main 骨架 | 1–2 天 |
| PR-3 双轨 | 1–2 天 |
| PR-4 切默认 + 观察期 | 半天 + 2 周观察 |
| PR-5 清理 | 半天 |

---

## 9. Spike（PR-0）验证标准

PR-0 必须同时满足以下才继续，否则回退方案 A：

| 指标 | 阈值 |
|---|---|
| End-to-end latency（onKey → 扬声器） | ≤ 20ms (macOS 内置扬声器) |
| Sprite 切片无爆音 | 波形对比无明显 transient 畸变 |
| 24-voice 并发无 xrun | 连击 200 次 keydown 无 dropout |
| 代码签名 + notarization | `.node` 文件可通过 Apple 公证 |
| 跨平台可行性 | macOS 跑通；Windows/Linux 至少 binding 能 link |
| 包体积增量 | ≤ 5MB |

库候选优先级（spike 验证后定）：
1. `miniaudio-napi` — 单头 C 库，轻量，跨平台
2. `naudiodon` / `naudiodon2` — PortAudio 绑定，成熟但重

---

## 10. Open Questions

- **Arcade combo 在 main 实现时，IPC 事件到 renderer 的延迟是否会造成视觉与听觉脱钩？**（PR-3 时测）
- **miniaudio-napi 的预编译二进制是否覆盖 Apple Silicon + Intel + Windows x64 + Linux x64？**（PR-0 时定）
- **如果 native binding 失败回退方案 A，当前设计文档的第 4–7 节仍然适用吗？** → 是的，§4 模块拆分 / §6 FSM / §7 测试策略对方案 A 也适用；只是 AudioBackend 会被 Web Audio 实现替代。

---

## 11. 附录：与当前代码的对应关系

| 当前文件 / 符号 | 新结构里的位置 | 处理方式 |
|---|---|---|
| `src/renderer/audio/AudioEngine.ts` | 拆成 `src/main/audio/*` 多个模块 | PR-5 删除 |
| `src/renderer/hooks/useAudioEngine.ts` | 生命周期逻辑搬到 main；hook 只留 UI 订阅 | PR-4 瘦身 |
| `src/main/keyboard.ts` 的 MessagePort | 键事件不再过 renderer | PR-5 删 `keyPort` 相关代码 |
| `src/main/preload.ts` 的 `onKeyEvent` | Renderer 不再需要 | PR-5 删 |
| `src/renderer/audio/arcade/combo.ts` | 迁到 `src/main/audio/ComboMachine.ts` | PR-4 迁移（保留 `combo.test.ts`） |
| `src/renderer/audio/arcade/ArcadeOverlayLayer.ts` / `ArcadeHudController.ts` | 留 renderer | 订阅 main combo 事件 |
| `src/renderer/audio/arcade/synth/*` | 留 renderer | 不动 |
| `src/renderer/audio/uiSounds.ts` | 不在本次范围 | 不动 |

---

## 12. 下一步

→ 进入 `superpowers:writing-plans`，把本 spec 转成可执行的 PR-by-PR 实施计划（仍不写代码）。
