import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
  console.log('Update claim request:', JSON.stringify(event, null, 2));

  try {
    const claimId = event.pathParameters?.claimId;
    const body = JSON.parse(event.body || '{}');
    const { percentage } = body;

    if (!claimId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing claimId' }),
      };
    }

    if (percentage === undefined) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing percentage' }),
      };
    }

    // Find the bill containing this claim by scanning all bills
    const allBillsResult = await docClient.send(new ScanCommand({
      TableName: BILLS_TABLE,
    }));

    let targetBill = null;
    let targetClaimIndex = -1;

    for (const bill of allBillsResult.Items || []) {
      const claims = bill.claims || [];
      const claimIndex = claims.findIndex((c: any) => c.id === claimId);
      if (claimIndex !== -1) {
        targetBill = bill;
        targetClaimIndex = claimIndex;
        break;
      }
    }

    if (!targetBill || targetClaimIndex === -1) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Claim not found' }),
      };
    }

    const lineItems = targetBill.lineItems || targetBill.items || [];
    const claim = targetBill.claims[targetClaimIndex];
    const item = lineItems.find((i: any) => i.id === claim.itemId);

    if (!item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Item not found' }),
      };
    }

    const amount = (item.price || item.amount || 0) * (percentage / 100);

    // Update the claim
    const updatedClaim = {
      ...claim,
      percentage,
      amount,
      updatedAt: new Date().toISOString(),
    };

    const updatedClaims = [...targetBill.claims];
    updatedClaims[targetClaimIndex] = updatedClaim;

    await docClient.send(new UpdateCommand({
      TableName: BILLS_TABLE,
      Key: { billId: targetBill.billId },
      UpdateExpression: 'SET claims = :claims, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':claims': updatedClaims,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    console.log(`Updated claim: ${claimId} to ${percentage}%`);

    // Broadcast to all connected clients
    await broadcastToBill(targetBill.billId, {
      type: 'CLAIM_UPDATED',
      payload: { claim: updatedClaim },
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ claim: updatedClaim }),
    };
  } catch (error) {
    console.error('Error updating claim:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to update claim' }),
    };
  }
};
