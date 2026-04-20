import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SoundPackStore } from './SoundPackStore.ts'
import { MockBackend } from './bindings/mock.ts'

async function newStore() {
  const backend = new MockBackend()
  await backend.open(44100)
  return { backend, store: new SoundPackStore(backend) }
}

// 构造一个 fake sprite 字节流（MockBackend 不实际解码，只看字节数算 duration）
const bytes = (n: number) => new Uint8Array(n).fill(1)

test('未加载的 profile get 返回 undefined', async () => {
  const { store } = await newStore()
  assert.equal(store.get('nope'), undefined)
  assert.equal(store.has('nope'), false)
})

test('loadSprite 建立 key→slice 映射', async () => {
  const { store } = await newStore()
  const config = {
    defines: {
      '30': [0, 100] as [number, number],
      '30-up': [100, 100] as [number, number],
      '57': [200, 120] as [number, number],
    },
  }
  await store.loadSprite('test-sprite', bytes(88200), config)
  const pack = store.get('test-sprite')
  assert.ok(pack)
  assert.equal(pack!.type, 'sprite')
  if (pack!.type === 'sprite') {
    const k30 = pack.keys.get(30)
    assert.ok(k30?.down)
    assert.ok(k30?.up)
    // offset/duration 换算到秒
    assert.equal((k30!.down as any).offsetSec, 0)
    assert.equal((k30!.down as any).duration, 0.1)
    assert.equal((k30!.up as any).offsetSec, 0.1)
    assert.ok(pack.keys.has(57))
  }
})

test('loadSprite 用 key 30 作 fallback', async () => {
  const { store } = await newStore()
  const config = {
    defines: {
      '30': [0, 100] as [number, number],
      '30-up': [100, 100] as [number, number],
      '57': [200, 120] as [number, number],
    },
  }
  await store.loadSprite('fb-sprite', bytes(88200), config)
  const pack = store.get('fb-sprite')!
  if (pack.type === 'sprite') {
    assert.ok(pack.fallbackDown)
    assert.ok(pack.fallbackUp)
    assert.equal((pack.fallbackDown as any).offsetSec, 0) // key 30 down
    assert.equal((pack.fallbackUp as any).offsetSec, 0.1) // key 30 up
  }
})

test('loadSprite 无 key 30 时 fallback 用第一个命中', async () => {
  const { store } = await newStore()
  const config = {
    defines: {
      '57': [0, 100] as [number, number],
      '57-up': [100, 80] as [number, number],
    },
  }
  await store.loadSprite('no30', bytes(44100), config)
  const pack = store.get('no30')!
  if (pack.type === 'sprite') {
    assert.ok(pack.fallbackDown)
    assert.ok(pack.fallbackUp)
  }
})

test('loadSprite 非法 keycode 跳过不崩', async () => {
  const { store } = await newStore()
  const config = {
    defines: {
      'weird': [0, 100] as [number, number],
      '30': [0, 100] as [number, number],
    },
  }
  await store.loadSprite('has-bad', bytes(44100), config)
  const pack = store.get('has-bad')!
  if (pack.type === 'sprite') {
    assert.equal(pack.keys.size, 1)
    assert.ok(pack.keys.has(30))
  }
})

test('loadMulti 每个文件独立 decode', async () => {
  const { backend, store } = await newStore()
  await store.loadMulti(
    'multi-test',
    { defines: { '30': 'A-d.wav', '30-up': 'A-u.wav', '57': 'space.wav' } },
    { 'A-d.wav': bytes(100), 'A-u.wav': bytes(100), 'space.wav': bytes(100) },
  )
  const pack = store.get('multi-test')!
  if (pack.type === 'sprite') {
    const k30 = pack.keys.get(30)!
    assert.ok(k30.down && k30.up)
    assert.ok(pack.keys.has(57))
  }
  // 3 个 decode 调用（不算前面的没 decode 过）
  // MockBackend.decode 每次 id++，第一次 id=mock-0
  assert.ok((pack as any).keys.get(30).down.id.startsWith('mock-'))
  assert.equal(backend.isOpen(), true)
})

test('loadMulti 缺文件的 key 被跳过', async () => {
  const { store } = await newStore()
  await store.loadMulti(
    'missing',
    { defines: { '30': 'A-d.wav', '99': 'nope.wav' } },
    { 'A-d.wav': bytes(50) },
  )
  const pack = store.get('missing')!
  if (pack.type === 'sprite') {
    assert.ok(pack.keys.has(30))
    assert.equal(pack.keys.has(99), false)
  }
})

test('loadKbsim press/release 分桶 + GENERIC 变体', async () => {
  const { store } = await newStore()
  await store.loadKbsim('kb', {
    'press/GENERIC_R0.wav': bytes(100),
    'press/GENERIC_R1.wav': bytes(100),
    'press/GENERIC_R2.wav': bytes(100),
    'press/BACKSPACE.wav': bytes(100),
    'release/GENERIC.wav': bytes(100),
    'release/SPACE.wav': bytes(100),
  })
  const pack = store.get('kb')!
  assert.equal(pack.type, 'multi')
  if (pack.type === 'multi') {
    assert.equal(pack.data.press.generic.length, 3)
    assert.ok(pack.data.press.special.BACKSPACE)
    assert.ok(pack.data.release.generic)
    assert.ok(pack.data.release.special.SPACE)
  }
})

test('loadKbsim 单 GENERIC.wav (无 _R 后缀) 也归入 generic 池', async () => {
  const { store } = await newStore()
  await store.loadKbsim('kb-single', {
    'press/GENERIC.wav': bytes(100),
    'release/GENERIC.wav': bytes(100),
  })
  const pack = store.get('kb-single')!
  if (pack.type === 'multi') {
    assert.equal(pack.data.press.generic.length, 1)
    assert.ok(pack.data.release.generic)
  }
})

test('has(id) 在加载后返回 true', async () => {
  const { store } = await newStore()
  assert.equal(store.has('x'), false)
  await store.loadSprite('x', bytes(44100), { defines: { '30': [0, 100] } })
  assert.equal(store.has('x'), true)
})

test('clear() 清空所有 pack', async () => {
  const { store } = await newStore()
  await store.loadSprite('x', bytes(44100), { defines: { '30': [0, 100] } })
  await store.loadSprite('y', bytes(44100), { defines: { '30': [0, 100] } })
  store.clear()
  assert.equal(store.has('x'), false)
  assert.equal(store.has('y'), false)
})

test('loadSprite 覆盖同 id 旧 pack', async () => {
  const { store } = await newStore()
  await store.loadSprite('dup', bytes(44100), { defines: { '30': [0, 100] } })
  await store.loadSprite('dup', bytes(44100), { defines: { '57': [0, 100] } })
  const pack = store.get('dup')!
  if (pack.type === 'sprite') {
    assert.equal(pack.keys.has(30), false)
    assert.equal(pack.keys.has(57), true)
  }
})
