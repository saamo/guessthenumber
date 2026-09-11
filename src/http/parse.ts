import { MAX_GUESS, MIN_GUESS } from '../domain/game'
import { ValidationError } from './errors'

export interface GuessRequest {
  gameId: string
  guess: number
}

/**
 * Every id we issue is a 36-character UUID, so nothing longer can name a real
 * game. The cap is only here so an oversized key fails as a 400 instead of
 * reaching DynamoDB and coming back as a 500. Shorter ids still pass and 404
 * normally — the id stays opaque, so callers cannot depend on its format.
 */
const MAX_GAME_ID_LENGTH = 36

const parseJsonObject = (body: string | null): Record<string, unknown> => {
  if (body === null || body.length === 0) throw new ValidationError('Request body is required.')

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    throw new ValidationError('Request body must be valid JSON.')
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.')
  }

  return payload as Record<string, unknown>
}

export const parseGuessRequest = (body: string | null): GuessRequest => {
  const { gameId, guess } = parseJsonObject(body)

  if (typeof gameId !== 'string' || gameId.trim().length === 0) {
    throw new ValidationError('"gameId" must be a non-empty string.')
  }

  // Return the same string we validated: a padded key would 404 a game that exists.
  const trimmedGameId = gameId.trim()

  if (trimmedGameId.length > MAX_GAME_ID_LENGTH) {
    throw new ValidationError(`"gameId" must be at most ${MAX_GAME_ID_LENGTH} characters.`)
  }

  if (typeof guess !== 'number') throw new ValidationError('"guess" must be a number.')

  if (!Number.isInteger(guess)) throw new ValidationError('"guess" must be an integer.')

  if (guess < MIN_GUESS || guess > MAX_GUESS) {
    throw new ValidationError(`"guess" must be between ${MIN_GUESS} and ${MAX_GUESS}.`)
  }

  return { gameId: trimmedGameId, guess }
}
