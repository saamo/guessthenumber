import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { GuessOutcome } from '../domain/game'
import { evaluateGuess } from '../domain/game'
import { NotFoundError } from '../http/errors'
import { parseGuessRequest } from '../http/parse'
import { errorResponse, jsonResponse, requestIdOf } from '../http/response'
import { getGame } from '../repository/games'

const OUTCOME_MESSAGES: Record<GuessOutcome, string> = {
  TOO_LOW: 'Too low. Try again!',
  TOO_HIGH: 'Too high. Try again!',
  CORRECT: "Correct! You've guessed the number.",
}

/** POST /guess */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { gameId, guess } = parseGuessRequest(event.body)

    const game = await getGame(gameId)
    if (game === undefined) throw new NotFoundError('Game not found.')

    return jsonResponse(200, { message: OUTCOME_MESSAGES[evaluateGuess(game.secret, guess)] })
  } catch (error) {
    return errorResponse(error, requestIdOf(event))
  }
}
