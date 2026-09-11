import { join } from 'node:path'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import type { IGrantable, IPrincipal } from 'aws-cdk-lib/aws-iam'
import { Architecture, LoggingFormat, Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

const HANDLERS_DIR = join(__dirname, '..', '..', 'src', 'handlers')

export interface GameFunctionProps {
  /** File name under `src/handlers`, e.g. `guess.ts`. */
  readonly entry: string
  readonly environment: Record<string, string>
}

/** The project's Lambda conventions, applied to every handler. */
export class GameFunction extends Construct implements IGrantable {
  readonly function: NodejsFunction

  constructor(scope: Construct, id: string, props: GameFunctionProps) {
    super(scope, id)

    this.function = new NodejsFunction(this, 'Resource', {
      entry: join(HANDLERS_DIR, props.entry),
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      loggingFormat: LoggingFormat.JSON,
      logGroup: new LogGroup(this, 'Logs', {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        ...props.environment,
        // esbuild emits the map; Node ignores it unless asked, and CDK does not ask.
        NODE_OPTIONS: '--enable-source-maps',
      },
      // The managed nodejs24.x image ships SDK v3 — this matches the CDK default.
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: true },
    })
  }

  get grantPrincipal(): IPrincipal {
    return this.function.grantPrincipal
  }
}
