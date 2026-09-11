import { CfnOutput, Stack } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { GameApi } from './constructs/game-api'
import { GameFunction } from './constructs/game-function'
import { GamesTable } from './constructs/games-table'

export class GameStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const games = new GamesTable(this, 'GamesTable')
    const environment = { TABLE_NAME: games.tableName }

    const startGame = new GameFunction(this, 'StartGameFunction', {
      entry: 'start-game.ts',
      environment,
    })
    const guess = new GameFunction(this, 'GuessFunction', { entry: 'guess.ts', environment })

    games.grantCreateGame(startGame)
    games.grantReadGame(guess)

    const api = new GameApi(this, 'GameApi', {
      routes: { 'start-game': startGame.function, guess: guess.function },
    })

    new CfnOutput(this, 'ApiUrl', { value: api.url, description: 'Base URL of the game API' })
    new CfnOutput(this, 'TableName', {
      value: games.tableName,
      description: 'DynamoDB games table',
    })
  }
}
