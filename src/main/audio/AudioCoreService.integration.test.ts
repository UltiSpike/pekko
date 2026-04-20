import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioCoreService, type PackSource } from './index.ts'
import { MockBackend } from './bindings/mock.ts'

const spriteSource: PackSource = {
  kind: 'sprite',
  config: { defines: { '30': [0, 100], '30-up': [100, 100], '57': [200, 120] } },
  bytes: new Uint8Array(44100).fill(1),
}

async function newSvc() {
  const backend = new MockBackend()
  const svc = new AudioCoreService({ backend })
  return { backend, svc }
}

test('未 start 时 getState.phase === cold', async () => {
  const { svc } = await newSvc()
  assert.equal(svc.getState().phase, 'cold')
})

test('start() 后 phase === ready', async () => {
  const { svc } = await newSvc()
  await svc.start()
  assert.equal(svc.getState().phase, 'ready')
})

test('未 Ready 时 onKey 不触发 backend.play', async () => {
  const { backend, svc } = await newSvc()
  svc.onKey(30, 'down', 1000)
  assert.equal(backend.playHistory.length, 0)
})

test('Ready 且加载 profile 后 onKey 触发 play', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  const ok = await svc.setProfile('test', spriteSource)
  assert.equal(ok, true)
  svc.onKey(30, 'down', 1000)
  assert.equal(backend.playHistory.length, 1)
})

test('onKey 未加载 profile 时静默不崩', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  svc.onKey(30, 'down', 1000)
  assert.equal(backend.playHistory.length, 0)
})

test('pause → resume 经历 close→open', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  await svc.setProfile('test', spriteSource)
  await svc.pause('sleep')
  assert.equal(backend.isOpen(), false)
  assert.equal(svc.getState().phase, 'suspended')
  await svc.resume()
  assert.equal(backend.isOpen(), true)
  assert.equal(svc.getState().phase, 'ready')
})

test('Suspended 时 onKey 不播', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  await svc.setProfile('test', spriteSource)
  await svc.pause('lock')
  backend.reset()
  svc.onKey(30, 'down', 1000)
  assert.equal(backend.playHistory.length, 0)
})

test('setEnabled(false) 设置 masterGain=0，Lifecycle 保持 Ready', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  svc.setEnabled(false)
  assert.equal(backend.masterGain, 0)
  assert.equal(svc.getState().phase, 'ready')
})

test('setEnabled(false) 后 onKey 不播', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  await svc.setProfile('test', spriteSource)
  svc.setEnabled(false)
  svc.onKey(30, 'down', 1000)
  assert.equal(backend.playHistory.length, 0)
})

test('setEnabled(true) 恢复 masterGain 到 baseVolume', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  svc.setVolume(0.6)
  svc.setEnabled(false)
  assert.equal(backend.masterGain, 0)
  svc.setEnabled(true)
  assert.equal(backend.masterGain, 0.6)
})

test('setProfile 后 activeProfile 反映在 health', async () => {
  const { svc } = await newSvc()
  await svc.start()
  await svc.setProfile('cherrymx-black-abs', spriteSource)
  const h = svc.getState()
  assert.equal(h.phase, 'ready')
  if (h.phase === 'ready') assert.equal(h.activeProfile, 'cherrymx-black-abs')
})

test('health-change 事件在状态转换时触发', async () => {
  const { svc } = await newSvc()
  const phases: string[] = []
  svc.on('health-change', (h) => phases.push(h.phase))
  await svc.start()
  assert.ok(phases.includes('booting') || phases.includes('ready'))
})

test('wpm / typingActive getter 委托给 analytics', async () => {
  const { svc } = await newSvc()
  await svc.start()
  await svc.setProfile('test', spriteSource)
  for (let i = 0; i < 30; i++) svc.onKey(30, 'down', 1000 + i * 100)
  assert.ok(svc.wpm > 0)
  assert.ok(svc.typingActive)
})

test('stop() 进 Shutdown + teardown', async () => {
  const { backend, svc } = await newSvc()
  await svc.start()
  await svc.stop()
  assert.equal(backend.isOpen(), false)
  assert.equal(svc.getState().phase, 'shutdown')
})

test('100 次 pause/resume 循环 Lifecycle 稳定', async () => {
  const { svc } = await newSvc()
  await svc.start()
  for (let i = 0; i < 100; i++) {
    await svc.pause('manual')
    await svc.resume()
  }
  assert.equal(svc.getState().phase, 'ready')
})
