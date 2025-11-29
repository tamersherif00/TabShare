"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TabShareStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const apigatewayv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
class TabShareStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment } = props;
        // ========================================
        // DynamoDB Tables
        // ========================================
        const billsTable = new dynamodb.Table(this, 'BillsTable', {
            partitionKey: { name: 'billId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: environment === 'prod'
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
            removalPolicy: environment === 'prod'
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
            removalPolicy: environment === 'prod'
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
            removalPolicy: environment === 'prod'
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
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        billsTable.grantReadWriteData(lambdaRole);
        connectionsTable.grantReadWriteData(lambdaRole);
        receiptsBucket.grantReadWrite(lambdaRole);
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ['textract:AnalyzeExpense', 'textract:DetectDocumentText'],
            resources: ['*'],
        }));
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
        const wsDisconnectHandler = new lambda.Function(this, 'WsDisconnectHandler', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handlers/websocket-disconnect.handler',
            code: lambda.Code.fromAsset('../backend/dist'),
            role: lambdaRole,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(10),
        });
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
        const connectIntegration = new apigatewayv2.CfnIntegration(this, 'ConnectIntegration', {
            apiId: webSocketApi.ref,
            integrationType: 'AWS_PROXY',
            integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${wsConnectHandler.functionArn}/invocations`,
        });
        const disconnectIntegration = new apigatewayv2.CfnIntegration(this, 'DisconnectIntegration', {
            apiId: webSocketApi.ref,
            integrationType: 'AWS_PROXY',
            integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${wsDisconnectHandler.functionArn}/invocations`,
        });
        const defaultIntegration = new apigatewayv2.CfnIntegration(this, 'DefaultIntegration', {
            apiId: webSocketApi.ref,
            integrationType: 'AWS_PROXY',
            integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${wsDefaultHandler.functionArn}/invocations`,
        });
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
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ['execute-api:ManageConnections'],
            resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
            ],
        }));
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
        const uploadReceiptHandler = new lambda.Function(this, 'UploadReceiptHandler', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handlers/upload-receipt.handler',
            code: lambda.Code.fromAsset('../backend/dist'),
            role: lambdaRole,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
        });
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
        const createBillWithUploadHandler = new lambda.Function(this, 'CreateBillWithUploadHandler', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handlers/create-bill-with-upload.handler',
            code: lambda.Code.fromAsset('../backend/dist'),
            role: lambdaRole,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(10),
        });
        const processReceiptHandler = new lambda.Function(this, 'ProcessReceiptHandler', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handlers/process-receipt.handler',
            code: lambda.Code.fromAsset('../backend/dist'),
            role: lambdaRole,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
        });
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
        const createParticipantHandler = new lambda.Function(this, 'CreateParticipantHandler', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handlers/create-participant.handler',
            code: lambda.Code.fromAsset('../backend/dist'),
            role: lambdaRole,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(10),
        });
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
        uploadResource.addMethod('POST', new apigateway.LambdaIntegration(createBillWithUploadHandler));
        const processResource = billsResource.addResource('process');
        processResource.addMethod('POST', new apigateway.LambdaIntegration(processReceiptHandler));
        billsResource.addMethod('POST', new apigateway.LambdaIntegration(createBillHandler));
        const billResource = billsResource.addResource('{billId}');
        billResource.addMethod('GET', new apigateway.LambdaIntegration(getBillHandler));
        billResource.addMethod('PUT', new apigateway.LambdaIntegration(updateBillHandler));
        const receiptResource = billResource.addResource('receipt');
        receiptResource.addMethod('POST', new apigateway.LambdaIntegration(uploadReceiptHandler));
        const amountsResource = billResource.addResource('amounts');
        amountsResource.addMethod('PUT', new apigateway.LambdaIntegration(updateBillHandler));
        const itemsResource = billResource.addResource('items');
        itemsResource.addMethod('PUT', new apigateway.LambdaIntegration(updateBillHandler));
        const claimsResource = apiResource.addResource('claims');
        claimsResource.addMethod('POST', new apigateway.LambdaIntegration(createClaimHandler));
        const claimResource = claimsResource.addResource('{claimId}');
        claimResource.addMethod('PUT', new apigateway.LambdaIntegration(updateClaimHandler));
        claimResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteClaimHandler));
        const participantsResource = apiResource.addResource('participants');
        participantsResource.addMethod('POST', new apigateway.LambdaIntegration(createParticipantHandler));
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
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
            comment: `OAI for ${id} frontend bucket`,
        });
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
exports.TabShareStack = TabShareStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFic2hhcmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0YWJzaGFyZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsbUVBQXFEO0FBQ3JELCtEQUFpRDtBQUNqRCx1RUFBeUQ7QUFDekQsMkVBQTZEO0FBQzdELHVEQUF5QztBQUN6Qyx1RUFBeUQ7QUFDekQsNEVBQThEO0FBQzlELHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQsd0VBQTBEO0FBTzFELE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QiwyQ0FBMkM7UUFDM0Msa0JBQWtCO1FBQ2xCLDJDQUEyQztRQUUzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN4RCxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNyRSxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELGFBQWEsRUFDWCxXQUFXLEtBQUssTUFBTTtnQkFDcEIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtnQkFDMUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUMvQixtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLE1BQU0sRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLGtCQUFrQjtTQUNuRCxDQUFDLENBQUM7UUFFSCxNQUFNLGdCQUFnQixHQUFH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LENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDNUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxVQUFVO1lBQ2hDLFdBQVcsRUFBRSx5QkFBeUI7WUFDdEMsVUFBVSxFQUFFLEdBQUcsRUFBRSxxQkFBcUI7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDM0IsV0FBVyxFQUFFLDJCQUEyQjtZQUN4QyxVQUFVLEVBQUUsR0FBRyxFQUFFLGlCQUFpQjtTQUNuQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxjQUFjLENBQUMsVUFBVTtZQUNoQyxXQUFXLEVBQUUseUJBQXlCO1lBQ3RDLFVBQVUsRUFBRSxHQUFHLEVBQUUscUJBQXFCO1NBQ3ZDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZqQkQsc0NBdWpCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XHJcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXl2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyJztcclxuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcclxuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XHJcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xyXG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUYWJTaGFyZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFRhYlNoYXJlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBUYWJTaGFyZVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIER5bmFtb0RCIFRhYmxlc1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuICAgIGNvbnN0IGJpbGxzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0JpbGxzVGFibGUnLCB7XHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnYmlsbElkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTpcclxuICAgICAgICBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnXHJcbiAgICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTlxyXG4gICAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcclxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVMsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBjb25uZWN0aW9uc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdDb25uZWN0aW9uc1RhYmxlJywge1xyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAnY29ubmVjdGlvbklkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTpcclxuICAgICAgICBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnXHJcbiAgICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTlxyXG4gICAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbm5lY3Rpb25zVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdiaWxsSWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2JpbGxJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBTMyBCdWNrZXRzXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgY29uc3QgcmVjZWlwdHNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdSZWNlaXB0c0J1Y2tldCcsIHtcclxuICAgICAgcmVtb3ZhbFBvbGljeTpcclxuICAgICAgICBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnXHJcbiAgICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTlxyXG4gICAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcclxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcclxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxyXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxyXG4gICAgICBjb3JzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtcclxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxyXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QVVQsXHJcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBPU1QsXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxyXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxyXG4gICAgICAgICAgbWF4QWdlOiAzMDAwLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxyXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBmcm9udGVuZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Zyb250ZW5kQnVja2V0Jywge1xyXG4gICAgICByZW1vdmFsUG9saWN5OlxyXG4gICAgICAgIGVudmlyb25tZW50ID09PSAncHJvZCdcclxuICAgICAgICAgID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOXHJcbiAgICAgICAgICA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxyXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBMYW1iZGEgRXhlY3V0aW9uIFJvbGVcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYW1iZGFFeGVjdXRpb25Sb2xlJywge1xyXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcclxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXHJcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxyXG4gICAgICAgICAgJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnXHJcbiAgICAgICAgKSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIGJpbGxzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGxhbWJkYVJvbGUpO1xyXG4gICAgY29ubmVjdGlvbnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEobGFtYmRhUm9sZSk7XHJcbiAgICByZWNlaXB0c0J1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFSb2xlKTtcclxuXHJcbiAgICBsYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgYWN0aW9uczogWyd0ZXh0cmFjdDpBbmFseXplRXhwZW5zZScsICd0ZXh0cmFjdDpEZXRlY3REb2N1bWVudFRleHQnXSxcclxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBMYW1iZGEgRnVuY3Rpb25zXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgY29uc3QgY29tbW9uRW52ID0ge1xyXG4gICAgICBCSUxMU19UQUJMRTogYmlsbHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIENPTk5FQ1RJT05TX1RBQkxFOiBjb25uZWN0aW9uc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgUkVDRUlQVFNfQlVDS0VUOiByZWNlaXB0c0J1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXHJcbiAgICAgIE5PREVfRU5WOiAncHJvZHVjdGlvbicsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFdlYlNvY2tldCBIYW5kbGVyc1xyXG4gICAgY29uc3Qgd3NDb25uZWN0SGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1dzQ29ubmVjdEhhbmRsZXInLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcnMvd2Vic29ja2V0LWNvbm5lY3QuaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vYmFja2VuZC9kaXN0JyksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHdzRGlzY29ubmVjdEhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnV3NEaXNjb25uZWN0SGFuZGxlcicsXHJcbiAgICAgIHtcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcnMvd2Vic29ja2V0LWRpc2Nvbm5lY3QuaGFuZGxlcicsXHJcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcclxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxyXG4gICAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHdzRGVmYXVsdEhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdXc0RlZmF1bHRIYW5kbGVyJywge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXJzL3dlYnNvY2tldC1kZWZhdWx0LmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2JhY2tlbmQvZGlzdCcpLFxyXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTY2hlZHVsZWQgRnVuY3Rpb25zXHJcbiAgICBjb25zdCBjbGVhbnVwSGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NsZWFudXBIYW5kbGVyJywge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXJzL2NsZWFudXAtZXhwaXJlZC1iaWxscy5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBub3RpZnlIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTm90aWZ5SGFuZGxlcicsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9ub3RpZnktZXhwaXJpbmctYmlsbHMuaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vYmFja2VuZC9kaXN0JyksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gV2ViU29ja2V0IEFQSVxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuICAgIGNvbnN0IHdlYlNvY2tldEFwaSA9IG5ldyBhcGlnYXRld2F5djIuQ2ZuQXBpKHRoaXMsICdXZWJTb2NrZXRBcGknLCB7XHJcbiAgICAgIG5hbWU6IGB0YWJzaGFyZS13cy0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHByb3RvY29sVHlwZTogJ1dFQlNPQ0tFVCcsXHJcbiAgICAgIHJvdXRlU2VsZWN0aW9uRXhwcmVzc2lvbjogJyRyZXF1ZXN0LmJvZHkuYWN0aW9uJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBhcGlnYXRld2F5djIuQ2ZuU3RhZ2UodGhpcywgJ1dlYlNvY2tldFN0YWdlJywge1xyXG4gICAgICBhcGlJZDogd2ViU29ja2V0QXBpLnJlZixcclxuICAgICAgc3RhZ2VOYW1lOiBlbnZpcm9ubWVudCxcclxuICAgICAgYXV0b0RlcGxveTogdHJ1ZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFdlYlNvY2tldCBJbnRlZ3JhdGlvbnNcclxuICAgIGNvbnN0IGNvbm5lY3RJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5djIuQ2ZuSW50ZWdyYXRpb24oXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdDb25uZWN0SW50ZWdyYXRpb24nLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXBpSWQ6IHdlYlNvY2tldEFwaS5yZWYsXHJcbiAgICAgICAgaW50ZWdyYXRpb25UeXBlOiAnQVdTX1BST1hZJyxcclxuICAgICAgICBpbnRlZ3JhdGlvblVyaTogYGFybjphd3M6YXBpZ2F0ZXdheToke3RoaXMucmVnaW9ufTpsYW1iZGE6cGF0aC8yMDE1LTAzLTMxL2Z1bmN0aW9ucy8ke3dzQ29ubmVjdEhhbmRsZXIuZnVuY3Rpb25Bcm59L2ludm9jYXRpb25zYCxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBkaXNjb25uZWN0SW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheXYyLkNmbkludGVncmF0aW9uKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnRGlzY29ubmVjdEludGVncmF0aW9uJyxcclxuICAgICAge1xyXG4gICAgICAgIGFwaUlkOiB3ZWJTb2NrZXRBcGkucmVmLFxyXG4gICAgICAgIGludGVncmF0aW9uVHlwZTogJ0FXU19QUk9YWScsXHJcbiAgICAgICAgaW50ZWdyYXRpb25Vcmk6IGBhcm46YXdzOmFwaWdhdGV3YXk6JHt0aGlzLnJlZ2lvbn06bGFtYmRhOnBhdGgvMjAxNS0wMy0zMS9mdW5jdGlvbnMvJHt3c0Rpc2Nvbm5lY3RIYW5kbGVyLmZ1bmN0aW9uQXJufS9pbnZvY2F0aW9uc2AsXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZGVmYXVsdEludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXl2Mi5DZm5JbnRlZ3JhdGlvbihcclxuICAgICAgdGhpcyxcclxuICAgICAgJ0RlZmF1bHRJbnRlZ3JhdGlvbicsXHJcbiAgICAgIHtcclxuICAgICAgICBhcGlJZDogd2ViU29ja2V0QXBpLnJlZixcclxuICAgICAgICBpbnRlZ3JhdGlvblR5cGU6ICdBV1NfUFJPWFknLFxyXG4gICAgICAgIGludGVncmF0aW9uVXJpOiBgYXJuOmF3czphcGlnYXRld2F5OiR7dGhpcy5yZWdpb259OmxhbWJkYTpwYXRoLzIwMTUtMDMtMzEvZnVuY3Rpb25zLyR7d3NEZWZhdWx0SGFuZGxlci5mdW5jdGlvbkFybn0vaW52b2NhdGlvbnNgLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIFdlYlNvY2tldCBSb3V0ZXNcclxuICAgIG5ldyBhcGlnYXRld2F5djIuQ2ZuUm91dGUodGhpcywgJ0Nvbm5lY3RSb3V0ZScsIHtcclxuICAgICAgYXBpSWQ6IHdlYlNvY2tldEFwaS5yZWYsXHJcbiAgICAgIHJvdXRlS2V5OiAnJGNvbm5lY3QnLFxyXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogJ05PTkUnLFxyXG4gICAgICB0YXJnZXQ6IGBpbnRlZ3JhdGlvbnMvJHtjb25uZWN0SW50ZWdyYXRpb24ucmVmfWAsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgYXBpZ2F0ZXdheXYyLkNmblJvdXRlKHRoaXMsICdEaXNjb25uZWN0Um91dGUnLCB7XHJcbiAgICAgIGFwaUlkOiB3ZWJTb2NrZXRBcGkucmVmLFxyXG4gICAgICByb3V0ZUtleTogJyRkaXNjb25uZWN0JyxcclxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6ICdOT05FJyxcclxuICAgICAgdGFyZ2V0OiBgaW50ZWdyYXRpb25zLyR7ZGlzY29ubmVjdEludGVncmF0aW9uLnJlZn1gLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGFwaWdhdGV3YXl2Mi5DZm5Sb3V0ZSh0aGlzLCAnRGVmYXVsdFJvdXRlJywge1xyXG4gICAgICBhcGlJZDogd2ViU29ja2V0QXBpLnJlZixcclxuICAgICAgcm91dGVLZXk6ICckZGVmYXVsdCcsXHJcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiAnTk9ORScsXHJcbiAgICAgIHRhcmdldDogYGludGVncmF0aW9ucy8ke2RlZmF1bHRJbnRlZ3JhdGlvbi5yZWZ9YCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIExhbWJkYSBwZXJtaXNzaW9ucyBmb3IgV2ViU29ja2V0XHJcbiAgICB3c0Nvbm5lY3RIYW5kbGVyLmFkZFBlcm1pc3Npb24oJ1dzQ29ubmVjdFBlcm1pc3Npb24nLCB7XHJcbiAgICAgIHByaW5jaXBhbDogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdhcGlnYXRld2F5LmFtYXpvbmF3cy5jb20nKSxcclxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06JHt3ZWJTb2NrZXRBcGkucmVmfS8qYCxcclxuICAgIH0pO1xyXG5cclxuICAgIHdzRGlzY29ubmVjdEhhbmRsZXIuYWRkUGVybWlzc2lvbignV3NEaXNjb25uZWN0UGVybWlzc2lvbicsIHtcclxuICAgICAgcHJpbmNpcGFsOiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2FwaWdhdGV3YXkuYW1hem9uYXdzLmNvbScpLFxyXG4gICAgICBzb3VyY2VBcm46IGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToke3dlYlNvY2tldEFwaS5yZWZ9LypgLFxyXG4gICAgfSk7XHJcblxyXG4gICAgd3NEZWZhdWx0SGFuZGxlci5hZGRQZXJtaXNzaW9uKCdXc0RlZmF1bHRQZXJtaXNzaW9uJywge1xyXG4gICAgICBwcmluY2lwYWw6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnYXBpZ2F0ZXdheS5hbWF6b25hd3MuY29tJyksXHJcbiAgICAgIHNvdXJjZUFybjogYGFybjphd3M6ZXhlY3V0ZS1hcGk6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OiR7d2ViU29ja2V0QXBpLnJlZn0vKmAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBXZWJTb2NrZXQgbWFuYWdlbWVudCBwZXJtaXNzaW9uc1xyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGFjdGlvbnM6IFsnZXhlY3V0ZS1hcGk6TWFuYWdlQ29ubmVjdGlvbnMnXSxcclxuICAgICAgICByZXNvdXJjZXM6IFtcclxuICAgICAgICAgIGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToke3dlYlNvY2tldEFwaS5yZWZ9LypgLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHdzQXBpRW5kcG9pbnQgPSBgaHR0cHM6Ly8ke3dlYlNvY2tldEFwaS5yZWZ9LmV4ZWN1dGUtYXBpLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHtlbnZpcm9ubWVudH1gO1xyXG4gICAgY29uc3Qgd3NVcmwgPSBgd3NzOi8vJHt3ZWJTb2NrZXRBcGkucmVmfS5leGVjdXRlLWFwaS4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tLyR7ZW52aXJvbm1lbnR9YDtcclxuICAgIHdzRGVmYXVsdEhhbmRsZXIuYWRkRW52aXJvbm1lbnQoJ1dFQlNPQ0tFVF9BUElfRU5EUE9JTlQnLCB3c0FwaUVuZHBvaW50KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBSRVNUIEFQSSBMYW1iZGEgRnVuY3Rpb25zXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgY29uc3QgY3JlYXRlQmlsbEhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDcmVhdGVCaWxsSGFuZGxlcicsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9jcmVhdGUtYmlsbC5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgdXBsb2FkUmVjZWlwdEhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnVXBsb2FkUmVjZWlwdEhhbmRsZXInLFxyXG4gICAgICB7XHJcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXJzL3VwbG9hZC1yZWNlaXB0LmhhbmRsZXInLFxyXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vYmFja2VuZC9kaXN0JyksXHJcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZ2V0QmlsbEhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXRCaWxsSGFuZGxlcicsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9nZXQtYmlsbC5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgdXBkYXRlQmlsbEhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcGRhdGVCaWxsSGFuZGxlcicsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy91cGRhdGUtYmlsbC5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgY3JlYXRlQmlsbFdpdGhVcGxvYWRIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcclxuICAgICAgdGhpcyxcclxuICAgICAgJ0NyZWF0ZUJpbGxXaXRoVXBsb2FkSGFuZGxlcicsXHJcbiAgICAgIHtcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcnMvY3JlYXRlLWJpbGwtd2l0aC11cGxvYWQuaGFuZGxlcicsXHJcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcclxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxyXG4gICAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHByb2Nlc3NSZWNlaXB0SGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdQcm9jZXNzUmVjZWlwdEhhbmRsZXInLFxyXG4gICAgICB7XHJcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXJzL3Byb2Nlc3MtcmVjZWlwdC5oYW5kbGVyJyxcclxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2JhY2tlbmQvZGlzdCcpLFxyXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIENsYWltcyBIYW5kbGVyc1xyXG4gICAgY29uc3QgY2xhaW1FbnYgPSB7XHJcbiAgICAgIC4uLmNvbW1vbkVudixcclxuICAgICAgV0VCU09DS0VUX0FQSV9FTkRQT0lOVDogd3NBcGlFbmRwb2ludCxcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgY3JlYXRlQ2xhaW1IYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ3JlYXRlQ2xhaW1IYW5kbGVyJywge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXJzL2NyZWF0ZS1jbGFpbS5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNsYWltRW52LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCB1cGRhdGVDbGFpbUhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcGRhdGVDbGFpbUhhbmRsZXInLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcnMvdXBkYXRlLWNsYWltLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2JhY2tlbmQvZGlzdCcpLFxyXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxyXG4gICAgICBlbnZpcm9ubWVudDogY2xhaW1FbnYsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGRlbGV0ZUNsYWltSGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RlbGV0ZUNsYWltSGFuZGxlcicsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9kZWxldGUtY2xhaW0uaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vYmFja2VuZC9kaXN0JyksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiBjbGFpbUVudixcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgY3JlYXRlUGFydGljaXBhbnRIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcclxuICAgICAgdGhpcyxcclxuICAgICAgJ0NyZWF0ZVBhcnRpY2lwYW50SGFuZGxlcicsXHJcbiAgICAgIHtcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcnMvY3JlYXRlLXBhcnRpY2lwYW50LmhhbmRsZXInLFxyXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vYmFja2VuZC9kaXN0JyksXHJcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBSRVNUIEFQSSBHYXRld2F5XHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgY29uc3QgcmVzdEFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1Jlc3RBcGknLCB7XHJcbiAgICAgIHJlc3RBcGlOYW1lOiBgdGFic2hhcmUtYXBpLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUYWJTaGFyZSBSRVNUIEFQSScsXHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogWycqJ10sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBhcGlSZXNvdXJjZSA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZSgnYXBpJyk7XHJcbiAgICBjb25zdCBiaWxsc1Jlc291cmNlID0gYXBpUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2JpbGxzJyk7XHJcblxyXG4gICAgY29uc3QgdXBsb2FkUmVzb3VyY2UgPSBiaWxsc1Jlc291cmNlLmFkZFJlc291cmNlKCd1cGxvYWQnKTtcclxuICAgIHVwbG9hZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BPU1QnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihjcmVhdGVCaWxsV2l0aFVwbG9hZEhhbmRsZXIpXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHByb2Nlc3NSZXNvdXJjZSA9IGJpbGxzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2Nlc3MnKTtcclxuICAgIHByb2Nlc3NSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgICdQT1NUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvY2Vzc1JlY2VpcHRIYW5kbGVyKVxyXG4gICAgKTtcclxuXHJcbiAgICBiaWxsc1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BPU1QnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihjcmVhdGVCaWxsSGFuZGxlcilcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgYmlsbFJlc291cmNlID0gYmlsbHNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2JpbGxJZH0nKTtcclxuICAgIGJpbGxSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgICdHRVQnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRCaWxsSGFuZGxlcilcclxuICAgICk7XHJcbiAgICBiaWxsUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnUFVUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odXBkYXRlQmlsbEhhbmRsZXIpXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHJlY2VpcHRSZXNvdXJjZSA9IGJpbGxSZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVjZWlwdCcpO1xyXG4gICAgcmVjZWlwdFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BPU1QnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1cGxvYWRSZWNlaXB0SGFuZGxlcilcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgYW1vdW50c1Jlc291cmNlID0gYmlsbFJlc291cmNlLmFkZFJlc291cmNlKCdhbW91bnRzJyk7XHJcbiAgICBhbW91bnRzUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnUFVUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odXBkYXRlQmlsbEhhbmRsZXIpXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGl0ZW1zUmVzb3VyY2UgPSBiaWxsUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2l0ZW1zJyk7XHJcbiAgICBpdGVtc1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BVVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVwZGF0ZUJpbGxIYW5kbGVyKVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjbGFpbXNSZXNvdXJjZSA9IGFwaVJlc291cmNlLmFkZFJlc291cmNlKCdjbGFpbXMnKTtcclxuICAgIGNsYWltc1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BPU1QnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihjcmVhdGVDbGFpbUhhbmRsZXIpXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGNsYWltUmVzb3VyY2UgPSBjbGFpbXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2NsYWltSWR9Jyk7XHJcbiAgICBjbGFpbVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BVVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVwZGF0ZUNsYWltSGFuZGxlcilcclxuICAgICk7XHJcbiAgICBjbGFpbVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ0RFTEVURScsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGRlbGV0ZUNsYWltSGFuZGxlcilcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgcGFydGljaXBhbnRzUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgncGFydGljaXBhbnRzJyk7XHJcbiAgICBwYXJ0aWNpcGFudHNSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgICdQT1NUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oY3JlYXRlUGFydGljaXBhbnRIYW5kbGVyKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBFdmVudEJyaWRnZSBSdWxlc1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuICAgIG5ldyBldmVudHMuUnVsZSh0aGlzLCAnQ2xlYW51cFJ1bGUnLCB7XHJcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7IGhvdXI6ICcyJywgbWludXRlOiAnMCcgfSksXHJcbiAgICAgIHRhcmdldHM6IFtuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihjbGVhbnVwSGFuZGxlcildLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdOb3RpZnlSdWxlJywge1xyXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLmhvdXJzKDYpKSxcclxuICAgICAgdGFyZ2V0czogW25ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKG5vdGlmeUhhbmRsZXIpXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzSWRlbnRpdHkgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eShcclxuICAgICAgdGhpcyxcclxuICAgICAgJ09BSScsXHJcbiAgICAgIHtcclxuICAgICAgICBjb21tZW50OiBgT0FJIGZvciAke2lkfSBmcm9udGVuZCBidWNrZXRgLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIGZyb250ZW5kQnVja2V0LmdyYW50UmVhZChvcmlnaW5BY2Nlc3NJZGVudGl0eSk7XHJcblxyXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdEaXN0cmlidXRpb24nLCB7XHJcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xyXG4gICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4oZnJvbnRlbmRCdWNrZXQsIHtcclxuICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5OiBvcmlnaW5BY2Nlc3NJZGVudGl0eSxcclxuICAgICAgICB9KSxcclxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcclxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcclxuICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxyXG4gICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRF9PUFRJT05TLFxyXG4gICAgICB9LFxyXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxyXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcclxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxyXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcclxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXHJcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcclxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXHJcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXHJcbiAgICAgIGVuYWJsZUxvZ2dpbmc6IGZhbHNlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZXN0QXBpVXJsJywge1xyXG4gICAgICB2YWx1ZTogcmVzdEFwaS51cmwsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUkVTVCBBUEkgVVJMJyxcclxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LVJlc3RBcGlVcmxgLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYlNvY2tldFVybCcsIHtcclxuICAgICAgdmFsdWU6IHdzVXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1dlYlNvY2tldCBBUEkgVVJMJyxcclxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LVdlYlNvY2tldFVybGAsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2xvdWRGcm9udFVybCcsIHtcclxuICAgICAgdmFsdWU6IGBodHRwczovLyR7ZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBVUkwnLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHtpZH0tQ2xvdWRGcm9udFVybGAsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnJvbnRlbmRCdWNrZXROYW1lJywge1xyXG4gICAgICB2YWx1ZTogZnJvbnRlbmRCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdGcm9udGVuZCBTMyBCdWNrZXQgTmFtZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke2lkfS1Gcm9udGVuZEJ1Y2tldE5hbWVgLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0JpbGxzVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogYmlsbHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgQmlsbHMgVGFibGUgTmFtZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke2lkfS1CaWxsc1RhYmxlTmFtZWAsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUmVjZWlwdHNCdWNrZXROYW1lJywge1xyXG4gICAgICB2YWx1ZTogcmVjZWlwdHNCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdTMyBSZWNlaXB0cyBCdWNrZXQgTmFtZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke2lkfS1SZWNlaXB0c0J1Y2tldE5hbWVgLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==