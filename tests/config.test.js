const { mergeConfig, validateConfig } = require('../src/config')

describe('config helpers', () => {
  test('mergeConfig merges nested objects', () => {
    const base = { a: { b: 1 }, c: 2 }
    const overrides = { a: { b: 3 }, d: 4 }
    expect(mergeConfig(base, overrides)).toEqual({ a: { b: 3 }, c: 2, d: 4 })
  })

  test('validateConfig catches missing fields', () => {
    const errors = validateConfig({ server: {}, menu: {}, bots: [] })
    expect(errors.length).toBeGreaterThan(0)
  })
})
