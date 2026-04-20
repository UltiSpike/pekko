# Pekko 声音引擎重新设计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把键盘音频从 renderer（Web Audio）搬到 main 进程（native binding），用显式状态机 + 拆模块 + 可观测失败 根治 8 类"没声音"失败。

**Architecture:** Main 进程运行 `AudioCoreService`（native audio backend + Lifecycle FSM + 拆好的 KeySampler / TypingAnalytics / SoundPackStore / ComboMachine）。Renderer 只负责 UI 订阅与 arcade 视觉层。6 个独立 PR 迁移，PR-0 spike 先验证 native binding 可行性，失败则回退到原地重构。

**Tech Stack:** Electron 31 · Node 18+ · TypeScript 5 · `uiohook-napi` · native audio binding 候选 `miniaudio-napi` / `naudiodon2`（spike 后定）· `node:test` + tsx 跑测试

**Spec:** `docs/superpowers/specs/2026-04-20-audio-engine-redesign-design.md`

---

## 文件结构总览（最终态）

```
src/main/audio/                            — 新增目录
├── index.ts                               — AudioCoreService 门面
├── AudioGraph.ts                          — Mixer + DSP facade
├── SoundPackStore.ts                      — Pack 加载 / 缓存 / 查询
├── KeySampler.ts                          — 纯：选 buffer + 播放参数
├── TypingAnalytics.ts                     — 纯：intensity / WPM / 疲劳
├── Lifecycle.ts                           — FSM
├── ComboMachine.ts                        — Arcade combo（从 renderer 迁）
├── bindings/
│   ├── types.ts                           — AudioBackend 接口
│   ├── miniaudio.ts                       — 原生实现（spike 后定库）
│   └── mock.ts                            — 集成测用 mock
├── KeySampler.test.ts
├── TypingAnalytics.test.ts
├── Lifecycle.test.ts
├── SoundPackStore.test.ts
├── ComboMachine.test.ts
└── AudioCoreService.integration.test.ts

src/main/index.ts                          — 修改：on 'ready' 启动 AudioCoreService
src/main/ipc-handlers.ts                   — 修改：新增 audio:* commands
src/main/keyboard.ts                       — 修改：PR-3 起通过 callback 把键事件喂给 AudioCoreService；PR-5 删 MessagePort
src/main/preload.ts                        — 修改：PR-5 删 onKeyEvent；新增 onAudioState

src/renderer/audio/AudioEngine.ts          — PR-5 删除
src/renderer/audio/arcade/combo.ts         — PR-4 迁到 main（留 export 兼容 overlay）
src/renderer/audio/arcade/ArcadeOverlayLayer.ts — PR-4 改：订阅 main combo 事件
src/renderer/audio/arcade/ArcadeHudController.ts — 保持
src/renderer/hooks/useAudioEngine.ts       — PR-4 瘦身 → 改名 useAudioState

spike/                                     — 新增：仅 PR-0 临时目录，PR-0 尾部删除
├── miniaudio-demo/
└── naudiodon-demo/
```

---

## PR-0｜Spike：native binding 可行性验证

**目的**：验证 `miniaudio-napi` 或 `naudiodon2` 能满足 spec §9 列出的全部 6 条硬指标。失败则回退方案 A（原地重构），本计划作废。

**Gate 条件**：以下 6 条必须全部通过
1. End-to-end latency ≤ 20ms
2. Sprite 切片无爆音
3. 24-voice 并发无 xrun
4. 代码签名 + notarization 通过
5. 预编译二进制覆盖 arm64 + x64（至少 macOS）
6. 包体积增量 ≤ 5MB

### Task 0.1：创建 spike 目录 + miniaudio-napi smoke

**Files:**
- Create: `spike/miniaudio-demo/package.json`
- Create: `spike/miniaudio-demo/index.ts`

- [ ] **Step 1: 创建独立 spike workspace**

```bash
mkdir -p spike/miniaudio-demo && cd spike/miniaudio-demo
npm init -y
npm install miniaudio-napi tsx typescript @types/node
```

- [ ] **Step 2: 写最小 smoke demo**

`spike/miniaudio-demo/index.ts`:

```typescript
// 目标：读一个 WAV 文件 → 播 1s → 打印每次播放的 wall-clock 时间戳
import * as fs from 'node:fs'
import * as path from 'node:path'
// @ts-expect-error spike
import miniaudio from 'miniaudio-napi'

async function main() {
  const wavPath = path.join(__dirname, 'test.wav') // 用一个 44.1k 16-bit mono WAV
  const bytes = fs.readFileSync(wavPath)

  const engine = new miniaudio.Engine({ sampleRate: 44100 })
  await engine.init()
  console.log(`[spike] engine opened, backend=${engine.backend}, latency=${engine.outputLatencyMs}ms`)

  const decoded = await engine.decode(bytes)
  console.log(`[spike] decoded ${decoded.frameCount} frames`)

  for (let i = 0; i < 10; i++) {
    const t0 = performance.now()
    engine.play(decoded, { volume: 0.7, pitch: 1.0, pan: 0 })
    const t1 = performance.now()
    console.log(`[spike] play call overhead=${(t1 - t0).toFixed(3)}ms`)
    await new Promise(r => setTimeout(r, 200))
  }

  await new Promise(r => setTimeout(r, 1000))
  await engine.close()
}

main().catch(console.error)
```

- [ ] **Step 3: 跑起来**

```bash
npx tsx index.ts
```
Expected: 打印 engine backend（macOS 是 `CoreAudio`）、outputLatency 一个数字、10 次 play 调用开销都 ≤ 1ms。

**Gate**：如果 `miniaudio-napi` 没有预编译 arm64 macOS binary（需要从源码编译且出错），记录失败原因，跳到 Task 0.2 试备选。

- [ ] **Step 4: 记录观察到的 API 契合度**

在 `spike/miniaudio-demo/NOTES.md` 写下：
- 是否支持 `decode(bytes) → decodedBuffer`（我们需要这个，因为现有 pack 是 .ogg / .wav 字节流）
- 是否支持多 voice 并发（或需要自己做 voice pool）
- 是否支持 `playbackRate` / `pan` / `volume` 的实时调整

### Task 0.2：naudiodon2 备选 smoke（如 0.1 通过则 skip）

**Files:**
- Create: `spike/naudiodon-demo/package.json`
- Create: `spike/naudiodon-demo/index.ts`

- [ ] **Step 1: 装依赖**

```bash
mkdir -p spike/naudiodon-demo && cd spike/naudiodon-demo
npm init -y
npm install naudiodon2 wav tsx typescript @types/node
```

- [ ] **Step 2: 写 smoke**

`spike/naudiodon-demo/index.ts`:

```typescript
import * as fs from 'node:fs'
// @ts-expect-error spike
import portAudio from 'naudiodon2'
// @ts-expect-error spike
import wav from 'wav'

async function main() {
  const devices = portAudio.getDevices()
  const def = portAudio.getDefaultOutputDevice()
  console.log(`[spike] default device=${devices[def]?.name}`)

  const ao = new portAudio.AudioIO({
    outOptions: {
      channelCount: 2,
      sampleFormat: portAudio.SampleFormat16Bit,
      sampleRate: 44100,
      deviceId: -1,
      closeOnError: true
    }
  })

  const reader = new wav.Reader()
  const stream = fs.createReadStream(__dirname + '/test.wav')

  reader.on('format', (fmt: any) => {
    console.log(`[spike] wav format:`, fmt)
    ao.start()
    reader.pipe(ao)
  })

  stream.pipe(reader)
}

main().catch(console.error)
```

- [ ] **Step 3: 跑起来**

```bash
npx tsx index.ts
```
Expected: 设备打开、WAV 流播放出声。

- [ ] **Step 4: 评估**

PortAudio 是 stream-pull 模型（需要我们实时喂 PCM），**不是** buffer-and-play。这对"采样触发播放"场景不友好——我们要么自己做 voice pool + mixer，要么放弃 PortAudio。在 `NOTES.md` 记下结论。

### Task 0.3：Latency 基准测试

**Files:**
- Create: `spike/latency-bench.ts`

- [ ] **Step 1: 写 end-to-end 延迟探测**

思路：在 spike 里模拟"uIOhook keydown → play"链路，用 loopback capture（macOS 上可用 BlackHole 虚拟声卡）把扬声器输出环回到麦克风输入，同时在触发 play 时打戳，测两者相位差。

由于需要硬件回环，**替代方案**：用引擎自报告的 `outputLatencyMs` + 测 `play()` 调用到回调触发的纯软件延迟之和。

```typescript
// 简化：用引擎内建的 playback callback（miniaudio 有 onFrame）
// 在 play() 调用时记 t0，在第一帧回调时记 t1，差值即 scheduling latency
```

- [ ] **Step 2: 跑 100 次取中位数**

```bash
npx tsx latency-bench.ts
```
Expected: 中位延迟 + 分布写入 `spike/latency-results.md`。

**Gate**：中位数 ≤ 20ms，p99 ≤ 30ms。

### Task 0.4：Sprite 切片测试

**Files:**
- Create: `spike/sprite-test.ts`

- [ ] **Step 1: 用一个真实 pekko sound pack 测**

从 `assets/sounds/cherrymx-black-abs/` 读一个 sprite（`sound.ogg` + `config.json`），切 3 个不同 key 的片段，连续播放。

```typescript
// 伪代码
const full = await engine.decode(fs.readFileSync('sound.ogg'))
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'))

// slice key 30 (A)
const [offset30, duration30] = config.defines['30']
const slice30 = engine.slice(full, offset30, duration30)

// 快速连播 20 次模拟打字
for (let i = 0; i < 20; i++) {
  engine.play(slice30, { volume: 0.7 })
  await new Promise(r => setTimeout(r, 80))
}
```

- [ ] **Step 2: 听 + 看 waveform**

用 `sox` 或 Audacity 导出播放录音，对比原始 sprite 切片的波形。

**Gate**：无明显 click / transient 畸变。

### Task 0.5：24-voice 并发压测

**Files:**
- Create: `spike/polyphony-test.ts`

- [ ] **Step 1: 写并发触发测试**

```typescript
// 200 次触发，每次间隔 5ms，远超 24-voice 上限
// 观察是否有 xrun（引擎通常会在 console 或回调里报）
for (let i = 0; i < 200; i++) {
  engine.play(slice, { volume: 0.3 })
  await new Promise(r => setTimeout(r, 5))
}
```

- [ ] **Step 2: 验证**

```bash
npx tsx polyphony-test.ts
```
Expected: 控制台无 xrun / buffer underrun 警告。

### Task 0.6：代码签名 + notarization 验证

**Files:**
- Modify: `electron-builder.yml` 或 `package.json` 的 build 配置

- [ ] **Step 1: 把赢家 binding 加到 pekko 主项目 devDependencies**

假设 0.1 赢家是 `miniaudio-napi`：

```bash
cd /Users/pochita-/Projects/pekko
npm install miniaudio-napi --save-dev  # 先 dev 装，PR-2 再挪到 dependencies
```

- [ ] **Step 2: 跑一次完整打包**

```bash
npm run package
```
Expected: `dist/` 下产出 `.dmg`，notarization 日志无错误。

- [ ] **Step 3: 测试安装包**

从 `.dmg` 安装到 `/Applications`，打开，看 Console.app 有无 Gatekeeper / code signing 报错。

**Gate**：签名通过、打开无警告。

### Task 0.7：Spike 结论 + commit

**Files:**
- Create: `spike/SPIKE-RESULT.md`

- [ ] **Step 1: 写结论文档**

内容：
- 哪个 binding 通过？（miniaudio-napi / naudiodon2 / 都失败）
- 6 条 gate 的实测数据
- 如果都失败：下一步是回退方案 A
- 如果通过：下一步进 PR-1，binding 选定为 X

- [ ] **Step 2: 清理 spike 目录**

```bash
# spike/*-demo 移到 .gitignore 或整体删除，只保留 SPIKE-RESULT.md
git rm -r spike/miniaudio-demo spike/naudiodon-demo spike/*.ts
```

- [ ] **Step 3: Commit**

```bash
git add spike/SPIKE-RESULT.md package.json package-lock.json
git commit -m "spike(audio): 验证 native binding 可行性，选定 <binding>

- end-to-end latency: Xms (gate ≤ 20ms ✓)
- sprite 切片无爆音 ✓
- 24-voice 压测无 xrun ✓
- notarization 通过 ✓
- 包体积增量 Xmb (gate ≤ 5MB ✓)

下一步：PR-1 纯逻辑提取"
```

---

## PR-1｜纯逻辑提取（在 renderer 侧，不改行为）

**目的**：把 `AudioEngine.playSound` 里的纯计算（选 buffer / 算音量 / 算 pitch）和 intensity/WPM/fatigue 抽成独立可单测模块，仍被现有 AudioEngine 调用。此 PR 完成后**运行时行为不变**。

### Task 1.1：新建 `src/shared/audio/` 共享目录 + 写 TypingAnalytics 测试

**Files:**
- Create: `src/shared/audio/TypingAnalytics.ts`
- Create: `src/shared/audio/TypingAnalytics.test.ts`

> 为什么放 `src/shared/`：这些模块 PR-2 要在 main 侧用，PR-5 删 renderer 侧前 renderer 也要用，共享最干净。

- [ ] **Step 1: 写失败测试**

