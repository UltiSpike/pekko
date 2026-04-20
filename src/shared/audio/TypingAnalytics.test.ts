import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TypingAnalytics } from './TypingAnalytics.ts'

test('空白状态 snapshot 返回默认值', () => {
  const a = new TypingAnalytics()
  const s = a.snapshot(() => 0)
  assert.equal(s.intensity, 0.7)
  assert.equal(s.adaptiveMul, 1.0)
  assert.equal(s.wpm, 0)
  assert.equal(s.typingActive, false)
})

test('fresh start (无历史) 设 intensity=0.80', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  assert.equal(a.snapshot(() => 1000).intensity, 0.80)
})

test('fresh start (interval > 2000ms) 设 intensity=0.80', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  a.recordKey(4000, 30, 'down')
  assert.equal(a.snapshot(() => 4000).intensity, 0.80)
})

test('快速打字 (interval < 80ms) 每次递减 0.08', () => {
  // 从 fresh-start 0.80 开始，一次 50ms 间隔 → 0.72
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  a.recordKey(1050, 31, 'down')
  const s = a.snapshot(() => 1050)
  assert.ok(s.intensity > 0.71 && s.intensity < 0.73, `intensity=${s.intensity}`)
})

test('快速打字连击多次，intensity 到 floor 0.35', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  for (let i = 1; i < 20; i++) a.recordKey(1000 + i * 50, 30, 'down')
  assert.equal(a.snapshot(() => 2000).intensity, 0.35)
})

test('慢速敲击 (interval ~ 300ms) 抬高 intensity', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  a.recordKey(1300, 31, 'down')
  const s = a.snapshot(() => 1300)
  assert.ok(s.intensity > 0.75, `intensity ${s.intensity} should be > 0.75`)
})

test('arcade 模式下 adaptiveMul 锁定 1.0（无疲劳衰减）', () => {
  const a = new TypingAnalytics({ arcadeEnabled: true })
  for (let i = 0; i < 1000; i++) a.recordKey(1000 + i * 50, 30, 'down')
  assert.equal(a.snapshot(() => 51000).adaptiveMul, 1.0)
})

test('持续打字 > 30s adaptiveMul 稳定（floor 0.65，实际停在 ~0.75）', () => {
  // 原 AudioEngine 的 Math.max(0.65, adaptiveMul) 是 floor 而非 target，
  // 所以值会停在线性衰减最后一次计算出的位置（~0.75），而不是继续降到 0.65。
  // PR-1 是纯重构，必须保留此行为。
  const a = new TypingAnalytics()
  for (let i = 0; i < 1000; i++) a.recordKey(1000 + i * 50, 30, 'down') // 50s
  const s = a.snapshot(() => 51000)
  assert.ok(s.adaptiveMul >= 0.74 && s.adaptiveMul <= 0.76, `adaptiveMul=${s.adaptiveMul}`)
})

test('WPM 计算：5s 内 ~60 keys → wpm ≈ 144', () => {
  const a = new TypingAnalytics()
  for (let i = 0; i < 60; i++) a.recordKey(1000 + i * 83, 30, 'down')
  const s = a.snapshot(() => 1000 + 59 * 83)
  assert.ok(s.wpm >= 140 && s.wpm <= 150, `wpm was ${s.wpm}`)
})

test('idle > 2s 后 typingActive 变 false 且 wpm 清零', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'down')
  const s = a.snapshot(() => 5000)
  assert.equal(s.typingActive, false)
  assert.equal(s.wpm, 0)
})

test('setArcadeEnabled 切换后 adaptiveMul 立即重置为 1.0', () => {
  const a = new TypingAnalytics()
  for (let i = 0; i < 1000; i++) a.recordKey(1000 + i * 50, 30, 'down')
  assert.ok(a.snapshot(() => 51000).adaptiveMul < 1.0)
  a.setArcadeEnabled(true)
  a.recordKey(52000, 30, 'down')
  assert.equal(a.snapshot(() => 52000).adaptiveMul, 1.0)
})

test('up / repeat 事件不影响 intensity / adaptive / wpm', () => {
  const a = new TypingAnalytics()
  a.recordKey(1000, 30, 'up')
  a.recordKey(1100, 30, 'repeat')
  const s = a.snapshot(() => 1100)
  assert.equal(s.wpm, 0)
  assert.equal(s.intensity, 0.7) // 初值
})
