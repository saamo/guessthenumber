import { randomInt } from 'node:crypto'

/** Inclusive bounds of the number the player has to guess. */
export const MIN_GUESS = 1
export const MAX_GUESS = 100

export type GuessOutcome = 'TOO_LOW' | 'TOO_HIGH' | 'CORRECT'

/** `randomInt` is a CSPRNG, so earlier draws reveal nothing about the next one. */
export const newSecret = (): number => randomInt(MIN_GUESS, MAX_GUESS + 1)

/** `CORRECT` is matched first, never the fallthrough: an unorderable secret would win. */
export const evaluateGuess = (secret: number, guess: number): GuessOutcome => {
  if (guess === secret) return 'CORRECT'
  if (guess < secret) return 'TOO_LOW'
  if (guess > secret) return 'TOO_HIGH'

  throw new Error('Cannot evaluate a guess against a non-comparable secret.')
}
