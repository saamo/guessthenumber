import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { mockClient } from 'aws-sdk-client-mock'
import { handler } from '../../src/handlers/guess'

const dynamodb = mockClient(DynamoDBDocumentClient)

const eventWith = (body: string | null): APIGatewayProxyEvent =>
  ({ body, requestContext: { requestId: 'req-1' } }) as unknown as APIGatewayProxyEvent

const guessEvent = (guess: unknown): APIGatewayProxyEvent =>
  eventWith(JSON.stringify({ gameId: 'abc', guess }))

const gameWithSecret = (secret: number): void => {
  dynamodb.on(GetCommand).resolves({ Item: { gameId: 'abc', secret } })
}

beforeEach(() => {
  dynamodb.reset()
})

describe('POST /guess', () => {
  it('answers 200 and "too low" when the guess is under the secret', async () => {
    gameWithSecret(42)

    const response = await handler(guessEvent(41))

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ message: 'Too low. Try again!' })
  })

  it('answers 200 and "too high" when the guess is over the secret', async () => {
    gameWithSecret(42)

    const response = await handler(guessEvent(43))

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ message: 'Too high. Try again!' })
  })

  it('answers 200 and "correct" when the guess matches', async () => {
    gameWithSecret(42)

    const response = await handler(guessEvent(42))

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ message: "Correct! You've guessed the number." })
  })

  it('never reveals the secret, whatever the outcome', async () => {
    gameWithSecret(42)

    for (const guess of [41, 42, 43]) {
      expect((await handler(guessEvent(guess))).body).not.toContain('42')
    }
  })

  it('answers 404 for an unknown gameId', async () => {
    dynamodb.on(GetCommand).resolves({})

    const response = await handler(guessEvent(42))

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ message: 'Game not found.' })
  })

  // The rejection cases themselves live in parse.test.ts; this only proves a
  // ValidationError reaches the caller as a 400 with its reason intact.
  it('turns a validation failure into a 400 that keeps the reason', async () => {
    const response = await handler(eventWith('{"gameId":"abc","guess":101}'))

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ message: '"guess" must be between 1 and 100.' })
  })

  it('does not touch DynamoDB when the request is invalid', async () => {
    await handler(eventWith('{'))

    expect(dynamodb.commandCalls(GetCommand)).toHaveLength(0)
  })

  it('answers 500 for a malformed record instead of declaring the guess correct', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    dynamodb.on(GetCommand).resolves({ Item: { gameId: 'abc' } })

    const response = await handler(guessEvent(42))

    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('Correct')
    expect(log).toHaveBeenCalled()
  })

  it('still answers when invoked without an API Gateway requestContext', async () => {
    gameWithSecret(42)

    const bare = { body: '{"gameId":"abc","guess":42}' } as unknown as APIGatewayProxyEvent
    const response = await handler(bare)

    expect(response.statusCode).toBe(200)
  })

  it('answers 500 when the game cannot be read, with an id the caller can quote', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    dynamodb.on(GetCommand).rejects(new Error('throughput exceeded'))

    const response = await handler(guessEvent(42))

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      message: 'Internal server error.',
      requestId: 'req-1',
    })
    expect(log).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ requestId: 'req-1' }),
    )
  })
})
