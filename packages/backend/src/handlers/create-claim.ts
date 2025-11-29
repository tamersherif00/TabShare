import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { broadcastToBill } from '../utils/websocket-broadcast';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BILLS_TABLE = process.env.BILLS_TABLE!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Create claim request:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { billId, participantId, participantName, itemId, percentage } = body;

    if (!billId || !participantId || !participantName || !itemId || percentage === undefined) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields: billId, participantId, participantName, itemId, percentage' }),
      };
    }

    // Get the bill
    const billResult = await docClient.send(new GetCommand({
      TableName: BILLS_TABLE,
      Key: { billId },
    }));

    if (!billResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Bill not found' }),
      };
    }

    const bill = billResult.Item;
    const lineItems = bill.lineItems || bill.items || [];
    const item = lineItems.find((i: any) => i.id === itemId);

    if (!item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Item not found' }),
      };
    }

    const amount = (item.price || item.amount || 0) * (percentage / 100);
    const claimId = randomUUID();

    const claim = {
      id: claimId,
      billId,
      participantId,
      participantName,
      itemId,
      percentage,
      amount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add claim to bill's claims array
    const existingClaims = bill.claims || [];
    const updatedClaims = [...existingClaims, claim];

    await docClient.send(new UpdateCommand({
      TableName: BILLS_TABLE,
      Key: { billId },
      UpdateExpression: 'SET claims = :claims, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':claims': updatedClaims,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    console.log(`Created claim: ${participantName} claimed ${percentage}% of ${item.name || item.description}`);

    // Broadcast to all connected clients
    await broadcastToBill(billId, {
      type: 'CLAIM_CREATED',
      payload: { claim },
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ claim }),
    };
  } catch (error) {
    console.error('Error creating claim:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to create claim' }),
    };
  }
};
