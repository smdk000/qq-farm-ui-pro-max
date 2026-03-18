import assert from 'node:assert/strict'
import test from 'node:test'

const {
  clearClientErrors,
  getRecentClientErrors,
  pushClientError,
} = await import('../src/utils/bug-report-client-errors.ts')

test('client error buffer keeps recent entries and returns copies', () => {
  clearClientErrors()

  for (let index = 1; index <= 25; index += 1) {
    pushClientError({ message: `错误 ${index}`, source: 'unit-test' })
  }

  const recent = getRecentClientErrors(5)
  assert.equal(recent.length, 5)
  assert.equal(recent[0].message, '错误 21')
  assert.equal(recent[4].message, '错误 25')

  recent[0].message = 'mutated'
  const afterMutation = getRecentClientErrors(5)
  assert.equal(afterMutation[0].message, '错误 21')

  clearClientErrors()
  assert.deepEqual(getRecentClientErrors(10), [])
})

test('pushClientError extracts message and stack from Error objects', () => {
  clearClientErrors()

  const error = new Error('网络异常')
  pushClientError({ error, source: 'window.onerror' })

  const recent = getRecentClientErrors(1)
  assert.equal(recent.length, 1)
  assert.equal(recent[0].message, '网络异常')
  assert.equal(recent[0].source, 'window.onerror')
  assert.match(recent[0].stack || '', /网络异常/)
})
