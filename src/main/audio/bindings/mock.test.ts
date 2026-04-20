import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MockBackend } from './mock.ts'

test('初始未 open', () => {
  const b = new MockBackend()
  assert.equal(b.isOpen(), false)
})

test('open 后 isOpen === true', async () => {
  const b = new MockBackend()
  await b.open(44100)
  assert.equal(b.isOpen(), true)
})

test('close 后 isOpen === false', async () => {
  const b = new MockBackend()
  await b.open(44100)
  await b.close()
  assert.equal(b.isOpen(), false)
})

test('decode 在未 open 状态下抛错', async () => {
  const b = new MockBackend()
  await assert.rejects(() => b.decode(new Uint8Array([0, 1, 2])))
})

test('decode 返回含 duration 和递增 id 的 DecodedAudio', async () => {
  const b = new MockBackend()
  await b.open(44100)
  const d1 = await b.decode(new Uint8Array([0, 0, 0, 0]))
  const d2 = await b.decode(new Uint8Array([1, 1, 1, 1]))
  assert.ok(d1.duration > 0)
  assert.equal(d1.sampleRate, 44100)
  assert.notEqual(d1.id, d2.id)
})

test('play 在未 open 状态下抛错', () => {
  const b = new MockBackend()
  const fake = { id: 'x', duration: 0.1, sampleRate: 44100, numberOfChannels: 2 }
  assert.throws(() => b.play(fake, { volume: 1, pitch: 1, pan: 0, durationSec: 0.1 }))
})

test('play 在 open 状态下记录到 playHistory', async () => {
  const b = new MockBackend()
  await b.open(44100)
  const fake = { id: 'x', duration: 0.1, sampleRate: 44100, numberOfChannels: 2 }
  b.play(fake, { volume: 0.5, pitch: 1.1, pan: -0.3, durationSec: 0.05 })
  assert.equal(b.playHistory.length, 1)
  assert.equal(b.playHistory[0].params.volume, 0.5)
  assert.equal(b.playHistory[0].params.pitch, 1.1)
  assert.equal(b.playHistory[0].params.pan, -0.3)
})

test('setMasterGain 透传', () => {
  const b = new MockBackend()
  b.setMasterGain(0.42)
  assert.equal(b.masterGain, 0.42)
})

test('reset 清空历史', async () => {
  const b = new MockBackend()
  await b.open(44100)
  const fake = { id: 'x', duration: 0.1, sampleRate: 44100, numberOfChannels: 2 }
  b.play(fake, { volume: 1, pitch: 1, pan: 0, durationSec: 0.1 })
  assert.equal(b.playHistory.length, 1)
  b.reset()
  assert.equal(b.playHistory.length, 0)
})

test('outputLatencyMs 返回预设值', () => {
  const b = new MockBackend()
  assert.equal(b.outputLatencyMs(), 5)
})
