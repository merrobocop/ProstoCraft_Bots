const { isReachable } = require('../src/utils')

describe('utils', () => {
  test('isReachable returns false without bot or block', () => {
    expect(isReachable(null, null)).toBe(false)
  })

  test('isReachable checks distance', () => {
    const bot = { entity: { position: { distanceTo: () => 3 } } }
    const block = { position: {} }
    expect(isReachable(bot, block, 4)).toBe(true)
    expect(isReachable(bot, block, 2)).toBe(false)
  })
})
