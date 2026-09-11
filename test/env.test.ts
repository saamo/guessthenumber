import { requireEnv } from '../src/env'

describe('requireEnv', () => {
  const name = 'GUESS_THE_NUMBER_TEST_VAR'

  afterEach(() => {
    delete process.env[name]
  })

  it('returns the value when the variable is set', () => {
    process.env[name] = 'games-table'

    expect(requireEnv(name)).toBe('games-table')
  })

  it('throws when the variable is missing', () => {
    expect(() => requireEnv(name)).toThrow(`Missing required environment variable: ${name}`)
  })

  it('throws when the variable is empty', () => {
    process.env[name] = ''

    expect(() => requireEnv(name)).toThrow(`Missing required environment variable: ${name}`)
  })
})
