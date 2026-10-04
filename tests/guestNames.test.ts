import { describe, expect, it } from 'vitest'
import { EXPLORER_NAMES, generateGuestName } from '../src/utils/guestNames'

describe('guest explorer names', () => {
  it('uses the agreed pool and preserves six UID characters within the length limit', () => {
    expect(EXPLORER_NAMES).toHaveLength(16)
    expect(new Set(EXPLORER_NAMES).size).toBe(16)
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const uid = `Ab3xYz-user-${i}`
      const name = generateGuestName(uid)
      const [explorer, suffix] = name.split('-')
      expect(EXPLORER_NAMES).toContain(explorer)
      expect(suffix).toBe('Ab3xYz')
      expect(name.length).toBeLessThanOrEqual(17)
      expect(generateGuestName(uid)).toBe(name)
      seen.add(explorer)
    }
    // Different full UIDs sharing a prefix still select across the whole pool.
    expect(seen.size).toBe(16)
  })
  it('requires an identity before generating a name', () => {
    expect(() => generateGuestName('')).toThrow('UID')
  })
})
