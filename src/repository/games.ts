import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { requireEnv } from '../env'

export interface Game {
  gameId: string
  secret: number
}

const tableName = requireEnv('TABLE_NAME')

// Created once per container so warm invocations reuse the HTTP connection.
const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

/** `GetCommand` types the item as `any`, so parse it rather than trusting it. */
const parseGame = (gameId: string, item: Record<string, unknown>): Game => {
  const { secret } = item

  if (typeof secret !== 'number' || !Number.isInteger(secret)) {
    throw new Error(`Malformed game record for gameId "${gameId}": "secret" is not an integer.`)
  }

  return { gameId, secret }
}

export const putGame = async (game: Game): Promise<void> => {
  await documentClient.send(
    new PutCommand({
      TableName: tableName,
      Item: game,
      // Deliberately unconditional: on a fresh UUID an attribute_not_exists guard
      // could only fire on an SDK retry of a write that already landed.
    }),
  )
}

export const getGame = async (gameId: string): Promise<Game | undefined> => {
  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { gameId },
      // A guess can arrive milliseconds after the game is created; an eventually
      // consistent read could miss it and report a spurious 404.
      ConsistentRead: true,
    }),
  )

  return Item === undefined ? undefined : parseGame(gameId, Item)
}
