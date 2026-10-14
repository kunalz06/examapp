import test from 'node:test'
import assert from 'node:assert/strict'
import {
  initialPhoneObservation,
  observePhoneFrame,
  PHONE_ALERT_COOLDOWN_MS,
} from '../src/lib/phoneDetection.ts'

function sample(state, score, at) {
  return observePhoneFrame(state, score, at)
}

test('a single frame or low-confidence guesses never alert', () => {
  let current = initialPhoneObservation()
  current = sample(current, 0.96, 0).state
  assert.equal(sample(current, 0.2, 1800).alert, false)
  assert.equal(sample(current, null, 3600).alert, false)
})

test('three strong observations within eight seconds produce one incident', () => {
  let current = initialPhoneObservation()
  for (const [index, now] of [0, 1800, 3600].entries()) {
    const result = sample(current, 0.75, now)
    assert.equal(result.alert, index === 2)
    current = result.state
  }
  assert.equal(sample(current, 0.9, 5400).alert, false)
})

test('five seconds with no phone clears a sighting; cooldown prevents duplicate alerts', () => {
  let current = initialPhoneObservation()
  for (const at of [0, 1800, 3600]) current = sample(current, 0.8, at).state
  current = sample(current, null, 5400).state
  current = sample(current, null, 10400).state
  for (const at of [12200, 14000, 15800]) {
    const result = sample(current, 0.9, at)
    assert.equal(result.alert, false)
    current = result.state
  }
  current = sample(current, null, 20000).state
  current = sample(current, null, 25200).state
  let detected = false
  for (const at of [PHONE_ALERT_COOLDOWN_MS + 1000, PHONE_ALERT_COOLDOWN_MS + 2800, PHONE_ALERT_COOLDOWN_MS + 4600]) {
    const result = sample(current, 0.9, at)
    detected ||= result.alert
    current = result.state
  }
  assert.equal(detected, true)
})

test('isolated positives beyond eight seconds do not make a confirmed sighting', () => {
  let current = initialPhoneObservation()
  current = sample(current, 0.9, 0).state
  current = sample(current, 0.9, 1000).state
  assert.equal(sample(current, 0.9, 9500).alert, false)
})
