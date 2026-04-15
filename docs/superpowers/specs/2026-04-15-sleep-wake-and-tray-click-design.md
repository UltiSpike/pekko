# Pekko · Sleep / Wake Recovery + Tray Click 设计

**Date:** 2026-04-15
**Status:** design approved — ready for plan
**Scope:** bug fix (睡眠唤醒后键盘声失效) + 独立 UX 调整 (tray 左键行为)
**Branch:** `fix/sleep-wake-audio` (from `design/chassis-v2` tip `ad0e3ee`)

## 1. Motivation

### 1.1 Sleep / Wake Bug

实测复现：**Mac 熄屏一段时间后，键盘声完全失效，必须重启 app 才能恢复**。`⇧⌘K` 静音切换无效，说明键盘事件管线本身已死，而非 `AudioEngine._enabled` 开关状态。

#### 根因分析

| 候选根因 | 与 "硬断" 表现的吻合度 | 说明 |
|---|---|---|
| **uIOhook 的 `CGEventTap` 被 macOS 在 sleep/wake 时摘掉** | 高 | `kCGEventTapDisabledByTimeout` 是典型表现；tap 死了，事件流断。只有重启 app（重注册 tap）才能恢复——完全匹配观察。 |
| **AudioContext 进入 `interrupted` / `closed` 且 `resume()` 不起效** | 中 | 会呈现硬断，但相对少见 |
| **Chromium 后台节流 + keepAlive stop** | 低（单独） | 只会导致软性掉帧，不会硬断；但会叠加放大症状 |

(`src/main/index.ts:52-56` 的 `webPreferences` 未设 `backgroundThrottling`，默认 `true`；blur 时 `mainWindow.hide()` 让 renderer 进入后台节流；`AudioEngine.keepAlive()` 用 `setTimeout(tick, 15000)` 喂空 buffer 保活，被 clamp 后停摆。)

#### 现状缺口

- `src/main/index.ts` 未监听 `powerMonitor` 任何事件
- `src/main/keyboard.ts` 的 `stopKeyboardListener()` 会关闭 MessagePort；不能直接复用做 sleep/wake 生命周期管理
- `src/renderer/audio/AudioEngine.ts` 的 `resume()` (line 572) 只调用 `ctx.resume()`，没有 state 判断、超时降级、也没有重建路径

### 1.2 Tray 左键行为

当前 (`src/main/tray.ts:159-166`) 左键 tray 图标会 toggle panel。此行为在 macOS menu-bar app 语境里是非标准——多数（Spotify menu-bar、Bartender、Rectangle 等）左键 = 弹 context menu。对 Pekko 这种"守心流"型应用尤其重要：panel 是中心元素，不应被一次无心的 tray 点击拉起，破坏用户当前聚焦的心流。

## 2. Non-Goals

- 不改 panel 内部 UI / audio DSP / profile 系统
- 不改 `stopKeyboardListener()` 的 `before-quit` 路径
- 不重写 AudioEngine 的音频图构建；`destroy()` + `init()` 能完整重建即可
- 不尝试在 main 进程探测 AudioContext 状态；main 只做 powerMonitor 广播，audio 自愈留在渲染器
- 不处理异常罕见的 CoreAudio 设备丢失（如耳机被拔）——本轮 out-of-scope

## 3. 架构