`src/shared/audio/TypingAnalytics.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TypingAnalytics } from './TypingAnalytics.ts'

test('空白状态 snapshot 返回默认值', () => {
  const a = new TypingAnalytics()
  const s = a.snapshot()
  assert.equal(s.intensity, 0.7)
  assert.equal(s.adaptiveMul, 1.0)
  assert.equal(s.wpm, 0)
  assert.equal(s.typingActive, false)
})

test('fresh start (interval > 2000ms) 设 intensity=0.80', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  a.recordKey(4000, 30, 'down') // 3s gap → fresh start
  assert.equal(a.snapshot().intensity, 0.80)
})

test('快速打字 (interval < 80ms) 降低 intensity', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  a.recordKey(1050, 31, 'down') // 50ms
  const s = a.snapshot()
  assert.ok(s.intensity < 0.7, `intensity ${s.intensity} should be < 0.7`)
})

test('慢速敲击 (interval > 150ms) 抬高 intensity', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  a.recordKey(1300, 31, 'down') // 300ms
  const s = a.snapshot()
  assert.ok(s.intensity > 0.75, `intensity ${s.intensity} should be > 0.75`)
})

test('arcade 模式下 adaptiveMul 锁定 1.0（无疲劳衰减）', () => {
  const a = new TypingAnalytics({ arcadeEnabled: true })
  for (let i = 0; i < 1000; i++) a.recordKey(1000 + i * 50, 30, 'down') // 50s 连打
  assert.equal(a.snapshot().adaptiveMul, 1.0)
})

test('持续打字 > 30s adaptiveMul 稳定在 0.65', () => {
  const a = new TypingAnalytics()
  for (let i = 0; i < 1000; i++) a.recordKey(1000 + i * 50, 30, 'down') // 50s
  const s = a.snapshot()
  assert.ok(s.adaptiveMul >= 0.65 && s.adaptiveMul <= 0.66)
})

test('WPM 计算：5s 内 60 keys → wpm ≈ 144', () => {
  const a = new TypingAnalytics()
  for (let i = 0; i < 60; i++) a.recordKey(1000 + i * 83, 30, 'down') // ~5s
  const s = a.snapshot()
  assert.ok(s.wpm >= 140 && s.wpm <= 150, `wpm was ${s.wpm}`)
})

test('idle > 2s 后 typingActive 变 false', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  const now = () => 5000 // 4s 后
  assert.equal(a.snapshot(now).typingActive, false)
})
```

- [ ] **Step 2: 跑测试确认全失败**

```bash
npx tsx --test src/shared/audio/TypingAnalytics.test.ts
```
Expected: 8 个 test 全 FAIL（module not found）。

- [ ] **Step 3: 实现 TypingAnalytics**

`src/shared/audio/TypingAnalytics.ts`:

```typescript
export interface TypingSnapshot {
  intensity: number
  adaptiveMul: number
  wpm: number
  typingActive: boolean
}

export interface TypingAnalyticsOptions {
  arcadeEnabled?: boolean
}

export class TypingAnalytics {
  private lastKeyTime = 0
  private intensity = 0.7
  private adaptiveMul = 1.0
  private typingStartTime = 0
  private keyTimestamps: number[] = []
  private arcadeEnabled: boolean

  constructor(opts: TypingAnalyticsOptions = {}) {
    this.arcadeEnabled = opts.arcadeEnabled ?? false
  }

  setArcadeEnabled(v: boolean) { this.arcadeEnabled = v }

  recordKey(tsMs: number, _keycode: number, type: 'down' | 'up' | 'repeat') {
    if (type !== 'down') return

    // intensity
    const interval = tsMs - this.lastKeyTime
    if (this.lastKeyTime === 0 || interval > 2000) {
      this.intensity = 0.80
    } else if (interval < 80) {
      this.intensity = Math.max(0.35, this.intensity - 0.08)
    } else if (interval < 150) {
      this.intensity = 0.5 + (interval - 80) / 140 * 0.3
    } else {
      this.intensity = Math.min(1.0, 0.7 + (interval - 150) / 500 * 0.3)
    }

    // adaptive
    if (this.arcadeEnabled) {
      this.adaptiveMul = 1.0
      this.typingStartTime = 0
    } else {
      if (tsMs - this.lastKeyTime > 3000) {
        this.adaptiveMul = 1.0
        this.typingStartTime = tsMs
      } else if (this.typingStartTime === 0) {
        this.typingStartTime = tsMs
      } else {
        const dur = (tsMs - this.typingStartTime) / 1000
        if (dur < 5) this.adaptiveMul = 1.0
        else if (dur < 30) this.adaptiveMul = 1.0 - (dur - 5) / 25 * 0.25
        else this.adaptiveMul = Math.max(0.65, this.adaptiveMul)
      }
    }

    // WPM
    this.keyTimestamps.push(tsMs)
    const cutoff = tsMs - 5000
    this.keyTimestamps = this.keyTimestamps.filter(t => t > cutoff)

    this.lastKeyTime = tsMs
  }

  snapshot(nowMsFn: () => number = () => performance.now()): TypingSnapshot {
    const now = nowMsFn()
    const wpm = Math.round((this.keyTimestamps.length / 5) * 12)
    const typingActive = this.lastKeyTime > 0 && (now - this.lastKeyTime) < 2000
    return {
      intensity: this.intensity,
      adaptiveMul: this.adaptiveMul,
      wpm: typingActive ? wpm : 0,
      typingActive
    }
  }
}
```

- [ ] **Step 4: 跑测试确认全通过**

```bash
npx tsx --test src/shared/audio/TypingAnalytics.test.ts
```
Expected: 8 个 test 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/audio/TypingAnalytics.ts src/shared/audio/TypingAnalytics.test.ts
git commit -m "refactor(audio): 提取 TypingAnalytics 纯模块 + 8 个单测"
```

### Task 1.2：写 KeySampler 纯函数 + 测试

**Files:**
- Create: `src/shared/audio/KeySampler.ts`
- Create: `src/shared/audio/KeySampler.test.ts`

- [ ] **Step 1: 定义 KeySampler 类型 + 失败测试**

`src/shared/audio/KeySampler.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickKeySound, KeyBuffer, SpritePack, MultiPack, SamplerPack } from './KeySampler.ts'
import type { TypingSnapshot } from './TypingAnalytics.ts'

// Mock AudioBuffer — 测试中只需 identity 不需要实际 PCM
const fakeBuf = (tag: string): KeyBuffer => ({ tag, duration: 0.1 } as any)

const defaultSnapshot: TypingSnapshot = {
  intensity: 0.7, adaptiveMul: 1.0, wpm: 60, typingActive: true
}
const defaultStyle = {
  intensityLocked: false, pitchJitter: 0.01, volumeJitter: 0.05,
  airLpfHz: 13000, highShelfDb: 0.5, lowShelfDb: 2.5, wetMix: 0.05
}
const defaultDsp = {
  bodyPeakHz: 600, bodyPeakQ: 1.5, bodyPeakDb: 0,
  springNotchDb: 0, transientDb: 0, topDownBalanceDb: 0, decayScale: 1.0
}

test('sprite pack 命中 keycode 返回对应 down buffer', () => {
  const pack: SpritePack = {
    type: 'sprite',
    keys: new Map([[30, { down: fakeBuf('A-down'), up: fakeBuf('A-up') }]]),
    fallbackDown: fakeBuf('fallback-down'),
    fallbackUp: fakeBuf('fallback-up')
  }
  const r = pickKeySound(pack, 30, 'down', defaultSnapshot, defaultStyle, defaultDsp, 0)
  assert.equal((r!.buffer as any).tag, 'A-down')
})

test('sprite pack 未命中 keycode 回退到 fallback', () => {
  const pack: SpritePack = {
    type: 'sprite',
    keys: new Map(),
    fallbackDown: fakeBuf('fb-d'), fallbackUp: fakeBuf('fb-u')
  }
  const r = pickKeySound(pack, 99, 'down', defaultSnapshot, defaultStyle, defaultDsp, 0)
  assert.equal((r!.buffer as any).tag, 'fb-d')
})

test('activeVoices > 8 激活 duck factor 降低音量', () => {
  const pack: SpritePack = {
    type: 'sprite', keys: new Map([[30, { down: fakeBuf('x') }]]),
    fallbackDown: null, fallbackUp: null
  }
  const r0 = pickKeySound(pack, 30, 'down', defaultSnapshot, defaultStyle, defaultDsp, 0)
  const r12 = pickKeySound(pack, 30, 'down', defaultSnapshot, defaultStyle, defaultDsp, 12)
  assert.ok(r12!.volume < r0!.volume, `${r12!.volume} should < ${r0!.volume}`)
})

test('intensityLocked 模式 pitch 固定 1.0 基线', () => {
  const lockedStyle = { ...defaultStyle, intensityLocked: true, pitchJitter: 0 }
  const pack: SpritePack = {
    type: 'sprite', keys: new Map([[30, { down: fakeBuf('x') }]]),
    fallbackDown: null, fallbackUp: null
  }
  const r = pickKeySound(pack, 30, 'down', defaultSnapshot, lockedStyle, defaultDsp, 0)
  // keyChar 成分仍在 (±0.01)，所以 pitch 应在 1.0 ± 0.01
  assert.ok(Math.abs(r!.pitch - 1.0) < 0.015)
})

test('repeat 类型：volume 固定 intensity=0.5、忽略 activeVoices', () => {
  const pack: SpritePack = {
    type: 'sprite', keys: new Map([[30, { down: fakeBuf('x') }]]),
    fallbackDown: null, fallbackUp: null
  }
  const r = pickKeySound(pack, 30, 'repeat', defaultSnapshot, defaultStyle, defaultDsp, 0)
  // 0.5 + 0.5*0.5 = 0.75, × adaptiveMul(1.0) = 0.75
  assert.ok(Math.abs(r!.volume - 0.75) < 0.01)
  assert.equal(r!.pitch, 1.0)
})

test('up 事件应用 topDownBalanceDb (dB→gain)', () => {
  const pack: SpritePack = {
    type: 'sprite',
    keys: new Map([[30, { down: fakeBuf('d'), up: fakeBuf('u') }]]),
    fallbackDown: null, fallbackUp: null
  }
  const pressDsp = { ...defaultDsp, topDownBalanceDb: 0 }
  const liftDsp = { ...defaultDsp, topDownBalanceDb: 3 }
  const rDown = pickKeySound(pack, 30, 'up', defaultSnapshot, defaultStyle, pressDsp, 0)
  const rUp = pickKeySound(pack, 30, 'up', defaultSnapshot, defaultStyle, liftDsp, 0)
  assert.ok(rUp!.volume > rDown!.volume)
})

test('multi pack special key 命中 map', () => {
  const pack: MultiPack = {
    type: 'multi',
    data: {
      press: {
        generic: [fakeBuf('g1'), fakeBuf('g2')],
        special: { SPACE: fakeBuf('space-d') }
      },
      release: { generic: fakeBuf('g-up'), special: {} }
    }
  }
  const r = pickKeySound(pack, 57, 'down', defaultSnapshot, defaultStyle, defaultDsp, 0)
  assert.equal((r!.buffer as any).tag, 'space-d')
})

test('multi pack generic 变体轮选不重复（状态外部传入）', () => {
  const pack: MultiPack = {
    type: 'multi',
    data: {
      press: { generic: [fakeBuf('g1'), fakeBuf('g2'), fakeBuf('g3')], special: {} },
      release: { generic: null, special: {} }
    }
  }
  const r1 = pickKeySound(pack, 30, 'down', defaultSnapshot, defaultStyle, defaultDsp, 0, { lastVariant: -1 })
  assert.notEqual((r1!.buffer as any).tag, undefined)
})

