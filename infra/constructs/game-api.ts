import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway'
import type { IFunction } from 'aws-cdk-lib/aws-lambda'
import { Construct } from 'constructs'

export interface GameApiProps {
  /** Path part -> handler; every route is a `POST` off the root. */
  readonly routes: Record<string, IFunction>
}

/** No CloudWatch role on purpose: `AWS::ApiGateway::Account` is account-wide. */
export class GameApi extends Construct {
  readonly api: RestApi

  constructor(scope: Construct, id: string, props: GameApiProps) {
    super(scope, id)

    this.api = new RestApi(this, 'Resource', {
      restApiName: 'guess-the-number',
      description: 'Guess the Number game API',
      deployOptions: { stageName: 'prod' },
    })

    for (const [pathPart, handler] of Object.entries(props.routes)) {
      this.api.root.addResource(pathPart).addMethod('POST', new LambdaIntegration(handler))
    }
  }

  get url(): string {
    return this.api.url
  }
}
