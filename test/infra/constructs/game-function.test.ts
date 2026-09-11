import { App, Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { GameFunction } from '../../../infra/constructs/game-function'

/** Synthesised alone, so the conventions are pinned for any function, not just today's two. */
const synth = (): Template => {
  const stack = new Stack(new App(), 'TestStack')

  new GameFunction(stack, 'ExampleFunction', {
    entry: 'guess.ts',
    environment: { TABLE_NAME: 'example' },
  })

  return Template.fromStack(stack)
}

let template: Template

beforeAll(() => {
  template = synth()
})

describe('GameFunction', () => {
  it('pins the runtime, architecture and size budget', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      MemorySize: 256,
      Timeout: 5,
    })
  })

  it('emits structured JSON logs', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      LoggingConfig: Match.objectLike({ LogFormat: 'JSON' }),
    })
  })

  it('owns a log group that does not outlive the stack', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 1)
    template.hasResource('AWS::Logs::LogGroup', {
      Properties: { RetentionInDays: 7 },
      DeletionPolicy: 'Delete',
    })
  })

  it('passes its environment through to the function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ TABLE_NAME: 'example' }) },
    })
  })

  it('actually enables the source maps it bundles', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ NODE_OPTIONS: '--enable-source-maps' }) },
    })
  })

  it('starts with no DynamoDB permissions until something grants them', () => {
    expect(JSON.stringify(template.toJSON())).not.toContain('dynamodb:')
  })
})