test('pack 无任何可用 buffer 返回 null', () => {
  const pack: SpritePack = {
    type: 'sprite', keys: new Map(),
    fallbackDown: null, fallbackUp: null
  }
  const r = pickKeySound(pack, 30, 'down', defaultSnapshot, defaultStyle, defaultDsp, 0)
  assert.equal(r, null)
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx tsx --test src/shared/audio/KeySampler.test.ts
```
Expected: 9 个 FAIL（module not found）。

- [ ] **Step 3: 实现 KeySampler**

`src/shared/audio/KeySampler.ts`:

```typescript
import type { TypingSnapshot } from './TypingAnalytics.ts'

export type KeyBuffer = unknown // opaque; main 侧是 native decoded buffer, renderer 侧是 AudioBuffer

export interface SpriteKeySound { down?: KeyBuffer; up?: KeyBuffer }
export interface SpritePack {
  type: 'sprite'
  keys: Map<number, SpriteKeySound>
  fallbackDown: KeyBuffer | null
  fallbackUp: KeyBuffer | null
}
export interface MultiPackData {
  press: { generic: KeyBuffer[]; special: Record<string, KeyBuffer> }
  release: { generic: KeyBuffer | null; special: Record<string, KeyBuffer> }
}
export interface MultiPack { type: 'multi'; data: MultiPackData }
export type SamplerPack = SpritePack | MultiPack

export interface ModeStyleInput {
  intensityLocked: boolean
  pitchJitter: number
  volumeJitter: number
}
export interface SwitchDspInput {
  topDownBalanceDb: number
  decayScale: number
}

export interface PickResult {
  buffer: KeyBuffer
  volume: number
  pitch: number
  pan: number // 不在这里算，调用方 own；但为了将来加入预留字段
  duration: number
}

export interface PickState {
  lastVariant?: number
}

const SPECIAL_KEYS: Record<number, string> = {
  14: 'BACKSPACE', 28: 'ENTER', 41: 'ENTER', 57: 'SPACE'
}
const MAX_DUR = 0.40

function dbToGain(db: number): number { return Math.pow(10, db / 20) }

function pickVariant(variants: KeyBuffer[], state: PickState): KeyBuffer | undefined {
  if (!variants.length) return undefined
  if (variants.length === 1) return variants[0]
  let i: number
  do { i = Math.floor(Math.random() * variants.length) } while (i === state.lastVariant)
  state.lastVariant = i
  return variants[i]
}

export function pickKeySound(
  pack: SamplerPack,
  keycode: number,
  type: 'down' | 'up' | 'repeat',
  snapshot: TypingSnapshot,
  style: ModeStyleInput,
  dsp: SwitchDspInput,
  activeVoices: number,
  state: PickState = {}
): PickResult | null {
  // --- 选 buffer ---
  let buffer: KeyBuffer | null | undefined
  let bufferDurationSec = 0.1 // 默认；真实 buffer 会替换

  if (pack.type === 'sprite') {
    const ks = pack.keys.get(keycode)
    if (type === 'down' || type === 'repeat') buffer = ks?.down ?? pack.fallbackDown
    else buffer = ks?.up ?? pack.fallbackUp
  } else {
    const special = SPECIAL_KEYS[keycode]
    if (type === 'down' || type === 'repeat') {
      buffer = (special && pack.data.press.special[special]) || pickVariant(pack.data.press.generic, state)
    } else {
      buffer = (special && pack.data.release.special[special]) || pack.data.release.generic
    }
  }
  if (!buffer) return null

  // 从 buffer 取 duration（契约：KeyBuffer 有 .duration 字段）
  bufferDurationSec = (buffer as any).duration ?? 0.1

  // --- 算 volume ---
  let finalVol: number
  let pitch: number

  if (type === 'repeat') {
    // 固定 intensity=0.5 → volIntensity=0.75，忽略 activeVoices / jitter / balance
    finalVol = 0.75 * snapshot.adaptiveMul
    pitch = 1.0
  } else {
    const effIntensity = style.intensityLocked ? 0.7 : snapshot.intensity
    const volIntensity = 0.5 + effIntensity * 0.5

    const duckFactor = activeVoices > 8 ? 0.8 / Math.sqrt(activeVoices - 7) : 1.0
    const volSpan = style.volumeJitter * 2
    const microRandom = (1 - style.volumeJitter) + Math.random() * volSpan
    const balanceFactor = type === 'up' ? dbToGain(dsp.topDownBalanceDb) : 1

    finalVol = volIntensity * snapshot.adaptiveMul * duckFactor * microRandom * balanceFactor

    // pitch
    const pitchBase = style.intensityLocked
      ? 1.0
      : 1.0 + (1.0 - effIntensity) * 0.03 - effIntensity * 0.02
    const keyChar = ((keycode * 2654435761 >>> 0) % 200 - 100) / 10000
    const pitchJitter = (Math.random() - 0.5) * style.pitchJitter * 2
    pitch = pitchBase + keyChar + pitchJitter
  }

  const duration = Math.min(bufferDurationSec * dsp.decayScale, MAX_DUR)

  return { buffer, volume: finalVol, pitch, pan: 0, duration }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx tsx --test src/shared/audio/KeySampler.test.ts
```
Expected: 9 个 test 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/audio/KeySampler.ts src/shared/audio/KeySampler.test.ts
git commit -m "refactor(audio): 提取 pickKeySound 纯函数 + 9 个单测"
```

### Task 1.3：把 AudioEngine 接到新模块（仍在 renderer）

**Files:**
- Modify: `src/renderer/audio/AudioEngine.ts`

> 目的：让 AudioEngine 内部调用新提取的 `TypingAnalytics` 和 `pickKeySound`，但对外 API 不变。

- [ ] **Step 1: 在 AudioEngine 内 import 新模块**

修改 `src/renderer/audio/AudioEngine.ts` 顶部 import 区：

```typescript
import { getKeyPan } from '@shared/key-positions'
import { Mode, ModeStyle, getMode, DEFAULT_MODE_ID, SwitchDsp, DEFAULT_SWITCH_DSP, dbToGain } from '@shared/modes'
import { TypingAnalytics } from '@shared/audio/TypingAnalytics'
import { pickKeySound, type SamplerPack, type PickState } from '@shared/audio/KeySampler'
import { ArcadeOverlayLayer } from './arcade/ArcadeOverlayLayer.ts'
import { ArcadeHudController } from './arcade/ArcadeHudController.ts'
```

- [ ] **Step 2: 把 AudioEngine 里的 intensity/WPM/fatigue 字段替换为 TypingAnalytics 实例**

删除 `AudioEngine` 里的字段：`lastKeyTime`, `typingIntensity`, `keyIntensityMap`, `baseVolume`（保留）`adaptiveMultiplier`, `typingStartTime`, `lastAdaptiveUpdate`, `adaptiveTimer`, `keyTimestamps`, `_wpm`, `_typingActive`, `typingTimeout`。

新增一个字段：

```typescript
private analytics = new TypingAnalytics()
```

删除 `updateIntensity()`, `updateAdaptiveVolume()`, `updateWpm()` 方法。

- [ ] **Step 3: 在 `playSound` 里改用 analytics**

把 `playSound` 里原本那一堆副作用调用：

```typescript
// 删这几行
if (type === 'down') this.updateWpm()
this.updateIntensity()
this.updateAdaptiveVolume()
```

替换为：

```typescript
this.analytics.recordKey(performance.now(), keycode, type)
const snapshot = this.analytics.snapshot()
```

把后面所有 `this.typingIntensity` 换成 `snapshot.intensity`；`this.adaptiveMultiplier` 换成 `snapshot.adaptiveMul`；`this._wpm` 换成 `snapshot.wpm`；`this._typingActive` 换成 `snapshot.typingActive`。

- [ ] **Step 4: 在 `setMode` 里同步 arcade 开关给 analytics**

```typescript
setMode(modeOrId: string | Mode) {
  // ... 原有代码
  this.currentMode = mode
  this.analytics.setArcadeEnabled(mode.arcadeEnabled) // ← 新增这行
  // ...
}
```

- [ ] **Step 5: 用 pickKeySound 替换 playSound 里的内联选 buffer/算音量逻辑**

把 `playSound` 里 L461–642 那一大段（选 buffer、算 volIntensity、duckFactor、pitchBase、keyChar 等）替换为一次 `pickKeySound` 调用 + 只保留"副作用"部分（acquireSlot / 调度 / pan / schedule gain ramp）。

示意（仅核心部分，完整替换整个函数）：

```typescript
playSound(keycode: number, type: 'down' | 'up' | 'repeat'): void {
  if (!this._enabled || !this.ctx || !this.masterGain) return
  const pack = this.packs.get(this.activeProfile) as SamplerPack | undefined
  if (!pack) return

  this.analytics.recordKey(performance.now(), keycode, type)
  const snapshot = this.analytics.snapshot()

  const picked = pickKeySound(
    pack, keycode, type, snapshot,
    this.currentMode.style,
    this.currentDsp,
    this.activeVoices,
    this.pickState
  )
  if (!picked) return

  const now = this.ctx.currentTime
  const playTime = now + SCHEDULE_OFFSET

  const slot = this.acquireSlot()
  const source = this.ctx.createBufferSource()
  source.buffer = picked.buffer as AudioBuffer
  source.playbackRate.value = picked.pitch

  slot.gain.gain.setValueAtTime(picked.volume, playTime)
  slot.panner.pan.setValueAtTime(getKeyPan(keycode), playTime)
  source.connect(slot.gain)
  slot.source = source

  const dur = picked.duration
  const fadeStart = Math.max(0, dur - 0.025)
  slot.gain.gain.setValueAtTime(picked.volume, playTime + fadeStart)
  slot.gain.gain.linearRampToValueAtTime(0, playTime + dur)
  source.start(playTime)
  source.stop(playTime + dur)
  source.onended = () => this.releaseSlot(slot)

  if (type === 'down' && this.currentMode.arcadeEnabled) {
    const nowMs = performance.now()
    this.overlayLayer.onKeydown(nowMs, playTime)
  }
}
```

新增字段：

```typescript
private pickState: PickState = {}
```

**同时删掉 L525–556 那段重复的 repeat 代码**（原本就是合并冲突遗留）。

- [ ] **Step 6: 把 wpm / typingActive getter 也改走 analytics**

```typescript
get wpm() { return this.analytics.snapshot().wpm }
get typingActive() { return this.analytics.snapshot().typingActive }
```

- [ ] **Step 7: 运行时验证**

```bash
npm run dev
```
Expected: app 正常启动、按键有声、mode 切换无崩、arcade 模式工作正常。跑一遍 spec §7.4 的 8 条手测清单。

- [ ] **Step 8: Commit**

```bash
git add src/renderer/audio/AudioEngine.ts
git commit -m "refactor(audio): AudioEngine 接入新的 TypingAnalytics + pickKeySound

- 删除内联的 intensity/WPM/fatigue 字段与方法
- 删除 playSound 里重复的 repeat 代码块（合并冲突遗留）
- 运行时行为保持不变，8 条手测清单通过"
```

---

## PR-2｜Main audio 骨架

**目的**：在 main 进程搭起 `AudioCoreService` + `AudioGraph` + `SoundPackStore` + `Lifecycle` + `AudioBackend` 抽象，通过一个"播 beep"测试跑通完整链路。不接 key 事件，不改默认音频路径。

**前置**：PR-0 已选定 native binding（假设 `miniaudio-napi`；如不是，下面代码里 import 需替换）。

### Task 2.1：装 native binding 依赖

- [ ] **Step 1: 装依赖**

```bash
cd /Users/pochita-/Projects/pekko
npm install miniaudio-napi --save
npm install @types/node --save-dev  # 如果还没装
```

- [ ] **Step 2: 在 electron-builder 配置里确保 .node 文件被打包**

修改 `package.json` 或 `electron-builder.yml`，加 `asarUnpack`:

```yaml
# electron-builder.yml
asarUnpack:
  - "**/node_modules/miniaudio-napi/**/*.node"
```

- [ ] **Step 3: 重新 rebuild 验证**

```bash
npm run postinstall  # 触发 electron-builder install-app-deps
npm run build:main
```
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "build(audio): 添加 miniaudio-napi 依赖 + electron-builder asar 解包"
```

### Task 2.2：定义 AudioBackend 接口 + mock 实现

**Files:**
- Create: `src/main/audio/bindings/types.ts`
- Create: `src/main/audio/bindings/mock.ts`
- Create: `src/main/audio/bindings/mock.test.ts`

- [ ] **Step 1: 写 AudioBackend 接口**

`src/main/audio/bindings/types.ts`:

```typescript
export interface BackendPlayParams {
  volume: number
  pitch: number
  pan: number
  durationSec: number
}

export interface DecodedAudio {
  readonly id: string  // opaque handle
  readonly duration: number
  readonly sampleRate: number
  readonly numberOfChannels: number
}

export interface AudioBackend {
  open(sampleRate: number): Promise<void>
  isOpen(): boolean
  decode(bytes: Uint8Array): Promise<DecodedAudio>
  play(audio: DecodedAudio, params: BackendPlayParams): void
  setMasterGain(gain: number): void
  close(): Promise<void>
  outputLatencyMs(): number
}
```

- [ ] **Step 2: 写失败测试（mock backend 的契约测试）**

`src/main/audio/bindings/mock.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MockBackend } from './mock.ts'

test('open 后 isOpen 返回 true', async () => {
  const b = new MockBackend()
  assert.equal(b.isOpen(), false)
  await b.open(44100)
  assert.equal(b.isOpen(), true)
})

test('close 后 isOpen 返回 false', async () => {
  const b = new MockBackend()
  await b.open(44100)
  await b.close()
  assert.equal(b.isOpen(), false)
})

test('decode 返回 DecodedAudio 含 duration', async () => {
  const b = new MockBackend()
  await b.open(44100)
  const d = await b.decode(new Uint8Array([0, 0, 0, 0]))
  assert.ok(d.id)
  assert.ok(d.duration > 0)
})

test('play 在未 open 状态下抛错', () => {
  const b = new MockBackend()
  const fake = { id: 'x', duration: 0.1, sampleRate: 44100, numberOfChannels: 2 }
  assert.throws(() => b.play(fake, { volume: 1, pitch: 1, pan: 0, durationSec: 0.1 }))
})

test('play 在 open 状态下记录到历史', async () => {
  const b = new MockBackend()
  await b.open(44100)
  const fake = { id: 'x', duration: 0.1, sampleRate: 44100, numberOfChannels: 2 }
  b.play(fake, { volume: 0.5, pitch: 1.0, pan: 0, durationSec: 0.05 })
  assert.equal(b.playHistory.length, 1)
  assert.equal(b.playHistory[0].params.volume, 0.5)
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
npx tsx --test src/main/audio/bindings/mock.test.ts
```
Expected: 5 个 FAIL。

- [ ] **Step 4: 实现 MockBackend**

`src/main/audio/bindings/mock.ts`:

```typescript
import type { AudioBackend, BackendPlayParams, DecodedAudio } from './types.ts'

export class MockBackend implements AudioBackend {
  private opened = false
  private nextId = 0
  public playHistory: { audio: DecodedAudio; params: BackendPlayParams; tsMs: number }[] = []
  public masterGain = 1.0

  async open(_sampleRate: number): Promise<void> { this.opened = true }
  isOpen(): boolean { return this.opened }

  async decode(bytes: Uint8Array): Promise<DecodedAudio> {
    if (!this.opened) throw new Error('MockBackend: decode before open')
    return {
      id: `mock-${this.nextId++}`,
      duration: Math.max(0.05, bytes.length / 44100),
      sampleRate: 44100,
      numberOfChannels: 2
    }
  }

  play(audio: DecodedAudio, params: BackendPlayParams): void {
    if (!this.opened) throw new Error('MockBackend: play before open')
    this.playHistory.push({ audio, params, tsMs: performance.now() })
  }

  setMasterGain(gain: number): void { this.masterGain = gain }

  async close(): Promise<void> { this.opened = false }

  outputLatencyMs(): number { return 5 }
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx tsx --test src/main/audio/bindings/mock.test.ts
```
Expected: 5 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/main/audio/bindings/
git commit -m "feat(audio): 定义 AudioBackend 接口 + MockBackend 实现"
```

### Task 2.3：Lifecycle FSM

**Files:**
- Create: `src/main/audio/Lifecycle.ts`
- Create: `src/main/audio/Lifecycle.test.ts`

- [ ] **Step 1: 写失败测试**

`src/main/audio/Lifecycle.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lifecycle, LifecycleEvent } from './Lifecycle.ts'

test('起始状态是 Cold', () => {
  const l = new Lifecycle()
  assert.equal(l.state, 'Cold')
})

test('Cold → Booting via start', () => {
  const l = new Lifecycle()
  l.transition('start')
  assert.equal(l.state, 'Booting')
})

test('Booting → Ready via boot-ok', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-ok')
  assert.equal(l.state, 'Ready')
})

test('Booting → Failed via boot-fail', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-fail', { reason: 'device busy' })
  assert.equal(l.state, 'Failed')
  assert.equal(l.failureReason, 'device busy')
})

test('Ready → Suspended via suspend', () => {
  const l = new Lifecycle()
  l.transition('start'); l.transition('boot-ok')
  l.transition('suspend', { reason: 'sleep' })
  assert.equal(l.state, 'Suspended')
})

test('Suspended → Recovering → Ready', () => {
  const l = new Lifecycle()
  l.transition('start'); l.transition('boot-ok'); l.transition('suspend')
  l.transition('wake')
  assert.equal(l.state, 'Recovering')
  l.transition('recover-ok')
  assert.equal(l.state, 'Ready')
})

test('Recovering 3 次失败 → Failed', () => {
  const l = new Lifecycle()
  l.transition('start'); l.transition('boot-ok'); l.transition('suspend'); l.transition('wake')
  assert.equal(l.state, 'Recovering')
  assert.equal(l.recoverAttempt, 1)
  l.transition('recover-fail')
  assert.equal(l.state, 'Recovering')
  assert.equal(l.recoverAttempt, 2)
  l.transition('recover-fail')
  assert.equal(l.state, 'Recovering')
  assert.equal(l.recoverAttempt, 3)
  l.transition('recover-fail')
  assert.equal(l.state, 'Failed')
})

test('Failed → Recovering via manual-retry', () => {
  const l = new Lifecycle()
  l.transition('start'); l.transition('boot-fail')
  l.transition('manual-retry')
  assert.equal(l.state, 'Recovering')
})

test('非法转移抛错', () => {
  const l = new Lifecycle()
  assert.throws(() => l.transition('suspend' as LifecycleEvent))
})

test('on(state-change, cb) 触发回调', () => {
  const l = new Lifecycle()
  const events: string[] = []
  l.on('state-change', (from, to) => events.push(`${from}→${to}`))
  l.transition('start')
  l.transition('boot-ok')
  assert.deepEqual(events, ['Cold→Booting', 'Booting→Ready'])
})

test('shutdown 从任何状态进入 Shutdown', () => {
  const l = new Lifecycle()
  l.transition('start'); l.transition('boot-ok')
  l.transition('shutdown')
  assert.equal(l.state, 'Shutdown')
})

test('Shutdown 终态拒绝所有转移', () => {
  const l = new Lifecycle()
  l.transition('shutdown')
  assert.throws(() => l.transition('start'))
})
```

- [ ] **Step 2: 跑测试失败**

```bash
npx tsx --test src/main/audio/Lifecycle.test.ts
```
Expected: 12 FAIL。

- [ ] **Step 3: 实现 Lifecycle**

`src/main/audio/Lifecycle.ts`:

```typescript
export type LifecycleState =
  | 'Cold' | 'Booting' | 'Ready' | 'Suspended' | 'Recovering' | 'Failed' | 'Shutdown'

export type LifecycleEvent =
  | 'start' | 'boot-ok' | 'boot-fail'
  | 'suspend' | 'wake' | 'recover-ok' | 'recover-fail'
  | 'manual-retry' | 'shutdown'

type TransitionMeta = { reason?: string }

type StateChangeListener = (from: LifecycleState, to: LifecycleState, meta?: TransitionMeta) => void

const MAX_RECOVER_ATTEMPTS = 3

export class Lifecycle {
  private _state: LifecycleState = 'Cold'
  private _recoverAttempt = 0
  private _failureReason: string | null = null
  private _suspendReason: 'sleep' | 'lock' | 'manual' | null = null
  private listeners: StateChangeListener[] = []

  get state(): LifecycleState { return this._state }
  get recoverAttempt(): number { return this._recoverAttempt }
  get failureReason(): string | null { return this._failureReason }
  get suspendReason() { return this._suspendReason }

  on(event: 'state-change', cb: StateChangeListener): void {
    if (event === 'state-change') this.listeners.push(cb)
  }

  transition(event: LifecycleEvent, meta: TransitionMeta = {}): void {
    const next = this.nextState(event, meta)
    if (!next) {
      throw new Error(`Lifecycle: illegal transition ${event} from ${this._state}`)
    }
    const from = this._state
    this._state = next
    for (const cb of this.listeners) cb(from, next, meta)
  }

  private nextState(event: LifecycleEvent, meta: TransitionMeta): LifecycleState | null {
    // Shutdown is terminal
    if (this._state === 'Shutdown') return null

    // Global: shutdown from any state
    if (event === 'shutdown') return 'Shutdown'

    switch (this._state) {
      case 'Cold':
        if (event === 'start') return 'Booting'
        return null
      case 'Booting':
        if (event === 'boot-ok') { this._recoverAttempt = 0; this._failureReason = null; return 'Ready' }
        if (event === 'boot-fail') { this._failureReason = meta.reason ?? 'unknown'; return 'Failed' }
        return null
      case 'Ready':
        if (event === 'suspend') {
          this._suspendReason = (meta.reason as any) ?? 'manual'
          return 'Suspended'
        }
        return null
      case 'Suspended':
        if (event === 'wake') { this._recoverAttempt = 1; return 'Recovering' }
        if (event === 'shutdown') return 'Shutdown'
        return null
      case 'Recovering':
        if (event === 'recover-ok') { this._recoverAttempt = 0; this._failureReason = null; return 'Ready' }
        if (event === 'recover-fail') {
          if (this._recoverAttempt >= MAX_RECOVER_ATTEMPTS) {
            this._failureReason = `recover exhausted after ${MAX_RECOVER_ATTEMPTS} attempts`
            return 'Failed'
          }
          this._recoverAttempt += 1
          return 'Recovering'
        }
        return null
      case 'Failed':
        if (event === 'manual-retry') { this._recoverAttempt = 1; return 'Recovering' }
        return null
    }
  }
}
```

- [ ] **Step 4: 跑测试通过**

```bash
npx tsx --test src/main/audio/Lifecycle.test.ts
```
Expected: 12 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/audio/Lifecycle.ts src/main/audio/Lifecycle.test.ts
git commit -m "feat(audio): Lifecycle FSM（7 状态 + 12 个单测）"
```

### Task 2.4：SoundPackStore

**Files:**
- Create: `src/main/audio/SoundPackStore.ts`
- Create: `src/main/audio/SoundPackStore.test.ts`

> 现有 `src/main/ipc-handlers.ts` 已经有 `load-sound-pack` 逻辑（读 `assets/sounds/{profileId}/` 目录）。SoundPackStore 复用这部分 fs 逻辑，但用 `AudioBackend.decode` 替代浏览器 `decodeAudioData`。

- [ ] **Step 1: 看现有 load-sound-pack 逻辑**

```bash
# 先读一遍
```
阅读 `src/main/ipc-handlers.ts` 里 `load-sound-pack` handler，把"从文件系统加载 bytes + config"部分抽出来，重用。

- [ ] **Step 2: 写测试**

`src/main/audio/SoundPackStore.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SoundPackStore } from './SoundPackStore.ts'
import { MockBackend } from './bindings/mock.ts'

test('加载不存在的 profile 返回 null', async () => {
  const backend = new MockBackend()
  await backend.open(44100)
  const store = new SoundPackStore(backend)
  const ok = await store.load('does-not-exist')
  assert.equal(ok, false)
})

test('加载后 get 返回 pack', async () => {
  const backend = new MockBackend()
  await backend.open(44100)
  const store = new SoundPackStore(backend)
  // 用一个已知存在的 pekko pack — 这里用 fixture 目录
  const ok = await store.load('__test_fixture_sprite__', '/path/to/test/fixtures')
  assert.ok(ok)
  const pack = store.get('__test_fixture_sprite__')
  assert.ok(pack)
})

test('getBuffer sprite pack 命中 + fallback', async () => {
  const backend = new MockBackend()
  await backend.open(44100)
  const store = new SoundPackStore(backend)
  await store.load('__test_fixture_sprite__', '/path/to/test/fixtures')
  // 命中
  const hit = store.getBuffer('__test_fixture_sprite__', 30, 'down')
  assert.ok(hit)
  // fallback
  const miss = store.getBuffer('__test_fixture_sprite__', 999, 'down')
  assert.ok(miss, 'should return fallback')
})

test('buffer 在 close→open 后不丢失', async () => {
  const backend = new MockBackend()
  await backend.open(44100)
  const store = new SoundPackStore(backend)
  await store.load('__test_fixture_sprite__', '/path/to/test/fixtures')
  // 模拟 close/open 周期
  await backend.close()
  await backend.open(44100)
  const pack = store.get('__test_fixture_sprite__')
  assert.ok(pack, 'pack survives backend cycle')
})
```

创建 fixture `src/main/audio/__fixtures__/__test_fixture_sprite__/config.json` 和 `sound.ogg`（可以软链到现有 pekko pack）。

- [ ] **Step 3: 跑测试失败**

- [ ] **Step 4: 实现 SoundPackStore**

`src/main/audio/SoundPackStore.ts`:

```typescript
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { AudioBackend, DecodedAudio } from './bindings/types.ts'
import type { SamplerPack, SpritePack, MultiPack } from '../../shared/audio/KeySampler.ts'

// Wrapper 把 DecodedAudio 作为 KeyBuffer（KeyBuffer 是 opaque）
// KeySampler.pick 只需要 .duration 字段，DecodedAudio 提供了

export class SoundPackStore {
  private packs = new Map<string, SamplerPack>()

  constructor(private backend: AudioBackend) {}

  async load(profileId: string, baseDir?: string): Promise<boolean> {
    const dir = path.join(baseDir ?? this.defaultBaseDir(), profileId)
    try {
      const configRaw = await fs.readFile(path.join(dir, 'config.json'), 'utf8')
      const config = JSON.parse(configRaw)
      const type = config.key_define_type

      if (type === 'single') {
        const sprite = await fs.readFile(path.join(dir, config.sound ?? 'sound.ogg'))
        await this.loadSpritePack(profileId, config, sprite)
      } else if (type === 'multi') {
        await this.loadMultiFilePack(profileId, config, dir)
      } else if (type === 'kbsim') {
        await this.loadKbsimPack(profileId, config, dir)
      } else {
        return false
      }
      return true
    } catch {
      return false
    }
  }

  get(profileId: string): SamplerPack | undefined {
    return this.packs.get(profileId)
  }

  getBuffer(profileId: string, keycode: number, type: 'down' | 'up'): DecodedAudio | null {
    const pack = this.packs.get(profileId)
    if (!pack) return null
    if (pack.type === 'sprite') {
      const ks = pack.keys.get(keycode)
      if (type === 'down') return (ks?.down as DecodedAudio) ?? (pack.fallbackDown as DecodedAudio) ?? null
      else return (ks?.up as DecodedAudio) ?? (pack.fallbackUp as DecodedAudio) ?? null
    }
    return null // multi pack 通过 pickKeySound 直接拿
  }

  private async loadSpritePack(id: string, config: any, spriteBytes: Buffer) {
    const fullBuffer = await this.backend.decode(new Uint8Array(spriteBytes))
    const keys = new Map()
    const entries = Object.entries(config.defines as Record<string, [number, number]>)
    let fallbackDown: DecodedAudio | null = null
    let fallbackUp: DecodedAudio | null = null

    // Spike 结论决定：backend 是否支持 slice？假设支持 backend.slice(full, offsetMs, durMs) → DecodedAudio
    // 如果不支持，我们需要在 store 这一层保存 full + offset/dur，播放时 backend.play(full, {offsetMs, durMs})
    // 下面按 slice 支持写；spike 确认后按实际调整
    for (const [key, [offsetMs, durMs]] of entries) {
      const isUp = key.endsWith('-up')
      const kc = parseInt(isUp ? key.replace('-up', '') : key)
      const sliced = await (this.backend as any).slice(fullBuffer, offsetMs, durMs)
      if (!keys.has(kc)) keys.set(kc, {})
      if (isUp) keys.get(kc).up = sliced
      else keys.get(kc).down = sliced
      if (kc === 30) { if (isUp) fallbackUp = sliced; else fallbackDown = sliced }
    }
    if (!fallbackDown) for (const [, v] of keys) { if (v.down) { fallbackDown = v.down; break } }
    if (!fallbackUp) for (const [, v] of keys) { if (v.up) { fallbackUp = v.up; break } }

    const pack: SpritePack = { type: 'sprite', keys, fallbackDown, fallbackUp }
    this.packs.set(id, pack)
  }

  private async loadMultiFilePack(_id: string, _config: any, _dir: string) {
    // Sprite-only 版本：multi/kbsim 在 Task 2.4.b 补齐
  }

  private async loadKbsimPack(_id: string, _config: any, _dir: string) {
    // Sprite-only 版本：multi/kbsim 在 Task 2.4.b 补齐
  }

  private defaultBaseDir(): string {
    // app.getAppPath() + '/assets/sounds' — 由调用方传入更干净
    return path.join(process.cwd(), 'assets', 'sounds')
  }
}
```

> **注意**：`loadSpritePack` 里的 `backend.slice` 依赖 PR-0 spike 结论。如果 native binding 不支持 slice，改成"存 full + offset/dur，播放时传参"的变体。完整 multi/kbsim 的实现在此 task 里只做 sprite，其他两种在 Task 2.4.b 补。

- [ ] **Step 5: 跑测试**

```bash
npx tsx --test src/main/audio/SoundPackStore.test.ts
```
Expected: PASS（可能需要调整 fixture 路径）。

- [ ] **Step 6: Commit**

```bash
git add src/main/audio/SoundPackStore.ts src/main/audio/SoundPackStore.test.ts src/main/audio/__fixtures__/
git commit -m "feat(audio): SoundPackStore 纯逻辑 + sprite 加载 + 单测"
```

### Task 2.4.b：补 multi / kbsim pack 加载

**Files:**
- Modify: `src/main/audio/SoundPackStore.ts`
- Modify: `src/main/audio/SoundPackStore.test.ts`

- [ ] **Step 1: 加 multi 测试**

在 `SoundPackStore.test.ts` 里加：

```typescript
test('loadMultiFilePack 正确载入每个 key 独立文件', async () => {
  // 用一个 multi fixture
  const store = new SoundPackStore(new MockBackend())
  await store.load('__test_fixture_multi__', '/path/to/test/fixtures')
  const pack = store.get('__test_fixture_multi__')
  assert.ok(pack)
  assert.equal(pack!.type, 'sprite') // multi 归一化成 sprite 结构
})

test('loadKbsimPack 正确分 press/release 目录', async () => {
  const store = new SoundPackStore(new MockBackend())
  await store.load('__test_fixture_kbsim__', '/path/to/test/fixtures')
  const pack = store.get('__test_fixture_kbsim__')
  assert.ok(pack)
  assert.equal(pack!.type, 'multi')
})
```

- [ ] **Step 2: 补实现（对照 `AudioEngine.loadMultiFilePack` 和 `loadKbsimPack`，改 main fs API）**

```typescript
private async loadMultiFilePack(id: string, config: any, dir: string) {
  const keys = new Map()
  for (const [k, fn] of Object.entries(config.defines || {})) {
    const isUp = k.endsWith('-up')
    const kc = parseInt(isUp ? k.replace('-up', '') : k)
    try {
      const bytes = await fs.readFile(path.join(dir, fn as string))
      const buf = await this.backend.decode(new Uint8Array(bytes))
      if (!keys.has(kc)) keys.set(kc, {})
      if (isUp) keys.get(kc).up = buf
      else keys.get(kc).down = buf
    } catch { /* skip missing file */ }
  }
  let fd: DecodedAudio | null = null, fu: DecodedAudio | null = null
  for (const [, v] of keys) { if (v.down && !fd) fd = v.down; if (v.up && !fu) fu = v.up }
  this.packs.set(id, { type: 'sprite', keys, fallbackDown: fd, fallbackUp: fu })
}

private async loadKbsimPack(id: string, _config: any, dir: string) {
  const pack: MultiPack['data'] = { press: { generic: [], special: {} }, release: { generic: null, special: {} } }
  const pressDir = path.join(dir, 'press')
  const releaseDir = path.join(dir, 'release')

  const loadFolder = async (folder: string, into: { generic: any[]; special: Record<string, any> }) => {
    try {
      const files = await fs.readdir(folder)
      for (const fn of files) {
        const bytes = await fs.readFile(path.join(folder, fn))
        const buf = await this.backend.decode(new Uint8Array(bytes))
        if (fn.startsWith('GENERIC_R')) into.generic.push(buf)
        else if (fn.startsWith('GENERIC')) into.generic.push(buf) // single generic
        else into.special[fn.replace(/\.\w+$/, '')] = buf
      }
    } catch {}
  }

  await loadFolder(pressDir, pack.press)
  const relWrapper = { generic: [] as any[], special: pack.release.special }
  await loadFolder(releaseDir, relWrapper)
  pack.release.generic = relWrapper.generic[0] ?? null

  this.packs.set(id, { type: 'multi', data: pack })
}
```

- [ ] **Step 3: 跑测试**

```bash
npx tsx --test src/main/audio/SoundPackStore.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/main/audio/SoundPackStore.ts src/main/audio/SoundPackStore.test.ts
git commit -m "feat(audio): SoundPackStore 支持 multi / kbsim pack"
```

### Task 2.5：AudioGraph（最小版本：open → play buffer）

**Files:**
- Create: `src/main/audio/AudioGraph.ts`
- Create: `src/main/audio/AudioGraph.test.ts`

- [ ] **Step 1: 测试**

`src/main/audio/AudioGraph.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioGraph } from './AudioGraph.ts'
import { MockBackend } from './bindings/mock.ts'

test('init 打开 backend', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  assert.equal(b.isOpen(), true)
})

test('playBuffer 调 backend.play 并记录 activeVoices', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  const fake = { id: 'x', duration: 0.1, sampleRate: 44100, numberOfChannels: 2 }
  g.playBuffer(fake, { volume: 0.5, pitch: 1.0, pan: 0, durationSec: 0.05 })
  assert.equal(b.playHistory.length, 1)
})

test('setMasterGain 透传', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  g.setMasterGain(0.3)
  assert.equal(b.masterGain, 0.3)
})

