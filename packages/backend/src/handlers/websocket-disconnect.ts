import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  try {
    await docClient.send(new DeleteCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    }));

    console.log(`WebSocket disconnected: ${connectionId}`);
    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('Error removing connection:', error);
    return { statusCode: 500, body: 'Failed to disconnect' };
  }
};
