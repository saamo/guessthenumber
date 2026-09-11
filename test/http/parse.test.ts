import { ValidationError } from '../../src/http/errors'
import { parseGuessRequest } from '../../src/http/parse'

const body = (payload: unknown): string => JSON.stringify(payload)

describe('parseGuessRequest', () => {
  it('returns the typed request for a valid payload', () => {
    expect(parseGuessRequest(body({ gameId: 'abc', guess: 42 }))).toEqual({
      gameId: 'abc',
      guess: 42,
    })
  })

  it('accepts both ends of the playable range', () => {
    expect(parseGuessRequest(body({ gameId: 'abc', guess: 1 })).guess).toBe(1)
    expect(parseGuessRequest(body({ gameId: 'abc', guess: 100 })).guess).toBe(100)
  })

  it('returns the trimmed gameId so the lookup key matches what was stored', () => {
    expect(parseGuessRequest(body({ gameId: '  abc  ', guess: 42 })).gameId).toBe('abc')
  })

  it('ignores unknown properties', () => {
    expect(parseGuessRequest(body({ gameId: 'abc', guess: 42, cheat: true }))).toEqual({
      gameId: 'abc',
      guess: 42,
    })
  })

  it.each([
    ['a missing body', null, 'Request body is required.'],
    ['an empty body', '', 'Request body is required.'],
    ['malformed JSON', '{"gameId":', 'Request body must be valid JSON.'],
    ['a JSON array', '[]', 'Request body must be a JSON object.'],
    ['a JSON scalar', '"nope"', 'Request body must be a JSON object.'],
    ['JSON null', 'null', 'Request body must be a JSON object.'],
    ['a missing gameId', '{"guess":42}', '"gameId" must be a non-empty string.'],
    ['a non-string gameId', '{"gameId":7,"guess":42}', '"gameId" must be a non-empty string.'],
    ['a blank gameId', '{"gameId":"   ","guess":42}', '"gameId" must be a non-empty string.'],
    ['a missing guess', '{"gameId":"abc"}', '"guess" must be a number.'],
    ['a numeric string guess', '{"gameId":"abc","guess":"42"}', '"guess" must be a number.'],
    ['a null guess', '{"gameId":"abc","guess":null}', '"guess" must be a number.'],
    ['a fractional guess', '{"gameId":"abc","guess":42.5}', '"guess" must be an integer.'],
    ['a guess below the range', '{"gameId":"abc","guess":0}', '"guess" must be between 1 and 100.'],
    [
      'a guess above the range',
      '{"gameId":"abc","guess":101}',
      '"guess" must be between 1 and 100.',
    ],
    [
      'a gameId longer than an issued UUID',
      JSON.stringify({ gameId: 'x'.repeat(37), guess: 42 }),
      '"gameId" must be at most 36 characters.',
    ],
  ])('rejects %s', (_case, payload, message) => {
    expect(() => parseGuessRequest(payload)).toThrow(new ValidationError(message))
  })
})