```
┌─── main process ─────────────────────────────────────┐
│  powerMonitor (新增中枢)                              │
│    'suspend' | 'lock-screen'          → pauseForSleep│
│    'resume' | 'unlock-screen'         → restore ×2   │
│    'user-did-become-active'           → restore ×2   │
│                                                       │
│  keyboard.ts (改造)                                  │
│    + pauseForSleep()  // uIOhook.stop(), port 保留   │
│    + resumeAfterWake() // uIOhook.start()            │
│                                                       │
│  tray.ts (改造)                                      │
│    - 删除 tray.on('click') 块                        │
│                                                       │
│  index.ts (改造)                                     │
│    + webPreferences.backgroundThrottling: false      │
│    + 装配 powerMonitor 监听                          │
└───────────────────────────────────────────────────────┘
                    │ IPC 'power-resume'
                    ▼
┌─── renderer ────────────────────────────────────────┐
│  preload.ts (改造)                                  │
│    + onPowerResume(cb)                              │
│                                                     │
│  AudioEngine.ts (新增)                              │
│    + wake(): state-machine 决策 (no-op/resume/rebuild)│
│                                                     │
│  useAudioEngine.ts (接线)                           │
│    + onPowerResume → audioEngine.wake()             │
└─────────────────────────────────────────────────────┘
```

**组件边界**：键盘管线死活在 main 自愈（重注册 event tap），音频管线死活在 renderer 自愈（状态机决策）。`powerMonitor` 只做广播不做业务。tray 改动与睡醒无关，但共享文件触及面，一并落盘。

## 4. 数据流

### 4.1 睡眠路径

```
[macOS] suspend | lock-screen
  │
  ▼
[main] powerMonitor 回调
  │
  ├─ keyboard.pauseForSleep()      # uIOhook.stop(), MessagePort 保留
  └─ (不主动挂 AudioContext，交给唤醒路径判定)
```

### 4.2 唤醒路径

```
[macOS] resume | unlock-screen | user-did-become-active
  │
  ▼
[main] powerMonitor 回调
  │
  ├─ keyboard.resumeAfterWake()    # uIOhook.start() 重注册 CGEventTap
  └─ mainWindow.webContents.send('power-resume')
       │
       ▼
   [preload] ipcRenderer.on('power-resume') → onPowerResume 回调
       │
       ▼
   [useAudioEngine] audioEngine.wake()
       │
       ▼
   [AudioEngine] state-machine 决策
```

## 5. Components & 改动清单

| # | 文件 | 改动 |
|---|---|---|
| 1 | `src/main/index.ts` | `webPreferences.backgroundThrottling: false`；import `powerMonitor`；在 `app.on('ready')` 之后装配 5 个事件监听（`suspend`/`resume`/`lock-screen`/`unlock-screen`/`user-did-become-active`） |
| 2 | `src/main/keyboard.ts` | 新增导出 `pauseForSleep()` / `resumeAfterWake()`；两者不碰 MessagePort |
| 3 | `src/main/tray.ts` | **删除** `tray.on('click', …)` 监听器（line 159-166） |
| 4 | `src/main/preload.ts` | 新增 `ipcRenderer.on('power-resume', …)` + `onPowerResume(cb)` API |
| 5 | `src/renderer/audio/AudioEngine.ts` | 新增 `wake(): Promise<void>`；按 state 做 no-op / resume / 重建 |
| 6 | `src/renderer/hooks/useAudioEngine.ts` | 在 key-events useEffect 里 `window.api.onPowerResume(() => audioEngine.wake())` |

## 6. 关键实现细节

### 6.1 keyboard.ts 新增 API

```ts
// sleep/wake 专用轻量停止 — 不关 MessagePort，
// 因为 renderer 侧的 port reference 无法重新投递。
export function pauseForSleep(): void {
  if (!isListening) return
  try { uIOhook.stop() } catch {}
  isListening = false
  activeKeys.clear()   // 避免唤醒后 keyup 丢失造成幽灵按键
}

export function resumeAfterWake(): void {
  if (isListening) return
  try {
    uIOhook.start()
    isListening = true
    console.log('[Pekko] Keyboard re-registered after wake')
  } catch (err) {
    console.error('[Pekko] Keyboard restart failed:', err)
    // 1s 后再试一次（单次），对抗罕见的启动竞态
    setTimeout(() => {
      if (isListening) return
      try { uIOhook.start(); isListening = true } catch {}
    }, 1000)
  }
}
```

保留的 `stopKeyboardListener()`（关 port）仅供 `before-quit` 用，语义不变。