test('teardown 关闭 backend', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  await g.teardown()
  assert.equal(b.isOpen(), false)
})
```

- [ ] **Step 2: 失败**

- [ ] **Step 3: 实现**

`src/main/audio/AudioGraph.ts`:

```typescript
import type { AudioBackend, BackendPlayParams, DecodedAudio } from './bindings/types.ts'

export class AudioGraph {
  constructor(private backend: AudioBackend) {}

  async init(): Promise<void> {
    await this.backend.open(44100)
  }

  playBuffer(audio: DecodedAudio, params: BackendPlayParams): void {
    if (!this.backend.isOpen()) return
    this.backend.play(audio, params)
  }

  setMasterGain(gain: number): void {
    this.backend.setMasterGain(gain)
  }

  outputLatencyMs(): number {
    return this.backend.outputLatencyMs()
  }

  async teardown(): Promise<void> {
    await this.backend.close()
  }
}
```

> **注**：当前极简版只透传。DSP filter ramp（`rampFilter(name, target, ms)` + 后端侧 filter 链）在 Task 4.2 补齐。如果选定 native binding 自带 DSP 链，在 AudioGraph 里包装其 API；如不自带，用软件 DSP（biquad IIR 在 CPU 上处理）——具体策略 Task 4.2 Step 1 决定。

- [ ] **Step 4: 跑过**

- [ ] **Step 5: Commit**

```bash
git add src/main/audio/AudioGraph.ts src/main/audio/AudioGraph.test.ts
git commit -m "feat(audio): AudioGraph 最小版（open/playBuffer/teardown）"
```

### Task 2.6：AudioCoreService（编排，最小版本）

**Files:**
- Create: `src/main/audio/index.ts`
- Create: `src/main/audio/AudioCoreService.integration.test.ts`

- [ ] **Step 1: 集成测试**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioCoreService } from './index.ts'
import { MockBackend } from './bindings/mock.ts'

test('start() 完成后 state === Ready', async () => {
  const backend = new MockBackend()
  const svc = new AudioCoreService({ backend })
  await svc.start()
  assert.equal(svc.getState().phase, 'ready')
})

test('state === Ready 以外 onKey 不触发 play', async () => {
  const backend = new MockBackend()
  const svc = new AudioCoreService({ backend })
  // 未 start
  svc.onKey(30, 'down', performance.now())
  assert.equal(backend.playHistory.length, 0)
})

test('Ready 下 onKey 触发 backend.play', async () => {
  const backend = new MockBackend()
  const svc = new AudioCoreService({ backend })
  await svc.start()
  await svc.setProfile('__test_fixture_sprite__')
  svc.onKey(30, 'down', performance.now())
  assert.ok(backend.playHistory.length >= 1)
})

test('pause() → resume() 经历 close→open', async () => {
  const backend = new MockBackend()
  const svc = new AudioCoreService({ backend })
  await svc.start()
  await svc.pause('sleep')
  assert.equal(backend.isOpen(), false)
  await svc.resume()
  assert.equal(backend.isOpen(), true)
  assert.equal(svc.getState().phase, 'ready')
})

test('setEnabled(false) 设置 masterGain=0，Lifecycle 不变', async () => {
  const backend = new MockBackend()
  const svc = new AudioCoreService({ backend })
  await svc.start()
  svc.setEnabled(false)
  assert.equal(backend.masterGain, 0)
  assert.equal(svc.getState().phase, 'ready')
})
```

