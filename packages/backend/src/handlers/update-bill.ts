import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BILLS_TABLE = process.env.BILLS_TABLE!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const billId = event.pathParameters?.billId;
    const body = JSON.parse(event.body || '{}');

    if (!billId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing billId parameter' }),
      };
    }

    const { items, participants, description, tax, tip, additionalFees, lineItems } = body;
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {
      ':updatedAt': new Date().toISOString(),
    };
    const expressionAttributeNames: any = {};

    if (items) {
      updateExpressions.push('#items = :items');
      expressionAttributeNames['#items'] = 'items';
      expressionAttributeValues[':items'] = items;
      
      // Recalculate total
      const total = items.reduce((sum: number, item: any) => sum + (item.amount * (item.quantity || 1)), 0);
      updateExpressions.push('#total = :total');
      expressionAttributeNames['#total'] = 'total';
      expressionAttributeValues[':total'] = total;
    }

    if (lineItems) {
      updateExpressions.push('lineItems = :lineItems');
      expressionAttributeValues[':lineItems'] = lineItems;
    }

    if (participants) {
      updateExpressions.push('participants = :participants');
      expressionAttributeValues[':participants'] = participants;
    }

    if (description !== undefined) {
      updateExpressions.push('description = :description');
      expressionAttributeValues[':description'] = description;
    }

    // Handle tax update
    if (tax !== undefined) {
      updateExpressions.push('adjustedTax = :adjustedTax');
      expressionAttributeValues[':adjustedTax'] = tax;
    }

    // Handle tip update
    if (tip !== undefined) {
      updateExpressions.push('adjustedTip = :adjustedTip');
      expressionAttributeValues[':adjustedTip'] = tip;
    }

    // Handle additional fees update
    if (additionalFees !== undefined) {
      updateExpressions.push('additionalFees = :additionalFees');
      expressionAttributeValues[':additionalFees'] = additionalFees;
    }

    // Handle Venmo username update
    if (body.venmoUsername !== undefined) {
      updateExpressions.push('venmoUsername = :venmoUsername');
      expressionAttributeValues[':venmoUsername'] = body.venmoUsername;
    }

    updateExpressions.push('updatedAt = :updatedAt');

    const result = await docClient.send(new UpdateCommand({
      TableName: BILLS_TABLE,
      Key: { billId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
      ReturnValues: 'ALL_NEW',
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
      body: JSON.stringify({ success: true, billId, bill: result.Attributes }),
    };
  } catch (error) {
    console.error('Error updating bill:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to update bill' }),
    };
  }
};
