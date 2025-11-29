import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');

  try {
    if (body.action === 'subscribe' && body.billId) {
      // Update connection with billId for GSI lookup
      await docClient.send(new UpdateCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
        UpdateExpression: 'SET billId = :billId',
        ExpressionAttributeValues: {
          ':billId': body.billId,
        },
      }));

      console.log(`Connection ${connectionId} subscribed to bill ${body.billId}`);
      return { statusCode: 200, body: 'Subscribed' };
    }

    return { statusCode: 200, body: 'Message received' };
  } catch (error) {
    console.error('Error handling message:', error);
    return { statusCode: 500, body: 'Failed to process message' };
  }
};
