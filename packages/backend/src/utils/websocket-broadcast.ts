import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;

export async function broadcastToBill(billId: string, message: any): Promise<void> {
  if (!WEBSOCKET_API_ENDPOINT) {
    console.log('WebSocket API endpoint not configured, skipping broadcast');
    return;
  }

  try {
    // Query connections for this bill using GSI
    const result = await docClient.send(new QueryCommand({
      TableName: CONNECTIONS_TABLE,
      IndexName: 'billId-index',
      KeyConditionExpression: 'billId = :billId',
      ExpressionAttributeValues: {
        ':billId': billId,
      },
    }));

    const connections = result.Items || [];
    
    if (connections.length === 0) {
      console.log(`No connections found for bill ${billId}`);
      return;
    }

    console.log(`Broadcasting to ${connections.length} connections for bill ${billId}`);

    // Create API Gateway Management API client
    const apiClient = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_API_ENDPOINT,
    });

    const messageData = JSON.stringify(message);

    // Send message to all connections
    const sendPromises = connections.map(async (conn) => {
      try {
        await apiClient.send(new PostToConnectionCommand({
          ConnectionId: conn.connectionId,
          Data: Buffer.from(messageData),
        }));
      } catch (error: any) {
        // Connection might be stale, ignore errors
        if (error.statusCode === 410) {
          console.log(`Stale connection ${conn.connectionId}, should be cleaned up`);
        } else {
          console.error(`Failed to send to ${conn.connectionId}:`, error);
        }
      }
    });

    await Promise.all(sendPromises);
    console.log(`Broadcast complete for bill ${billId}`);
  } catch (error) {
    console.error('Error broadcasting to bill:', error);
  }
}
