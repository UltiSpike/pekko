import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioGraph } from './AudioGraph.ts'
import { MockBackend } from './bindings/mock.ts'

test('init 打开 backend', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  assert.equal(b.isOpen(), true)
  assert.equal(g.isOpen(), true)
})

test('init 幂等：已 open 不重复打开', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  await g.init() // 不抛错
  assert.equal(b.isOpen(), true)
})

test('teardown 关闭 backend', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  await g.teardown()
  assert.equal(b.isOpen(), false)
})

test('teardown 幂等：已 close 不抛', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.teardown() // 未 init 也不炸
  assert.equal(b.isOpen(), false)
})

test('playBuffer 透传到 backend.play', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  const audio = await g.decode(new Uint8Array([0, 0, 0, 0]))
  g.playBuffer(audio, { volume: 0.7, pitch: 1.0, pan: 0, durationSec: 0.1 })
  assert.equal(b.playHistory.length, 1)
  assert.equal(b.playHistory[0].params.volume, 0.7)
})

test('playBuffer 在未 open 时静默不崩', () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  const fakeAudio = { id: 'x', duration: 0.1, sampleRate: 44100, numberOfChannels: 2 }
  g.playBuffer(fakeAudio, { volume: 1, pitch: 1, pan: 0, durationSec: 0.1 })
  // MockBackend.play 在未 open 会抛错——AudioGraph 的 isOpen 检查挡住了
  assert.equal(b.playHistory.length, 0)
})

test('setMasterGain 透传', async () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  await g.init()
  g.setMasterGain(0.33)
  assert.equal(b.masterGain, 0.33)
})

test('outputLatencyMs 透传', () => {
  const b = new MockBackend()
  const g = new AudioGraph(b)
  assert.equal(g.outputLatencyMs(), 5)
})
