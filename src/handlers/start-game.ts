import { randomUUID } from 'node:crypto'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { MAX_GUESS, MIN_GUESS, newSecret } from '../domain/game'
import { errorResponse, jsonResponse, requestIdOf } from '../http/response'
import { putGame } from '../repository/games'

/** POST /start-game */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const gameId = randomUUID()

    await putGame({ gameId, secret: newSecret() })

    return jsonResponse(201, {
      gameId,
      message: `Game started. Make a guess between ${MIN_GUESS} and ${MAX_GUESS}.`,
    })
  } catch (error) {
    return errorResponse(error, requestIdOf(event))
  }
}