### 6.2 index.ts 装配 powerMonitor

```ts
import { powerMonitor } from 'electron'

// 在 app.on('ready') 内、registerIpcHandlers 之后装配：
const onSleep = () => {
  console.log('[Pekko] Power: sleep-like event')
  pauseForSleep()
}
const onWake = (label: string) => () => {
  console.log(`[Pekko] Power: ${label}`)
  resumeAfterWake()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('power-resume')
  }
}

powerMonitor.on('suspend',                 onSleep)
powerMonitor.on('lock-screen',             onSleep)
powerMonitor.on('resume',                  onWake('resume'))
powerMonitor.on('unlock-screen',           onWake('unlock-screen'))
powerMonitor.on('user-did-become-active',  onWake('user-did-become-active'))
```

`user-did-become-active` 触发较频繁，但 `wake()` 的 `'running'` 分支是 no-op，实际开销接近零。

### 6.3 AudioEngine.wake() 状态机

```ts
async wake(): Promise<void> {
  if (!this.ctx || !this.activeProfile) return   // 初始化前的唤醒 — 原有 boot 流程会接管

  const state = this.ctx.state
  console.log(`[Audio] wake: state=${state}`)

  if (state === 'running') return                // 热路径 — 零成本

  if (state === 'suspended') {
    try { await this.ctx.resume() } catch {}
    await new Promise(r => setTimeout(r, 500))
    if (this.ctx?.state === 'running') return
    // fallthrough → 硬重建
  }

  // state === 'closed' | resume 无效 → 硬重建
  const savedProfile = this.activeProfile
  const savedMode = this.currentMode
  const savedDsp = this.currentDsp
  this.destroy()
  await this.init()
  await this.loadProfile(savedProfile)
  this.setMode(savedMode)
  this.applySwitchDsp(savedDsp)
  console.log('[Audio] wake: hard rebuild ok')
}
```

`destroy()` 已清理 pool、pack、ctx；`init()` 重建音频图；`loadProfile(savedProfile)` 的 `packs.has(id)` 检查会失败（已清空），重新从磁盘加载。`currentMode` / `currentDsp` 是成员字段，`destroy()` 不清，保存 snapshot 后传给重建路径即可。

### 6.4 preload.ts 新增通道

```ts
let powerResumeCallback: (() => void) | null = null
ipcRenderer.on('power-resume', () => { powerResumeCallback?.() })

// contextBridge 里新增：
onPowerResume: (cb: () => void) => { powerResumeCallback = cb }
```

### 6.5 useAudioEngine.ts 接线

在已有的 key-events useEffect 里追加一行：

```ts
window.api.onPowerResume(() => { audioEngine.wake() })
```

### 6.6 tray.ts 删改

删除 `tray.ts:159-166`：

```ts
// 删掉整块：
tray.on('click', () => {
  if (win?.isVisible()) {
    win.hide()
  } else if (canShow()) {
    win?.show()
    win?.focus()
  }
})
```

`tray.setContextMenu(menu)` 在 macOS 上左键默认弹 menu——删掉覆盖后即恢复标准行为。panel 打开入口仍有：`⌥⌘K` 全局快捷键（`index.ts:157-165`）、menu 里的 `Show Window` (`tray.ts:116-123`)、以及 app 启动后的首次自动 show（`firstMeasureApplied` gate）。

