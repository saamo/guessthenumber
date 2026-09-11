import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { mockClient } from 'aws-sdk-client-mock'
import { MAX_GUESS, MIN_GUESS } from '../../src/domain/game'
import { handler } from '../../src/handlers/start-game'

const dynamodb = mockClient(DynamoDBDocumentClient)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const event = (): APIGatewayProxyEvent =>
  ({ requestContext: { requestId: 'req-1' } }) as unknown as APIGatewayProxyEvent

beforeEach(() => {
  dynamodb.reset()
  dynamodb.on(PutCommand).resolves({})
})

describe('POST /start-game', () => {
  // Exact match, not toMatchObject: an extra key or an interpolated secret fails it.
  it('answers 201 Created with a unique game id and the spec message, and nothing else', async () => {
    const response = await handler(event())

    expect(response.statusCode).toBe(201)
    expect(response.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(response.body)).toEqual({
      gameId: expect.stringMatching(UUID) as string,
      message: 'Game started. Make a guess between 1 and 100.',
    })
  })

  it('stores the game with a secret inside the playable range', async () => {
    const response = await handler(event())
    const { gameId } = JSON.parse(response.body) as { gameId: string }

    const item = dynamodb.commandCalls(PutCommand)[0]?.args[0].input.Item as {
      gameId: string
      secret: number
    }

    expect(item.gameId).toBe(gameId)
    expect(Number.isInteger(item.secret)).toBe(true)
    expect(item.secret).toBeGreaterThanOrEqual(MIN_GUESS)
    expect(item.secret).toBeLessThanOrEqual(MAX_GUESS)
  })

  // Guards the Lambda footgun: module scope survives warm invocations, so a
  // randomUUID() hoisted out of the handler would reuse one id forever.
  it('draws a new game id per invocation, not once per container', async () => {
    const first = JSON.parse((await handler(event())).body) as { gameId: string }
    const second = JSON.parse((await handler(event())).body) as { gameId: string }

    expect(first.gameId).not.toBe(second.gameId)
  })

  it('answers 500 when the game cannot be stored', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    dynamodb.on(PutCommand).rejects(new Error('throughput exceeded'))

    const response = await handler(event())

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
