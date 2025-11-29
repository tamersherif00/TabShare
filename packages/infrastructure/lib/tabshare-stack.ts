import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export interface TabShareStackProps extends cdk.StackProps {
  environment: string;
}

export class TabShareStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TabShareStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ========================================
    // DynamoDB Tables
    // ========================================

    const billsTable = new dynamodb.Table(this, 'BillsTable', {
      partitionKey: { name: 'billId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environment === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environment === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    connectionsTable.addGlobalSecondaryIndex({
      indexName: 'billId-index',
      partitionKey: { name: 'billId', type: dynamodb.AttributeType.STRING },
    });

    // ========================================
    // S3 Buckets
    // ========================================

    const receiptsBucket = new s3.Bucket(this, 'ReceiptsBucket', {
      removalPolicy:
        environment === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
    });

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy:
        environment === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ========================================
    // Lambda Execution Role
    // ========================================

    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    billsTable.grantReadWriteData(lambdaRole);
    connectionsTable.grantReadWriteData(lambdaRole);
    receiptsBucket.grantReadWrite(lambdaRole);

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['textract:AnalyzeExpense', 'textract:DetectDocumentText'],
        resources: ['*'],
      })
    );

    // ========================================
    // Lambda Functions
    // ========================================

    const commonEnv = {
      BILLS_TABLE: billsTable.tableName,
      CONNECTIONS_TABLE: connectionsTable.tableName,
      RECEIPTS_BUCKET: receiptsBucket.bucketName,
      ENVIRONMENT: environment,
      NODE_ENV: 'production',
    };

    // WebSocket Handlers
    const wsConnectHandler = new lambda.Function(this, 'WsConnectHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/websocket-connect.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(10),
    });

    const wsDisconnectHandler = new lambda.Function(
      this,
      'WsDisconnectHandler',
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'handlers/websocket-disconnect.handler',
        code: lambda.Code.fromAsset('../backend/dist'),
        role: lambdaRole,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(10),
      }
    );

    const wsDefaultHandler = new lambda.Function(this, 'WsDefaultHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/websocket-default.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(30),
    });

    // Scheduled Functions
    const cleanupHandler = new lambda.Function(this, 'CleanupHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/cleanup-expired-bills.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.minutes(5),
    });

    const notifyHandler = new lambda.Function(this, 'NotifyHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/notify-expiring-bills.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.minutes(5),
    });

    // ========================================
    // WebSocket API
    // ========================================

    const webSocketApi = new apigatewayv2.CfnApi(this, 'WebSocketApi', {
      name: `tabshare-ws-${environment}`,
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.action',
    });

    new apigatewayv2.CfnStage(this, 'WebSocketStage', {
      apiId: webSocketApi.ref,
      stageName: environment,
      autoDeploy: true,
    });

    // WebSocket Integrations
    const connectIntegration = new apigatewayv2.CfnIntegration(
      this,
      'ConnectIntegration',
      {
        apiId: webSocketApi.ref,
        integrationType: 'AWS_PROXY',
        integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${wsConnectHandler.functionArn}/invocations`,
      }
    );

    const disconnectIntegration = new apigatewayv2.CfnIntegration(
      this,
      'DisconnectIntegration',
      {
        apiId: webSocketApi.ref,
        integrationType: 'AWS_PROXY',
        integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${wsDisconnectHandler.functionArn}/invocations`,
      }
    );

    const defaultIntegration = new apigatewayv2.CfnIntegration(
      this,
      'DefaultIntegration',
      {
        apiId: webSocketApi.ref,
        integrationType: 'AWS_PROXY',
        integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${wsDefaultHandler.functionArn}/invocations`,
      }
    );

    // WebSocket Routes
    new apigatewayv2.CfnRoute(this, 'ConnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$connect',
      authorizationType: 'NONE',
      target: `integrations/${connectIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'DisconnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$disconnect',
      authorizationType: 'NONE',
      target: `integrations/${disconnectIntegration.ref}`,
    });

    new apigatewayv2.CfnRoute(this, 'DefaultRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$default',
      authorizationType: 'NONE',
      target: `integrations/${defaultIntegration.ref}`,
    });

    // Lambda permissions for WebSocket
    wsConnectHandler.addPermission('WsConnectPermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
    });

    wsDisconnectHandler.addPermission('WsDisconnectPermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
    });

    wsDefaultHandler.addPermission('WsDefaultPermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
    });

    // Grant WebSocket management permissions
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
        ],
      })
    );

    const wsApiEndpoint = `https://${webSocketApi.ref}.execute-api.${this.region}.amazonaws.com/${environment}`;
    const wsUrl = `wss://${webSocketApi.ref}.execute-api.${this.region}.amazonaws.com/${environment}`;
    wsDefaultHandler.addEnvironment('WEBSOCKET_API_ENDPOINT', wsApiEndpoint);

    // ========================================
    // REST API Lambda Functions
    // ========================================

    const createBillHandler = new lambda.Function(this, 'CreateBillHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/create-bill.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(30),
    });

    const uploadReceiptHandler = new lambda.Function(
      this,
      'UploadReceiptHandler',
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'handlers/upload-receipt.handler',
        code: lambda.Code.fromAsset('../backend/dist'),
        role: lambdaRole,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(60),
        memorySize: 512,
      }
    );

    const getBillHandler = new lambda.Function(this, 'GetBillHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/get-bill.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(10),
    });

    const updateBillHandler = new lambda.Function(this, 'UpdateBillHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/update-bill.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(30),
    });

    const createBillWithUploadHandler = new lambda.Function(
      this,
      'CreateBillWithUploadHandler',
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'handlers/create-bill-with-upload.handler',
        code: lambda.Code.fromAsset('../backend/dist'),
        role: lambdaRole,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(10),
      }
    );

    const processReceiptHandler = new lambda.Function(
      this,
      'ProcessReceiptHandler',
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'handlers/process-receipt.handler',
        code: lambda.Code.fromAsset('../backend/dist'),
        role: lambdaRole,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(60),
        memorySize: 512,
      }
    );

    // Claims Handlers
    const claimEnv = {
      ...commonEnv,
      WEBSOCKET_API_ENDPOINT: wsApiEndpoint,
    };

    const createClaimHandler = new lambda.Function(this, 'CreateClaimHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/create-claim.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: claimEnv,
      timeout: cdk.Duration.seconds(10),
    });

    const updateClaimHandler = new lambda.Function(this, 'UpdateClaimHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/update-claim.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: claimEnv,
      timeout: cdk.Duration.seconds(10),
    });

    const deleteClaimHandler = new lambda.Function(this, 'DeleteClaimHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/delete-claim.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: lambdaRole,
      environment: claimEnv,
      timeout: cdk.Duration.seconds(10),
    });

    const createParticipantHandler = new lambda.Function(
      this,
      'CreateParticipantHandler',
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'handlers/create-participant.handler',
        code: lambda.Code.fromAsset('../backend/dist'),
        role: lambdaRole,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(10),
      }
    );

    // ========================================
    // REST API Gateway
    // ========================================

    const restApi = new apigateway.RestApi(this, 'RestApi', {
      restApiName: `tabshare-api-${environment}`,
      description: 'TabShare REST API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['*'],
      },
    });

    const apiResource = restApi.root.addResource('api');
    const billsResource = apiResource.addResource('bills');

    const uploadResource = billsResource.addResource('upload');
    uploadResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createBillWithUploadHandler)
    );

    const processResource = billsResource.addResource('process');
    processResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(processReceiptHandler)
    );

    billsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createBillHandler)
    );

    const billResource = billsResource.addResource('{billId}');
    billResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getBillHandler)
    );
    billResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(updateBillHandler)
    );

    const receiptResource = billResource.addResource('receipt');
    receiptResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(uploadReceiptHandler)
    );

    const amountsResource = billResource.addResource('amounts');
    amountsResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(updateBillHandler)
    );

    const itemsResource = billResource.addResource('items');
    itemsResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(updateBillHandler)
    );

    const claimsResource = apiResource.addResource('claims');
    claimsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createClaimHandler)
    );

    const claimResource = claimsResource.addResource('{claimId}');
    claimResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(updateClaimHandler)
    );
    claimResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(deleteClaimHandler)
    );

    const participantsResource = apiResource.addResource('participants');
    participantsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createParticipantHandler)
    );

    // ========================================
    // EventBridge Rules
    // ========================================

    new events.Rule(this, 'CleanupRule', {
      schedule: events.Schedule.cron({ hour: '2', minute: '0' }),
      targets: [new targets.LambdaFunction(cleanupHandler)],
    });

    new events.Rule(this, 'NotifyRule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      targets: [new targets.LambdaFunction(notifyHandler)],
    });

    // ========================================
    // CloudFront Distribution
    // ========================================

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'OAI',
      {
        comment: `OAI for ${id} frontend bucket`,
      }
    );

    frontendBucket.grantRead(originAccessIdentity);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity: originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: false,
    });

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'RestApiUrl', {
      value: restApi.url,
      description: 'REST API URL',
      exportName: `${id}-RestApiUrl`,
    });

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: wsUrl,
      description: 'WebSocket API URL',
      exportName: `${id}-WebSocketUrl`,
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
      exportName: `${id}-CloudFrontUrl`,
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'Frontend S3 Bucket Name',
      exportName: `${id}-FrontendBucketName`,
    });

    new cdk.CfnOutput(this, 'BillsTableName', {
      value: billsTable.tableName,
      description: 'DynamoDB Bills Table Name',
      exportName: `${id}-BillsTableName`,
    });

    new cdk.CfnOutput(this, 'ReceiptsBucketName', {
      value: receiptsBucket.bucketName,
      description: 'S3 Receipts Bucket Name',
      exportName: `${id}-ReceiptsBucketName`,
    });
  }
}
