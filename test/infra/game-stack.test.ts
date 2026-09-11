import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { GameStack } from '../../infra/game-stack'

interface PolicyResource {
  Properties: {
    PolicyDocument: { Statement: { Action: string | string[]; Effect: string }[] }
    Roles: { Ref: string }[]
  }
}

let template: Template

beforeAll(() => {
  template = Template.fromStack(new GameStack(new App(), 'TestStack'))
})

describe('DynamoDB', () => {
  it('stores games in a single table keyed by gameId', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1)
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'gameId', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'gameId', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    })
  })
})

// Runtime, size, logging and source maps are pinned in the GameFunction construct
// test; this file only checks how the stack composes the pieces.
describe('Lambda', () => {
  it('builds both handlers through GameFunction', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2)
    template.resourceCountIs('AWS::Logs::LogGroup', 2)
    template.allResourcesProperties('AWS::Lambda::Function', { Runtime: 'nodejs24.x' })
  })

  it('passes the table name to both handlers', () => {
    template.allResourcesProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ TABLE_NAME: Match.anyValue() }) },
    })
  })
})

const policies = (): PolicyResource[] =>
  Object.values(template.findResources('AWS::IAM::Policy')) as unknown as PolicyResource[]

/** Via the `Roles` binding: asking whether *some* policy grants PutItem survives a swap. */
const actionsGrantedTo = (roleLogicalIdPrefix: string): string[] =>
  policies()
    .filter((policy) => policy.Properties.Roles.some((r) => r.Ref.startsWith(roleLogicalIdPrefix)))
    .flatMap((policy) =>
      policy.Properties.PolicyDocument.Statement.flatMap((statement) => statement.Action),
    )

describe('IAM', () => {
  it('gives each handler its own policy and no others', () => {
    expect(policies()).toHaveLength(2)
  })

  it('grants the start-game handler PutItem and nothing else', () => {
    expect(actionsGrantedTo('StartGameFunctionServiceRole')).toEqual(['dynamodb:PutItem'])
  })

  it('grants the guess handler GetItem and nothing else', () => {
    expect(actionsGrantedTo('GuessFunctionServiceRole')).toEqual(['dynamodb:GetItem'])
  })

  it('scopes every grant to the games table', () => {
    for (const policy of policies()) {
      for (const statement of policy.Properties.PolicyDocument.Statement) {
        expect(statement.Effect).toBe('Allow')
        expect(JSON.stringify(statement)).toContain('GamesTable')
      }
    }
  })
})

describe('API Gateway', () => {
  it('exposes the two documented routes as POST', () => {
    for (const pathPart of ['start-game', 'guess']) {
      template.hasResourceProperties('AWS::ApiGateway::Resource', { PathPart: pathPart })
    }

    template.resourceCountIs('AWS::ApiGateway::Method', 2)
    template.allResourcesProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'NONE',
    })
  })

  it('integrates the routes with Lambda proxy', () => {
    template.allResourcesProperties('AWS::ApiGateway::Method', {
      Integration: Match.objectLike({ Type: 'AWS_PROXY', IntegrationHttpMethod: 'POST' }),
    })
  })
})

describe('outputs', () => {
  it('publishes the API url and the table name', () => {
    expect(Object.keys(template.findOutputs('*'))).toEqual(
      expect.arrayContaining(['ApiUrl', 'TableName']),
    )
  })
})
