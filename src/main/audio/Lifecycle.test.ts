import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lifecycle, type LifecycleEvent } from './Lifecycle.ts'

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

test('Booting → Failed via boot-fail 且记录 reason', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-fail', { reason: 'device busy' })
  assert.equal(l.state, 'Failed')
  assert.equal(l.failureReason, 'device busy')
})

test('Ready → Suspended via suspend 且记录 reason', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-ok')
  l.transition('suspend', { reason: 'sleep' })
  assert.equal(l.state, 'Suspended')
  assert.equal(l.suspendReason, 'sleep')
})

test('Suspended → Recovering → Ready', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-ok')
  l.transition('suspend')
  l.transition('wake')
  assert.equal(l.state, 'Recovering')
  assert.equal(l.recoverAttempt, 1)
  l.transition('recover-ok')
  assert.equal(l.state, 'Ready')
  assert.equal(l.recoverAttempt, 0)
})

test('Recovering 累计 3 次 fail 后进 Failed', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-ok')
  l.transition('suspend')
  l.transition('wake')
  assert.equal(l.recoverAttempt, 1)
  l.transition('recover-fail')
  assert.equal(l.state, 'Recovering')
  assert.equal(l.recoverAttempt, 2)
  l.transition('recover-fail')
  assert.equal(l.state, 'Recovering')
  assert.equal(l.recoverAttempt, 3)
  l.transition('recover-fail')
  assert.equal(l.state, 'Failed')
  assert.ok(l.failureReason?.includes('recover exhausted'))
})

test('Failed → Recovering via manual-retry', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-fail', { reason: 'x' })
  l.transition('manual-retry')
  assert.equal(l.state, 'Recovering')
})

test('非法转移抛错', () => {
  const l = new Lifecycle()
  assert.throws(() => l.transition('suspend' as LifecycleEvent))
  assert.throws(() => l.transition('recover-ok' as LifecycleEvent))
})

test('state-change 回调带 from / to / meta', () => {
  const l = new Lifecycle()
  const events: Array<[string, string, string | undefined]> = []
  l.on('state-change', (from, to, meta) => events.push([from, to, meta?.reason]))
  l.transition('start')
  l.transition('boot-fail', { reason: 'no device' })
  assert.deepEqual(events, [
    ['Cold', 'Booting', undefined],
    ['Booting', 'Failed', 'no device'],
  ])
})

test('shutdown 从 Ready 进 Shutdown', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-ok')
  l.transition('shutdown')
  assert.equal(l.state, 'Shutdown')
})

test('shutdown 从 Failed 也可进 Shutdown', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-fail')
  l.transition('shutdown')
  assert.equal(l.state, 'Shutdown')
})

test('Shutdown 是终态，拒绝 start / manual-retry', () => {
  const l = new Lifecycle()
  l.transition('shutdown')
  assert.throws(() => l.transition('start'))
  assert.throws(() => l.transition('manual-retry' as LifecycleEvent))
})

test('recover-ok 清空 failureReason', () => {
  const l = new Lifecycle()
  l.transition('start')
  l.transition('boot-ok')
  l.transition('suspend')
  l.transition('wake')
  l.transition('recover-fail', { reason: 'flaky' })
  l.transition('recover-ok')
  assert.equal(l.failureReason, null)
})