### 6.7 backgroundThrottling 硬化

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  backgroundThrottling: false,   // ← 新增
  preload: path.join(__dirname, 'preload.js')
}
```

附带收益：即便没有 powerMonitor 广播到达，隐藏窗口的 renderer 里 `keepAlive()` 的 `setTimeout(tick, 15000)` 也不再被 clamp，AudioContext 不易自行挂起。对 tray-only app 是推荐配置。

## 7. 错误处理 & 边界

| 情况 | 处理 |
|---|---|
| 唤醒时 `mainWindow` 已销毁 | IPC 发送守卫（已写）；只重启键盘 |
| `uIOhook.start()` 抛错 | log；1s 后再试一次；仍失败则需用户手动重启 app（日志提示） |
| `activeProfile === ''`（启动期撞上唤醒） | `wake()` 顶部守卫直接 return；boot 流程完成后 useEffect 会正常加载 |
| `loadProfile` 失败（磁盘读错） | log；下次用户切 profile / 改设置时 useEffect 重试（现有语义） |
| 连续 `suspend` 事件 | `pauseForSleep` / `resumeAfterWake` 都有 `isListening` 幂等守卫 |
| 快速锁屏-解屏 | `pauseForSleep` + `resumeAfterWake` 成对触发；uIOhook 文档支持快速 stop/start |
| powerMonitor 事件在 renderer 初始化前到达 | `wake()` 守卫 `!this.ctx` 直接 return |

## 8. 测试

### 8.1 手动场景

| 场景 | 触发 | 期望日志 | 期望行为 |
|---|---|---|---|
| 锁屏-解屏 | `⌃⌘Q` → 立即解锁 | `Power: lock-screen` / `Power: unlock-screen` / `wake: running` | 键声正常（soft path） |
| 短时 display sleep | `sudo pmset displaysleepnow` + 按键唤醒 | `Power: user-did-become-active` / `wake: running` 或 `suspended → running` | 键声正常 |
| 完整系统睡眠 | `pmset sleepnow` + 唤醒 | `Power: suspend` / `Power: resume` / `wake: hard rebuild ok` | 键声正常 |
| 合盖 15 分钟 | 合盖 + 开盖 | 同上 | 键声正常（**主要复现场景，验证修复**）|
| 连续锁-解屏 5 次 | 快速 `⌃⌘Q` 5 次 | 5 对 lock/unlock 日志 | 无幽灵按键，键声正常 |
| 系统音频被抢占 | 锁屏期间他人远程连接、蓝牙切设备 | 可能命中 rebuild 分支 | 唤醒后正常 |

### 8.2 Tray 行为回归

| 场景 | 期望 |
|---|---|
| 左键 tray 图标 | **弹 context menu**（不再 toggle panel）|
| 右键 tray 图标 | 弹 context menu（未变）|
| `⌥⌘K` | toggle panel（未变）|
| menu → `Show Window` | 打开 panel 并聚焦（未变）|
| app 启动 | panel 在 firstMeasure 后自动首次显示（未变）|

### 8.3 日志检查点

启用 `DEVTOOLS=1 npm run dev` 观察：
- `[Audio] wake: state=…` 每次唤醒都出现
- `[Audio] wake: hard rebuild ok` 仅在硬路径出现，频率应很低
- `[Pekko] Keyboard re-registered after wake` 每次唤醒都应出现
- 无 `Keyboard restart failed` 持续打印

## 9. Rollout

- 一个 feature commit（或按文件切 3-4 个 commit，由实施计划决定）
- spec + plan 先行提交到 `fix/sleep-wake-audio`
- 不 touch 主仓库（仍在 `design/chassis-v2`）
- PR 描述需说明"糅合了 tray UX 调整"，避免 reviewer 困惑

## 10. 风险

| 风险 | 缓解 |
|---|---|
| `powerMonitor` 事件在 macOS 某些版本不发 | `user-did-become-active` + 多事件叠加 defensive coverage |
| `uIOhook.start()` 在快速 stop→start 时竞态 | 1s 延迟重试；日志告警 |
| AudioContext 重建耗时造成首击延迟 | 重建 ~200-500ms；用户唤醒后通常先看屏幕再按键，基本不可感知 |
| `backgroundThrottling: false` 改变渲染器调度 | 对 tray app 是推荐配置，Electron 文档明确背书 |
| tray 行为变化导致用户迷惑 | 变化方向符合 macOS 常规；menu 里仍有 `Show Window` 且快捷键未变 |