- [ ] **Step 2: 失败**

- [ ] **Step 3: 实现 AudioCoreService**

`src/main/audio/index.ts`:

```typescript
import { EventEmitter } from 'node:events'
import type { AudioBackend } from './bindings/types.ts'
import { AudioGraph } from './AudioGraph.ts'
import { Lifecycle, type LifecycleState } from './Lifecycle.ts'
import { SoundPackStore } from './SoundPackStore.ts'
import { TypingAnalytics } from '../../shared/audio/TypingAnalytics.ts'
import { pickKeySound, type PickState } from '../../shared/audio/KeySampler.ts'
import { getMode, DEFAULT_MODE_ID, DEFAULT_SWITCH_DSP, type Mode, type SwitchDsp } from '../../shared/modes.ts'

export interface AudioHealth {
  phase: 'booting' | 'ready' | 'suspended' | 'recovering' | 'failed'
  enabled?: boolean
  activeProfile?: string
  reason?: string
  canRetry?: boolean
  attempt?: number
}

export interface AudioCoreServiceOpts {
  backend: AudioBackend
  soundsBaseDir?: string
}

export class AudioCoreService extends EventEmitter {
  private backend: AudioBackend
  private graph: AudioGraph
  private store: SoundPackStore
  private lifecycle = new Lifecycle()
  private analytics = new TypingAnalytics()
  private pickState: PickState = {}

  private currentMode: Mode = getMode(DEFAULT_MODE_ID)
  private currentDsp: SwitchDsp = { ...DEFAULT_SWITCH_DSP }
  private activeProfile = ''
  private _enabled = true
  private baseVolume = 1.0
  private activeVoices = 0
  private soundsBaseDir: string | undefined

  constructor(opts: AudioCoreServiceOpts) {
    super()
    this.backend = opts.backend
    this.graph = new AudioGraph(this.backend)
    this.store = new SoundPackStore(this.backend)
    this.soundsBaseDir = opts.soundsBaseDir

    this.lifecycle.on('state-change', (from, to, meta) => {
      this.emit('health-change', this.getState())
    })
  }

  async start(): Promise<void> {
    this.lifecycle.transition('start')
    try {
      await this.graph.init()
      this.lifecycle.transition('boot-ok')
    } catch (err) {
      this.lifecycle.transition('boot-fail', { reason: String(err) })
    }
  }

  async pause(reason: 'sleep' | 'lock' | 'manual' = 'manual'): Promise<void> {
    if (this.lifecycle.state !== 'Ready') return
    this.lifecycle.transition('suspend', { reason })
    await this.graph.teardown()
  }

  async resume(): Promise<void> {
    if (this.lifecycle.state !== 'Suspended' && this.lifecycle.state !== 'Failed') return
    if (this.lifecycle.state === 'Failed') {
      this.lifecycle.transition('manual-retry')
    } else {
      this.lifecycle.transition('wake')
    }

    // 重试 3 次 (250ms backoff)
    for (let i = 0; i < 3; i++) {
      try {
        await this.graph.init()
        // reload active profile? no — store already has decoded buffers (if backend 支持保留)
        // 如果 backend.close 丢失 decoded，store 需重新 load；这由 spike 结论决定
        this.lifecycle.transition('recover-ok')
        return
      } catch (err) {
        this.lifecycle.transition('recover-fail', { reason: String(err) })
        if (this.lifecycle.state === 'Failed') return
        await new Promise(r => setTimeout(r, 250))
      }
    }
  }

  async manualRetry(): Promise<void> {
    if (this.lifecycle.state !== 'Failed') return
    await this.resume()
  }

  async setProfile(profileId: string): Promise<void> {
    const ok = await this.store.load(profileId, this.soundsBaseDir)
    if (ok) this.activeProfile = profileId
    this.emit('health-change', this.getState())
  }

  setMode(modeIdOrMode: string | Mode): void {
    this.currentMode = typeof modeIdOrMode === 'string' ? getMode(modeIdOrMode) : modeIdOrMode
    this.analytics.setArcadeEnabled(this.currentMode.arcadeEnabled)
    // DSP filter ramp (airLpf / highShelf / lowShelf / wetMix) 在 Task 4.2 补齐；
    // PR-2 阶段 AudioGraph 只做 playBuffer，mode/dsp 状态仅存储。
    this.emit('health-change', this.getState())
  }

  applySwitchDsp(dsp: SwitchDsp): void {
    this.currentDsp = dsp
    // 同 setMode：per-switch DSP ramp 在 Task 4.2 补齐。
  }

  setVolume(v: number): void {
    this.baseVolume = Math.max(0, Math.min(1, v))
    this.graph.setMasterGain(this._enabled ? this.baseVolume : 0)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
    this.graph.setMasterGain(v ? this.baseVolume : 0)
    this.emit('health-change', this.getState())
  }

  onKey(keycode: number, type: 'down' | 'up' | 'repeat', tsMs: number): void {
    if (this.lifecycle.state !== 'Ready') return
    if (!this._enabled) return

    const pack = this.store.get(this.activeProfile)
    if (!pack) return

    this.analytics.recordKey(tsMs, keycode, type)
    const snapshot = this.analytics.snapshot()

    const picked = pickKeySound(
      pack, keycode, type, snapshot,
      this.currentMode.style, this.currentDsp,
      this.activeVoices, this.pickState
    )
    if (!picked) return

    this.activeVoices++
    this.graph.playBuffer(picked.buffer as any, {
      volume: picked.volume, pitch: picked.pitch,
      pan: picked.pan, durationSec: picked.duration
    })
    // decrement approx after duration; simple timer
    setTimeout(() => { this.activeVoices = Math.max(0, this.activeVoices - 1) }, picked.duration * 1000)
  }

  async stop(): Promise<void> {
    this.lifecycle.transition('shutdown')
    await this.graph.teardown()
  }

  getState(): AudioHealth {
    const s = this.lifecycle.state
    switch (s) {
      case 'Cold':
      case 'Booting': return { phase: 'booting' }
      case 'Ready': return { phase: 'ready', enabled: this._enabled, activeProfile: this.activeProfile }
      case 'Suspended': return { phase: 'suspended', reason: this.lifecycle.suspendReason ?? 'manual' }
      case 'Recovering': return { phase: 'recovering', attempt: this.lifecycle.recoverAttempt as 1|2|3 }
      case 'Failed': return { phase: 'failed', reason: this.lifecycle.failureReason ?? 'unknown', canRetry: true }
      case 'Shutdown': return { phase: 'failed', reason: 'shutdown', canRetry: false }
    }
  }
}
```

