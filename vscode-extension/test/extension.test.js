const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

describe('Extension Test Suite', () => {
  it('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5))
    assert.strictEqual(-1, [1, 2, 3].indexOf(0))
  })
})
