import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400; // 24 hours

  // Get billId from query string if provided (cast to any for WebSocket event)
  const queryParams = (event as any).queryStringParameters || {};
  const billId = queryParams.billId;

  try {
    await docClient.send(new PutCommand({
      TableName: CONNECTIONS_TABLE,
      Item: {
        connectionId,
        billId: billId || null,
        connectedAt: timestamp,
        ttl,
      },
    }));

    console.log(`WebSocket connected: ${connectionId}, billId: ${billId || 'none'}`);
    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('Error storing connection:', error);
    return { statusCode: 500, body: 'Failed to connect' };
  }
};
