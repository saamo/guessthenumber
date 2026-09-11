import { App } from 'aws-cdk-lib'
import { GameStack } from '../infra/game-stack'

const app = new App()

new GameStack(app, 'GuessTheNumberStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'Guess the Number game: API Gateway + Lambda + DynamoDB',
  tags: { project: 'guess-the-number' },
})