- [ ] **Step 4: 跑测试**

- [ ] **Step 5: Commit**

```bash
git add src/main/audio/index.ts src/main/audio/AudioCoreService.integration.test.ts
git commit -m "feat(audio): AudioCoreService 编排层 + 5 条集成测试"
```

### Task 2.7：挂到 main index.ts（不替换现有音频路径）

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: 挂起 AudioCoreService 仅打印 state**

在 `src/main/index.ts` 的 `app.on('ready', ...)` 里，**仅** 构造 AudioCoreService 并 start，用 MockBackend 跑完生命周期但不接真实 key 事件：

```typescript
import { AudioCoreService } from './audio'
import { MockBackend } from './audio/bindings/mock'
// ... 现有 imports

// 在 app.on('ready', ...) 尾部加
const audioCore = new AudioCoreService({ backend: new MockBackend() })
audioCore.on('health-change', (h) => console.log('[AudioCore]', h))
audioCore.start().then(() => console.log('[AudioCore] started, state:', audioCore.getState()))
powerMonitor.on('suspend', () => audioCore.pause('sleep'))
powerMonitor.on('resume', () => audioCore.resume())

// stop on quit
app.on('before-quit', () => {
  // ... 现有代码
  audioCore.stop()
})
```

> **关键**：这里用 MockBackend 而不是 miniaudio。这让我们先验证 Lifecycle / wiring 正确，再接真实 binding。真实 backend 挂在 PR-3。

- [ ] **Step 2: 跑 dev 看日志**

```bash
npm run dev
```
Expected: 控制台有 `[AudioCore] { phase: 'booting' }` → `{ phase: 'ready' }`；睡眠/唤醒时有 suspend → recovering → ready。

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(audio): AudioCoreService 挂到 app lifecycle（Mock backend，仅日志）"
```

---

## PR-3｜双轨并行

**目的**：实现真实 `MiniaudioBackend`，加 feature flag `AUDIO_BACKEND=main|renderer`（默认 `renderer`），让两条路径都能跑。

### Task 3.1：写 MiniaudioBackend（真实实现）

**Files:**
- Create: `src/main/audio/bindings/miniaudio.ts`
- Create: `src/main/audio/bindings/miniaudio.test.ts`（mark as `skip` 如果 CI 不能跑 native）

- [ ] **Step 1: 按 spec §9 + PR-0 spike 结论，写 MiniaudioBackend**

`src/main/audio/bindings/miniaudio.ts`:

```typescript
import type { AudioBackend, BackendPlayParams, DecodedAudio } from './types.ts'
// @ts-ignore
import miniaudio from 'miniaudio-napi'

export class MiniaudioBackend implements AudioBackend {
  private engine: any = null
  private decodedMap = new Map<string, any>()
  private masterGainValue = 1.0

  async open(sampleRate: number): Promise<void> {
    if (this.engine) return
    this.engine = new miniaudio.Engine({ sampleRate })
    await this.engine.init()
  }

  isOpen(): boolean { return !!this.engine }

  async decode(bytes: Uint8Array): Promise<DecodedAudio> {
    if (!this.engine) throw new Error('MiniaudioBackend: decode before open')
    const decoded = await this.engine.decode(bytes)
    const id = `ma-${this.decodedMap.size}`
    this.decodedMap.set(id, decoded)
    return {
      id,
      duration: decoded.frameCount / decoded.sampleRate,
      sampleRate: decoded.sampleRate,
      numberOfChannels: decoded.channels
    }
  }

  play(audio: DecodedAudio, params: BackendPlayParams): void {
    if (!this.engine) return
    const decoded = this.decodedMap.get(audio.id)
    if (!decoded) return
    this.engine.play(decoded, {
      volume: params.volume * this.masterGainValue,
      pitch: params.pitch,
      pan: params.pan,
      durationSec: params.durationSec
    })
  }

  setMasterGain(v: number): void { this.masterGainValue = v }

  async close(): Promise<void> {
    if (this.engine) {
      await this.engine.close()
      this.engine = null
    }
    // 保留 decodedMap？取决于 library —— 如果 close 释放 native memory，必须清空
    // Spike 里会验证，这里先清空保守
    this.decodedMap.clear()
  }

  outputLatencyMs(): number {
    return this.engine?.outputLatencyMs ?? 0
  }
}
```

> **注意**：实际 `miniaudio-napi` 的 API 命名可能不是 `Engine` / `init` / `decode`。PR-0 spike 的 `NOTES.md` 里记录的真实 API 是权威。这里按最可能的命名写，实现时对照调整。

- [ ] **Step 2: 对 main/index.ts 加 flag**

```typescript
const backendKind = process.env.AUDIO_BACKEND ?? 'renderer'
let backend: AudioBackend
if (backendKind === 'main') {
  const { MiniaudioBackend } = require('./audio/bindings/miniaudio')
  backend = new MiniaudioBackend()
} else {
  const { MockBackend } = require('./audio/bindings/mock')
  backend = new MockBackend()
}
const audioCore = new AudioCoreService({ backend, soundsBaseDir: path.join(ROOT, 'assets', 'sounds') })
```

- [ ] **Step 3: 测试**

```bash
AUDIO_BACKEND=main npm run dev
```
Expected: `[AudioCore]` 日志显示 ready，且控制台无 native 异常。

- [ ] **Step 4: Commit**

```bash
git add src/main/audio/bindings/miniaudio.ts src/main/index.ts
git commit -m "feat(audio): MiniaudioBackend 实现 + AUDIO_BACKEND 环境变量"
```

### Task 3.2：让 main 侧 onKey 工作（不干扰 renderer 路径）

**Files:**
- Modify: `src/main/keyboard.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 在 keyboard.ts 加 onKey callback**

修改 `src/main/keyboard.ts`，增加一个导出：

```typescript
type KeyEventCallback = (keycode: number, type: 'down' | 'up' | 'repeat', tsMs: number) => void

let audioCallback: KeyEventCallback | null = null
export function setAudioKeyCallback(cb: KeyEventCallback | null) {
  audioCallback = cb
}

// 在 uIOhook.on('keydown', ...) 里最后加：
//   audioCallback?.(kc, activeKeys.has(kc) ? 'repeat' : 'down', performance.now())
// 在 uIOhook.on('keyup', ...) 里最后加：
//   audioCallback?.(kc, 'up', performance.now())
```

修改点示意：

```typescript
uIOhook.on('keydown', (event: any) => {
  const kc = event.keycode
  const now = performance.now()
  if (activeKeys.has(kc)) {
    if (holdRepeatMode === 'off') return
    if (holdRepeatMode === 'edit' && !REPEAT_KEYS.has(kc)) return
    keyPort?.postMessage([kc, 2])
    audioCallback?.(kc, 'repeat', now)
    return
  }
  activeKeys.add(kc)
  keyPort?.postMessage([kc, 1])
  audioCallback?.(kc, 'down', now)
  pulseTrayOnce()
})

uIOhook.on('keyup', (event: any) => {
  activeKeys.delete(event.keycode)
  keyPort?.postMessage([event.keycode, 0])
  audioCallback?.(event.keycode, 'up', performance.now())
})
```

> **关键**：不改动现有 `keyPort` 逻辑——renderer 仍收得到键事件，两条路径并行。

- [ ] **Step 2: 在 main/index.ts 连线**

```typescript
if (backendKind === 'main') {
  setAudioKeyCallback((kc, type, tsMs) => audioCore.onKey(kc, type, tsMs))
} else {
  setAudioKeyCallback(null)
}
```

- [ ] **Step 3: 测试**

```bash
AUDIO_BACKEND=main npm run dev
```
按键：应能听到**来自 main 的声音**（如果 MiniaudioBackend 真的能播）。可能会**同时**听到 renderer 的声音（因为 keyPort 还在）——这是预期的双轨状态。下一步我们加一个 flag 抑制 renderer 路径。

- [ ] **Step 4: 加 disable renderer path 开关**

在 `src/renderer/hooks/useAudioEngine.ts` 里：

```typescript
const BACKEND = (import.meta as any).env?.VITE_AUDIO_BACKEND ?? 'renderer'

// 在 useEffect 里 onKeyEvent 回调顶部加：
if (BACKEND === 'main') return // main 自己播；renderer 不做
```

在 `vite.config.ts` / `.env` 里：

```
VITE_AUDIO_BACKEND=renderer
```

启动时：

```bash
AUDIO_BACKEND=main VITE_AUDIO_BACKEND=main npm run dev
```

- [ ] **Step 5: Commit**

```bash
git add src/main/keyboard.ts src/main/index.ts src/renderer/hooks/useAudioEngine.ts
git commit -m "feat(audio): 双轨 key 事件（flag AUDIO_BACKEND=main 走 main 路径，否则 renderer）"
```

### Task 3.3：IPC 把 main 的 AudioCoreService 命令暴露出来

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/preload.ts`

- [ ] **Step 1: 新增 IPC handlers**

```typescript
// ipc-handlers.ts
import type { AudioCoreService } from './audio'

export function registerAudioIpc(audioCore: AudioCoreService) {
  ipcMain.handle('audio:setMode', (_e, id: string) => audioCore.setMode(id))
  ipcMain.handle('audio:setProfile', (_e, id: string) => audioCore.setProfile(id))
  ipcMain.handle('audio:setVolume', (_e, v: number) => audioCore.setVolume(v))
  ipcMain.handle('audio:setEnabled', (_e, v: boolean) => audioCore.setEnabled(v))
  ipcMain.handle('audio:applySwitchDsp', (_e, dsp) => audioCore.applySwitchDsp(dsp))
  ipcMain.handle('audio:manualRetry', () => audioCore.manualRetry())
  ipcMain.handle('audio:getState', () => audioCore.getState())
}
```

- [ ] **Step 2: 广播 state 到 renderer**

```typescript
audioCore.on('health-change', (h) => {
  mainWindow?.webContents.send('audio:state', h)
})
```

- [ ] **Step 3: preload 暴露**

```typescript
// preload.ts
// 新增：
let audioStateCb: ((h: any) => void) | null = null
ipcRenderer.on('audio:state', (_e, h) => { audioStateCb?.(h) })

