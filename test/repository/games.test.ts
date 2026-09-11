import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { getGame, putGame } from '../../src/repository/games'

const dynamodb = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  dynamodb.reset()
})

describe('putGame', () => {
  it('writes the game to the configured table with no conditional guard', async () => {
    dynamodb.on(PutCommand).resolves({})

    await putGame({ gameId: 'abc', secret: 42 })

    const input = dynamodb.commandCalls(PutCommand)[0]?.args[0].input

    expect(input).toMatchObject({
      TableName: 'games-test-table',
      Item: { gameId: 'abc', secret: 42 },
    })
    // No attribute_not_exists: an SDK retry of a landed write must stay idempotent.
    expect(input?.ConditionExpression).toBeUndefined()
  })

  it('propagates a write failure instead of swallowing it', async () => {
    dynamodb.on(PutCommand).rejects(new Error('throughput exceeded'))

    await expect(putGame({ gameId: 'abc', secret: 42 })).rejects.toThrow('throughput exceeded')
  })
})

describe('getGame', () => {
  it('returns the stored game', async () => {
    dynamodb.on(GetCommand).resolves({ Item: { gameId: 'abc', secret: 42 } })

    await expect(getGame('abc')).resolves.toEqual({ gameId: 'abc', secret: 42 })
  })

  it('looks the game up by its primary key, consistently', async () => {
    dynamodb.on(GetCommand).resolves({ Item: { gameId: 'abc', secret: 42 } })

    await getGame('abc')

    expect(dynamodb.commandCalls(GetCommand)[0]?.args[0].input).toMatchObject({
      TableName: 'games-test-table',
      Key: { gameId: 'abc' },
      // A guess can arrive milliseconds after creation; an eventually consistent
      // read could miss it and 404 a game that exists.
      ConsistentRead: true,
    })
  })

  it('returns undefined when the game does not exist', async () => {
    dynamodb.on(GetCommand).resolves({})

    await expect(getGame('missing')).resolves.toBeUndefined()
  })

  it.each([
    ['the secret attribute is missing', { gameId: 'abc' }],
    ['the secret is not a number', { gameId: 'abc', secret: '42' }],
    ['the secret is not an integer', { gameId: 'abc', secret: 42.5 }],
  ])('throws when %s rather than returning a half-built game', async (_case, Item) => {
    dynamodb.on(GetCommand).resolves({ Item })

    await expect(getGame('abc')).rejects.toThrow(
      'Malformed game record for gameId "abc": "secret" is not an integer.',
    )
  })
})
