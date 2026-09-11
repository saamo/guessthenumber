import { MAX_GUESS, MIN_GUESS, evaluateGuess, newSecret } from '../../src/domain/game'

describe('evaluateGuess', () => {
  it('reports a guess below the secret as too low', () => {
    expect(evaluateGuess(42, 41)).toBe('TOO_LOW')
  })

  it('reports a guess above the secret as too high', () => {
    expect(evaluateGuess(42, 43)).toBe('TOO_HIGH')
  })

  it('reports a matching guess as correct', () => {
    expect(evaluateGuess(42, 42)).toBe('CORRECT')
  })

  it('refuses to compare against a non-comparable secret instead of reporting a win', () => {
    expect(() => evaluateGuess(Number.NaN, 42)).toThrow(
      'Cannot evaluate a guess against a non-comparable secret.',
    )
  })
})

describe('newSecret', () => {
  it('produces integers spanning the whole playable range', () => {
    const secrets = Array.from({ length: 5000 }, () => newSecret())

    for (const secret of secrets) {
      expect(Number.isInteger(secret)).toBe(true)
      expect(secret).toBeGreaterThanOrEqual(MIN_GUESS)
      expect(secret).toBeLessThanOrEqual(MAX_GUESS)
    }
    expect(new Set(secrets)).toContain(MIN_GUESS)
    expect(new Set(secrets)).toContain(MAX_GUESS)
  })
})
