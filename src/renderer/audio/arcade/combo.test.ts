import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createComboState,
  recordKeydown,
  recordRepeat,
  checkPerfect,
  getStage,
  ComboStage,
} from './combo.ts'

test('初始 combo 为 0，stage 为 idle', () => {
  const s = createComboState()
  assert.equal(s.combo, 0)
  assert.equal(getStage(s.combo), 'idle')
})

test('connected keydown 每击 combo +1', () => {
  const s = createComboState()
  recordKeydown(s, 1000)
  recordKeydown(s, 1100)
  recordKeydown(s, 1200)
  assert.equal(s.combo, 3)
})

test('inter-key 间隔 > 600ms 触发 reset', () => {
  const s = createComboState()
  recordKeydown(s, 1000)
  recordKeydown(s, 1100)
  recordKeydown(s, 2000)
  assert.equal(s.combo, 1)
})

test('边界：间隔恰好 600ms 不 reset', () => {
  const s = createComboState()
  recordKeydown(s, 1000)
  recordKeydown(s, 1600)
  assert.equal(s.combo, 2)
})

test('stage 阈值正确', () => {
  assert.equal(getStage(0), 'idle')
  assert.equal(getStage(1), 'idle')
  assert.equal(getStage(2), 'engaged')
  assert.equal(getStage(9), 'engaged')
  assert.equal(getStage(10), 'stacking')
  assert.equal(getStage(24), 'stacking')
  assert.equal(getStage(25), 'flow')
  assert.equal(getStage(49), 'flow')
  assert.equal(getStage(50), 'zone')
  assert.equal(getStage(999), 'zone')
})

test('hold-repeat 事件对 combo 完全不可见', () => {
  const s = createComboState()
  recordKeydown(s, 1000)
  recordKeydown(s, 1100)
  recordRepeat(s, 1200)
  recordRepeat(s, 1300)
  recordRepeat(s, 1400)
  recordRepeat(s, 1500)
  recordRepeat(s, 1600)
  assert.equal(s.combo, 2)
  assert.equal(s.lastKeydownMs, 1100)
})

test('hold-repeat 期间不影响 inter-key 计时——下一个 keydown 间隔从上一个 keydown 算起', () => {
  const s = createComboState()
  recordKeydown(s, 1000)
  recordRepeat(s, 1500)
  recordRepeat(s, 2000)
  recordKeydown(s, 2200)
  // 距离 1000 = 1200ms > 600ms，reset
  assert.equal(s.combo, 1)
})

test('PERFECT 判定：最近 8 键间隔方差 / 均值 < 0.15 返回 true', () => {
  const s = createComboState()
  // 每 120ms 一击，共 9 击（8 个间隔）
  for (let i = 0; i < 9; i++) recordKeydown(s, 1000 + i * 120)
  assert.equal(s.combo, 9)
  const res = checkPerfect(s, 1000 + 8 * 120)
  assert.equal(res, true)
})

test('PERFECT 判定：节奏不稳（σ/μ > 0.15）返回 false', () => {
  const s = createComboState()
  const intervals = [50, 200, 50, 200, 50, 200, 50, 200]
  let t = 1000
  recordKeydown(s, t)
  for (const iv of intervals) {
    t += iv
    recordKeydown(s, t)
  }
  const res = checkPerfect(s, t)
  assert.equal(res, false)
})

test('PERFECT 不足 8 间隔（<9 keydowns）返回 false', () => {
  const s = createComboState()
  for (let i = 0; i < 7; i++) recordKeydown(s, 1000 + i * 120)
  const res = checkPerfect(s, 1000 + 6 * 120)
  assert.equal(res, false)
})

test('PERFECT 冷却：触发后 2 秒内再次调用返回 false', () => {
  const s = createComboState()
  for (let i = 0; i < 9; i++) recordKeydown(s, 1000 + i * 120)
  const first = checkPerfect(s, 1960)
  assert.equal(first, true)
  for (let i = 0; i < 9; i++) recordKeydown(s, 2960 + i * 120)
  const second = checkPerfect(s, 2960 + 8 * 120)
  assert.equal(second, false)
})

test('PERFECT 冷却：2 秒后可再次触发', () => {
  const s = createComboState()
  for (let i = 0; i < 9; i++) recordKeydown(s, 1000 + i * 120)
  checkPerfect(s, 1960)
  for (let i = 0; i < 9; i++) recordKeydown(s, 5000 + i * 120)
  const res = checkPerfect(s, 5000 + 8 * 120)
  assert.equal(res, true)
})