contextBridge.exposeInMainWorld('api', {
  // ... 现有 api
  onAudioState: (cb) => { audioStateCb = cb },
  audioSetMode: (id: string) => ipcRenderer.invoke('audio:setMode', id),
  audioSetProfile: (id: string) => ipcRenderer.invoke('audio:setProfile', id),
  audioSetVolume: (v: number) => ipcRenderer.invoke('audio:setVolume', v),
  audioSetEnabled: (v: boolean) => ipcRenderer.invoke('audio:setEnabled', v),
  audioApplySwitchDsp: (dsp: any) => ipcRenderer.invoke('audio:applySwitchDsp', dsp),
  audioManualRetry: () => ipcRenderer.invoke('audio:manualRetry'),
  audioGetState: () => ipcRenderer.invoke('audio:getState')
})
```

- [ ] **Step 4: 写 `useAudioState` hook**

`src/renderer/hooks/useAudioState.ts`:

```typescript
import { useEffect, useState } from 'react'

export interface AudioHealthView {
  phase: 'booting' | 'ready' | 'suspended' | 'recovering' | 'failed'
  enabled?: boolean
  activeProfile?: string
  reason?: string
  canRetry?: boolean
  attempt?: number
}

export function useAudioState() {
  const [health, setHealth] = useState<AudioHealthView>({ phase: 'booting' })
  useEffect(() => {
    (window as any).api?.onAudioState((h: AudioHealthView) => setHealth(h))
    ;(window as any).api?.audioGetState().then(setHealth)
  }, [])
  return health
}
```

- [ ] **Step 5: 测试：在 App.tsx 里 debug 打印**

```typescript
const audio = useAudioState()
console.log('[App] audio health:', audio)
```

跑 `AUDIO_BACKEND=main VITE_AUDIO_BACKEND=main npm run dev`，按键时观察日志。

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/preload.ts src/renderer/hooks/useAudioState.ts src/renderer/App.tsx
git commit -m "feat(audio): IPC commands + audio:state 广播 + useAudioState hook"
```

### Task 3.4：跑双轨对比验证

**Files:**
- Create: `docs/superpowers/testing/audio-dualtrack-results.md`

- [ ] **Step 1: 手测 8 条清单 on main backend**

跑 `AUDIO_BACKEND=main VITE_AUDIO_BACKEND=main npm run dev`，走一遍 spec §7.4 的 a–h 8 条手测清单，记录结果。

- [ ] **Step 2: 手测 8 条清单 on renderer backend**

不带 env，`npm run dev`，同样跑 8 条清单。两套结果对比，renderer 侧至少 a/b/c/g/h 五条应该仍有问题（符合我们对老架构的诊断）；main 侧应该全绿。

- [ ] **Step 3: 写入 results 文档**

`docs/superpowers/testing/audio-dualtrack-results.md`:

```markdown
# PR-3 双轨验证结果 (日期)

## main backend (AUDIO_BACKEND=main)
| # | 场景 | 结果 |
|---|---|---|
| a | 冷启动 | ✓ / ✗ |
| b | sleep/wake | ✓ / ✗ |
...

## renderer backend
...
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/testing/
git commit -m "test(audio): PR-3 双轨手测结果记录"
```

---

## PR-4｜切默认 + Combo migration + 失败可观测

**目的**：默认 backend 改为 `main`；combo 状态机从 renderer 搬到 main；加托盘 Failed 状态 + HelpPanel Retry 按钮。

**观察期**：PR-4 合并后**使用两周**再走 PR-5。

### Task 4.1：Combo 迁移到 main

**Files:**
- Create: `src/main/audio/ComboMachine.ts`
- Create: `src/main/audio/ComboMachine.test.ts`
- Modify: `src/renderer/audio/arcade/combo.ts`（变成 re-export，保持兼容）

