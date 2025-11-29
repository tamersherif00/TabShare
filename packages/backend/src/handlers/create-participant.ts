import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

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
  console.log('Create participant request:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { billId, name } = body;

    if (!billId || !name) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'billId and name are required' }),
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

    // Check if this name matches the payer
    if (bill.payerName && bill.payerName.toLowerCase() === name.toLowerCase()) {
      console.log(`Name matches payer: ${name} - returning payer info`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          isPayer: true,
          payerId: bill.payerId,
          payerName: bill.payerName,
          billId,
        }),
      };
    }

    // Check if participant with this name already exists
    const existingParticipants = bill.participants || [];
    const existingParticipant = existingParticipants.find(
      (p: any) => p.name.toLowerCase() === name.toLowerCase()
    );

    if (existingParticipant) {
      console.log(`Participant rejoined: ${name} (ID: ${existingParticipant.id})`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          participant: existingParticipant,
          isReturning: true,
          isPayer: false,
        }),
      };
    }

    // Create new participant
    const participantId = randomUUID();
    const participant = {
      id: participantId,
      billId,
      name: name.trim(),
      joinedAt: new Date().toISOString(),
    };

    // Add participant to bill
    const updatedParticipants = [...existingParticipants, participant];

    await docClient.send(new UpdateCommand({
      TableName: BILLS_TABLE,
      Key: { billId },
      UpdateExpression: 'SET participants = :participants, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':participants': updatedParticipants,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    console.log(`Created new participant: ${name} (ID: ${participantId})`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        participant,
        isReturning: false,
        isPayer: false,
      }),
    };
  } catch (error) {
    console.error('Error creating participant:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to create participant' }),
    };
  }
};
