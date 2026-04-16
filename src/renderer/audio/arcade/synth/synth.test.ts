import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KICK_DURATION_S, HAT_DURATION_S, CLAP_DURATION_S, SWELL_DURATION_S } from './constants.ts'

test('KICK_DURATION_S ≈ 0.12s', () => {
  assert.ok(KICK_DURATION_S >= 0.10 && KICK_DURATION_S <= 0.15)
})

test('HAT_DURATION_S ≈ 0.04s', () => {
  assert.ok(HAT_DURATION_S >= 0.03 && HAT_DURATION_S <= 0.06)
})

test('CLAP_DURATION_S ≈ 0.08s', () => {
  assert.ok(CLAP_DURATION_S >= 0.06 && CLAP_DURATION_S <= 0.10)
})

test('SWELL_DURATION_S ≥ 1s（loop 基底）', () => {
  assert.ok(SWELL_DURATION_S >= 1.0)
})