- [ ] **Step 1: 复制 combo.ts + combo.test.ts 到 main/audio/**

```bash
cp src/renderer/audio/arcade/combo.ts src/main/audio/ComboMachine.ts
cp src/renderer/audio/arcade/combo.test.ts src/main/audio/ComboMachine.test.ts
```

修改 import 路径。

- [ ] **Step 2: 在 ComboMachine 里加 EventEmitter 触发 stage/perfect/reset**

原 combo.ts 是函数式（`recordKeydown(state, ts)`）。我们把它包一层 class：

```typescript
import { EventEmitter } from 'node:events'
import { createComboState, recordKeydown, recordRepeat, checkPerfect, getStage, type ComboStage } from './ComboMachine.base.ts'
// （原 combo.ts 的内容移到 ComboMachine.base.ts）

export class ComboMachine extends EventEmitter {
  private state = createComboState()
  private lastStage: ComboStage = 'idle'

  onKeydown(tsMs: number): void {
    recordKeydown(this.state, tsMs)
    const stage = getStage(this.state.combo)
    if (stage !== this.lastStage) {
      this.emit('stage-change', stage, this.state.combo)
      this.lastStage = stage
    }
    if (checkPerfect(this.state, tsMs)) {
      this.emit('perfect')
    }
  }

  onRepeat(tsMs: number): void {
    recordRepeat(this.state, tsMs)
  }

  reset(): void {
    this.state = createComboState()
    if (this.lastStage !== 'idle') {
      this.emit('reset')
      this.lastStage = 'idle'
    }
  }

  get combo(): number { return this.state.combo }
}
```

- [ ] **Step 3: 跑 combo 单测**

```bash
npx tsx --test src/main/audio/ComboMachine.test.ts
```
Expected: 保留原 12 个 test 全 PASS。

- [ ] **Step 4: 接入 AudioCoreService**

`src/main/audio/index.ts` 加 ComboMachine 实例，在 `onKey` 里根据 mode.arcadeEnabled + type==='down' 调 `combo.onKeydown(tsMs)`，并通过 IPC 广播 stage/perfect 给 renderer：

```typescript
private combo = new ComboMachine()

constructor(opts) {
  // ...
  this.combo.on('stage-change', (stage, combo) => this.emit('combo-stage', { stage, combo }))
  this.combo.on('perfect', () => this.emit('combo-perfect'))
  this.combo.on('reset', () => this.emit('combo-reset'))
}

// onKey 尾部：
if (this.currentMode.arcadeEnabled && type === 'down') this.combo.onKeydown(tsMs)

// setMode 时：
setMode(m) {
  const prev = this.currentMode
  // ...
  if (prev.arcadeEnabled && (!m.arcadeEnabled || prev.id !== m.id)) this.combo.reset()
}
```

- [ ] **Step 5: IPC 广播**

`src/main/index.ts`:

```typescript
audioCore.on('combo-stage', (data) => mainWindow?.webContents.send('audio:combo-stage', data))
audioCore.on('combo-perfect', () => mainWindow?.webContents.send('audio:combo-perfect'))
audioCore.on('combo-reset', () => mainWindow?.webContents.send('audio:combo-reset'))
```

preload 暴露订阅 API（略，按之前 pattern）。

- [ ] **Step 6: Renderer 订阅，把 main 的 combo 事件转到 overlay**

修改 `src/renderer/audio/arcade/ArcadeOverlayLayer.ts`：原本依赖 `onKeydown(nowMs, playTime)` 自己推 combo。现在改成**订阅 main 事件**：

```typescript
// 伪代码
api.onAudioComboStage((data) => this.stageChange(data.stage, data.combo))
api.onAudioComboPerfect(() => this.perfect())
api.onAudioComboReset(() => this.reset())
```

`playSound` 里的 `this.overlayLayer.onKeydown()` 调用在 PR-5 删掉；现在保留双路径并行。

- [ ] **Step 7: 测试**

- [ ] **Step 8: Commit**

```bash
git add src/main/audio/ComboMachine*.ts src/main/audio/index.ts src/main/index.ts src/main/preload.ts src/renderer/audio/arcade/ArcadeOverlayLayer.ts
git commit -m "feat(audio): combo 状态机迁到 main，renderer overlay 订阅 IPC 事件"
```

### Task 4.2：DSP filter ramp（Mode / SwitchDsp 作用到声音）

**Files:**
- Modify: `src/main/audio/AudioGraph.ts`
- Modify: `src/main/audio/bindings/miniaudio.ts`
- Modify: `src/main/audio/index.ts`
- Create: `src/main/audio/AudioGraph.test.ts`（补充 DSP 测试）

**目的**：让 mode（Classic / Focus / Cozy / Rush）和 per-switch DSP 真的作用到声音上。PR-2 只 stub 了 `setMode` / `applySwitchDsp`，本任务补齐。

- [ ] **Step 1: 决定 DSP 实现策略**

基于 PR-0 spike 结论：
- (A) **binding 自带 DSP 链**（如 miniaudio 提供 node effect graph）→ AudioGraph 包装其 API
- (B) **binding 只有 playback**（最可能）→ 用软件 DSP：在 PCM 层用 biquad IIR 处理每个 voice 输出

写一行结论到 `spike/SPIKE-RESULT.md`。下面假设 (B)。

- [ ] **Step 2: 写 DSP ramp 测试**

`src/main/audio/AudioGraph.test.ts`（追加）:

```typescript
test('rampFilter 逐步过渡到目标值（linear ramp）', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  g.rampFilter('airLpfHz', 8000, 300)
  // MockBackend 不真跑 ramp，但 AudioGraph 记录了目标
  assert.equal(g.getFilterTarget('airLpfHz'), 8000)
})

test('setMasterGain(0) 完全静音但 filter 状态保留', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  g.rampFilter('airLpfHz', 10000, 0)
  g.setMasterGain(0)
  assert.equal(g.getFilterTarget('airLpfHz'), 10000)
})
```

- [ ] **Step 3: 扩展 AudioBackend 接口加 filter API**

`src/main/audio/bindings/types.ts`:

```typescript
export interface AudioBackend {
  // ... 现有
  setFilter(name: FilterName, value: number, rampMs?: number): void
  getFilter(name: FilterName): number
}

export type FilterName =
  | 'airLpfHz' | 'highShelfDb' | 'lowShelfDb' | 'wetMix'
  | 'bodyPeakHz' | 'bodyPeakQ' | 'bodyPeakDb'
  | 'springNotchDb' | 'transientDb'
```

- [ ] **Step 4: 在 MiniaudioBackend 里实现 DSP（软件 biquad）**

```typescript
// bindings/miniaudio.ts — 加 filter 状态 + per-voice 处理
// 如果 miniaudio 提供 onSample callback，我们在 callback 里跑 biquad
// 如果不提供，考虑换 binding 或 pre-process PCM before play
// 具体 API 对照 spike NOTES.md
```

> 详细实现依赖 spike 结论；伪代码：

```typescript
private filters: Record<FilterName, number> = {
  airLpfHz: 13000, highShelfDb: 0.5, lowShelfDb: 2.5, wetMix: 0.05,
  bodyPeakHz: 600, bodyPeakQ: 1.5, bodyPeakDb: 0,
  springNotchDb: 0, transientDb: 0
}
private filterTargets = { ...this.filters }
private filterRampStartMs: Record<FilterName, number> = {} as any
private filterRampDurMs: Record<FilterName, number> = {} as any

setFilter(name: FilterName, value: number, rampMs = 0): void {
  this.filterTargets[name] = value
  this.filterRampStartMs[name] = performance.now()
  this.filterRampDurMs[name] = rampMs
}

getFilter(name: FilterName): number {
  const now = performance.now()
  const start = this.filterRampStartMs[name] ?? now
  const dur = this.filterRampDurMs[name] ?? 0
  const elapsed = now - start
  if (dur === 0 || elapsed >= dur) {
    this.filters[name] = this.filterTargets[name]
    return this.filters[name]
  }
  const t = elapsed / dur
  const from = this.filters[name]
  return from + (this.filterTargets[name] - from) * t
}
```

- [ ] **Step 5: AudioGraph 封装 rampFilter**

```typescript
// AudioGraph.ts
export class AudioGraph {
  rampFilter(name: FilterName, target: number, rampMs: number): void {
    this.backend.setFilter(name, target, rampMs)
  }
  getFilterTarget(name: FilterName): number {
    return this.backend.getFilter(name)
  }
  // ...
}
```

MockBackend 也要实现 `setFilter` / `getFilter`（简化版，直接存 map）。

- [ ] **Step 6: AudioCoreService 的 setMode / applySwitchDsp 接上**

```typescript
setMode(m: string | Mode): void {
  this.currentMode = typeof m === 'string' ? getMode(m) : m
  this.analytics.setArcadeEnabled(this.currentMode.arcadeEnabled)
  const s = this.currentMode.style
  this.graph.rampFilter('airLpfHz', s.airLpfHz, 300)
  this.graph.rampFilter('highShelfDb', s.highShelfDb, 300)
  this.graph.rampFilter('lowShelfDb', s.lowShelfDb, 300)
  this.graph.rampFilter('wetMix', s.wetMix, 300)
  this.emit('health-change', this.getState())
}

applySwitchDsp(dsp: SwitchDsp): void {
  this.currentDsp = dsp
  this.graph.rampFilter('bodyPeakHz', dsp.bodyPeakHz, 250)
  this.graph.rampFilter('bodyPeakQ', dsp.bodyPeakQ, 250)
  this.graph.rampFilter('bodyPeakDb', dsp.bodyPeakDb, 250)
  this.graph.rampFilter('springNotchDb', dsp.springNotchDb, 250)
  this.graph.rampFilter('transientDb', dsp.transientDb, 250)
}
```

- [ ] **Step 7: 手测 4 个 mode 切换**

跑 `AUDIO_BACKEND=main npm run dev`，在 tray 菜单里切 Classic / Focus / Cozy / Rush，耳朵验证每个 mode 有不同的音色。

- [ ] **Step 8: Commit**

```bash
git add src/main/audio/AudioGraph.ts src/main/audio/AudioGraph.test.ts src/main/audio/bindings/ src/main/audio/index.ts
git commit -m "feat(audio): AudioGraph DSP filter ramp + Mode/SwitchDsp 生效"
```

### Task 4.3：切默认 backend = main

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/renderer/hooks/useAudioEngine.ts`

- [ ] **Step 1: 改默认**

```typescript
// main/index.ts
const backendKind = process.env.AUDIO_BACKEND ?? 'main'  // 默认改 main

// renderer hook
const BACKEND = (import.meta as any).env?.VITE_AUDIO_BACKEND ?? 'main'
```

更新 `.env` / vite config 里默认值。

- [ ] **Step 2: 跑 dev 确认默认走 main**

```bash
npm run dev
```
观察日志，应该是 `[AudioCore]` 全流程，renderer onKeyEvent callback 的 `if (BACKEND === 'main') return` 应该生效。

- [ ] **Step 3: 8 条手测清单全绿，否则退回**

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/renderer/hooks/useAudioEngine.ts .env
git commit -m "feat(audio): 默认 backend 切到 main（可通过 AUDIO_BACKEND=renderer 回退）"
```

### Task 4.4：托盘暗红 Failed 状态

**Files:**
- Modify: `src/main/tray.ts`
- Create: `assets/icons/tray-failed.png` (16×16, 暗红主题)

- [ ] **Step 1: 在 tray 加 setAudioHealth 方法**

```typescript
// tray.ts
import type { AudioHealth } from './audio'

let currentHealth: AudioHealth = { phase: 'booting' }

export function setAudioHealth(h: AudioHealth) {
  currentHealth = h
  if (!tray) return
  if (h.phase === 'failed') {
    tray.setImage(path.join(iconsDir, 'tray-failed.png'))
    tray.setToolTip('Audio unavailable — click to retry')
  } else if (h.phase === 'recovering' || h.phase === 'booting') {
    // 淡灰脉动（复用现有 pulse 机制）
    pulseTrayOnce() // 1x/s
  } else {
    // ready/suspended 恢复默认图标
    tray.setImage(defaultTrayImage())
  }
  rebuildTrayMenu() // menu 里展示 retry 入口
}
```

`rebuildTrayMenu` 在 Failed 状态加一行：

```typescript
{ label: 'Retry audio', click: () => audioCore.manualRetry() },
```

- [ ] **Step 2: 在 main/index.ts 订阅**

```typescript
audioCore.on('health-change', setAudioHealth)
```

- [ ] **Step 3: 手动制造 Failed 测试**

临时改 `AudioGraph.init()` 第一次调用 throw，跑 dev 观察托盘变暗红 + 菜单出现 Retry。

- [ ] **Step 4: Commit**

```bash
git add src/main/tray.ts assets/icons/tray-failed.png
git commit -m "feat(audio): 托盘 Failed 状态暗红图标 + Retry 菜单项"
```

### Task 4.5：HelpPanel Retry 按钮 + 诊断显示

**Files:**
- Modify: `src/renderer/components/HelpPanel.tsx`

- [ ] **Step 1: 加 health view**

```tsx
const health = useAudioState()

{health.phase === 'failed' && (
  <div className="audio-failed-section">
    <p>Audio unavailable: {health.reason}</p>
    <button onClick={() => api.audioManualRetry()}>Retry</button>
  </div>
)}
```

- [ ] **Step 2: CSS 对齐现有设计（暗红 accent 但低饱和，守心流）**

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/HelpPanel.tsx
git commit -m "feat(audio): HelpPanel 显示 Failed 状态 + Retry 按钮"
```

### Task 4.6：诊断 ring buffer + DEBUG_AUDIO 日志

**Files:**
- Modify: `src/main/audio/index.ts`
- Create: `src/main/audio/DiagnosticLog.ts`

- [ ] **Step 1: 实现 ring buffer**

```typescript
// DiagnosticLog.ts
export class DiagnosticLog {
  private buffer: { ts: number; msg: string }[] = []
  private max = 20
  push(msg: string) {
    this.buffer.push({ ts: Date.now(), msg })
    if (this.buffer.length > this.max) this.buffer.shift()
  }
  recent(): typeof this.buffer { return [...this.buffer] }
}
```

- [ ] **Step 2: 在 AudioCoreService 的状态转换时写入**

```typescript
private diag = new DiagnosticLog()

this.lifecycle.on('state-change', (from, to, meta) => {
  this.diag.push(`${from}→${to}${meta?.reason ? ` (${meta.reason})` : ''}`)
  if (process.env.DEBUG_AUDIO) this.writeDebugLog()
})

// 对外加 API
getDiagnostics() { return this.diag.recent() }
```

- [ ] **Step 3: IPC 暴露 diagnostics**

```typescript
ipcMain.handle('audio:getDiagnostics', () => audioCore.getDiagnostics())
```

preload 暴露 `audioGetDiagnostics`。HelpPanel 展开时 fetch 一次。

- [ ] **Step 4: DEBUG_AUDIO 日志**

```typescript
private writeDebugLog() {
  const logPath = path.join(app.getPath('logs'), 'audio.log')
  // append + 滚动 5MB
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/audio/DiagnosticLog.ts src/main/audio/index.ts src/main/ipc-handlers.ts src/main/preload.ts src/renderer/components/HelpPanel.tsx
git commit -m "feat(audio): 诊断 ring buffer + DEBUG_AUDIO 日志 + HelpPanel 展示"
```

### Task 4.7：2 周观察期 Gate

- [ ] **Step 1: Merge PR-4 后，打一个 internal build 自己用 2 周**

- [ ] **Step 2: 每遇到 bug 在 `docs/superpowers/testing/audio-observations.md` 记一条**

- [ ] **Step 3: 2 周结束且无 P0/P1 bug → 进 PR-5**

> **如果出现 P0/P1（例如仍然出现静音）**：
> 1. 设 `AUDIO_BACKEND=renderer` 回退
> 2. 开 issue 分析
> 3. **不进 PR-5**，直到根因解决

---

## PR-5｜清理 renderer 旧代码

**目的**：删掉 renderer 侧的 `AudioEngine.ts`、`useAudioEngine` 里的生命周期逻辑、MessagePort 键桥、feature flag。

**前置**：PR-4 观察期无 P0/P1 bug。

### Task 5.1：删 renderer AudioEngine.ts

**Files:**
- Delete: `src/renderer/audio/AudioEngine.ts`
- Delete: `src/renderer/audio/arcade/combo.ts`（已迁到 main，如有 re-export 也删）
- Modify: `src/renderer/audio/arcade/ArcadeOverlayLayer.ts`（删除对 `AudioEngine.playSound` 的 overlay hook 依赖；现在完全靠 IPC 事件驱动）
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: 删文件**

```bash
git rm src/renderer/audio/AudioEngine.ts
git rm src/renderer/audio/arcade/combo.ts
git rm src/renderer/audio/arcade/combo.test.ts  # 已迁到 main
```

- [ ] **Step 2: 修 ArcadeOverlayLayer，删对 combo.ts 的引用**

- [ ] **Step 3: 修 App.tsx 用 `useAudioState` 代替 `useAudioEngine`**

删除：

```tsx
const { outputInfo, soundEnabled, wpm, typingActive } = useAudioEngine(...)
```

改为：

```tsx
const audio = useAudioState()
const { wpm, typingActive } = useTypingFromMain() // 或直接从 audio.state 读取（如果我们也广播了）
```

> **注**：`wpm` / `typingActive` 现在由 main 算，如前面没广播需补上：在 AudioCoreService 加一个 `getTypingState()` + 250ms 定时 emit，renderer 侧的 hook 订阅。

- [ ] **Step 4: 跑 dev，确认功能完整**

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(audio): 删除 renderer 侧 AudioEngine + combo"
```

### Task 5.2：useAudioEngine 改名 useAudioState（或直接删）

**Files:**
- Delete: `src/renderer/hooks/useAudioEngine.ts`
- Confirm: `src/renderer/hooks/useAudioState.ts` 已经是唯一 UI hook

- [ ] **Step 1: 确认所有调用方已迁移**

```bash
# 搜 useAudioEngine 引用
```

- [ ] **Step 2: 删旧 hook**

```bash
git rm src/renderer/hooks/useAudioEngine.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(audio): 删除 useAudioEngine（被 useAudioState 取代）"
```

### Task 5.3：删 MessagePort 键桥

**Files:**
- Modify: `src/main/keyboard.ts`
- Modify: `src/main/preload.ts`

- [ ] **Step 1: 删 keyPort 相关代码**

`src/main/keyboard.ts`:
- 删 `keyPort` 变量与 `MessageChannelMain` 创建
- 删 `keyPort?.postMessage(...)` 所有调用（只保留 `audioCallback?.(...)`）
- 删 `startKeyboardListener` 里 `mainWindow.webContents.postMessage('key-port', ...)`

`src/main/preload.ts`:
- 删 `ipcRenderer.on('key-port', ...)` block
- 删 `onKeyEvent` from api

- [ ] **Step 2: 跑 dev 确认**

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(audio): 删除 MessagePort 键桥（键事件全部在 main 处理）"
```

### Task 5.4：删 feature flag + cleanup

**Files:**
- Modify: `src/main/index.ts`
- Modify: vite config / `.env`

- [ ] **Step 1: 删 AUDIO_BACKEND 分支**

```typescript
// 永远用 MiniaudioBackend
const backend = new MiniaudioBackend()
```

- [ ] **Step 2: 删 VITE_AUDIO_BACKEND**

- [ ] **Step 3: 删 MockBackend（保留仅用于测试）**

确保 `src/main/audio/bindings/mock.ts` 只被 `*.test.ts` import。

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(audio): 移除 AUDIO_BACKEND feature flag"
```

### Task 5.5：最终回归 + memory 清理

- [ ] **Step 1: 跑 8 条手测清单最终版**

记录到 `docs/superpowers/testing/audio-final-regression.md`。

- [ ] **Step 2: 清理 memory**

修改 `~/.claude/projects/-Users-pochita--Projects-pekko/memory/project_pekko_audio_debug_pending.md` 为 resolved，或直接删除（已被此重构替代）。

- [ ] **Step 3: 更新 CLAUDE.md（如果项目有的话）**

在 `/Users/pochita-/Projects/pekko/.claude/CLAUDE.md`（如无则创建）加一段：

```markdown
## 音频子系统

- 音频引擎在 main 进程（`src/main/audio/`），native binding 是 miniaudio-napi
- Renderer 只负责 UI + arcade 视觉合成；不要把音频逻辑搬回 renderer
- 新增功能先看 `docs/superpowers/specs/2026-04-20-audio-engine-redesign-design.md` 的架构约束
```

- [ ] **Step 4: 最终 commit + tag**

```bash
git add docs/superpowers/testing/audio-final-regression.md .claude/CLAUDE.md
git commit -m "docs(audio): PR-5 完成 — 声音引擎重构收官"
git tag audio-redesign-complete
```

---

## 完工检查清单（整个 6 PR 系列结束后）

- [ ] Spec §1.1 列的 8 类失败模式全部经手测验证不再出现
- [ ] `src/main/audio/` 目录每个文件 ≤ 200 行
- [ ] 单测覆盖：`TypingAnalytics` + `KeySampler` + `Lifecycle` + `SoundPackStore` + `ComboMachine`（合计 ≥ 40 test cases）
- [ ] 集成测试：`AudioCoreService` ≥ 5 用例，含 "100 次 suspend/resume"
- [ ] 托盘 Failed 状态可测试重现（临时 `throw` in init）
- [ ] `docs/superpowers/release-checklist.md` 里增加 "音频 8 条手测清单"
- [ ] 旧 renderer AudioEngine 完全删除
- [ ] PR-0 spike 目录已删除（只保留 SPIKE-RESULT.md）

---

## Spec Coverage 自查

| Spec 小节 | 覆盖任务 |
|---|---|
| §1 问题与目标 | PR-0 到 PR-5 整体目标 |
| §2 关键决策 | PR-0 gate 决定方案；PR-3/4 双轨与切默认体现 |
| §3 架构 | PR-2（main 骨架） + PR-4（combo 迁移） |
| §4 模块拆分 | Tasks 1.1–1.2（shared 纯模块）+ 2.2–2.6（main 侧）+ 4.1（combo） |
| §5 关键数据流 5.1 按键→出声 | Task 2.6 + Task 3.2 |
| §5 数据流 5.2 Mode/Profile/DSP | Task 2.6（setMode/applySwitchDsp stub）+ Task 3.3（IPC）+ Task 4.2（DSP 真正生效） |
| §5 5.3 Cold boot | Task 2.7 + 3.1 |
| §5 5.4 电源自愈 close→open | Task 2.6（pause/resume 带 teardown + init）+ Task 2.7（powerMonitor 接线） |
| §5 5.5 Mute toggle | Task 2.6 setEnabled |
| §5 5.6 优雅退出 | Task 2.7 before-quit |
| §6 状态机 + 可观测 | Task 2.3 + Task 4.4 + Task 4.5 + Task 4.6 |
| §7 测试策略 | 每个 Task 都含 TDD 步骤；Task 3.4 + 4.7 + 5.5 手测环节 |
| §8 迁移计划 | 本计划的 PR-0 到 PR-5 直接对应 |
| §9 Spike 验证标准 | PR-0 Tasks 0.1–0.7 |
| §10 Open Questions | PR-0 0.1 API 契合度 / 0.3 延迟 / 0.6 notarization 对应解决 |
| §11 附录 对应关系 | Task 5.1/5.2/5.3 按该附录逐项清理 |
