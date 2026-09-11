import { RemovalPolicy } from 'aws-cdk-lib'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import type { Grant, IGrantable } from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export class GamesTable extends Construct {
  readonly table: Table

  constructor(scope: Construct, id: string) {
    super(scope, id)

    this.table = new Table(this, 'Resource', {
      partitionKey: { name: 'gameId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      // This is a throwaway exercise stack; production would use RETAIN.
      removalPolicy: RemovalPolicy.DESTROY,
    })
  }

  get tableName(): string {
    return this.table.tableName
  }

  /** One action each, rather than the broader grantWriteData/grantReadData. */
  grantCreateGame(grantee: IGrantable): Grant {
    return this.table.grant(grantee, 'dynamodb:PutItem')
  }

  grantReadGame(grantee: IGrantable): Grant {
    return this.table.grant(grantee, 'dynamodb:GetItem')
  }
}
