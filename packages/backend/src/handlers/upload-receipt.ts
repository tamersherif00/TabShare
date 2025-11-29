import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { TextractService } from '../services/textract.service';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const textractService = new TextractService();

const BILLS_TABLE = process.env.BILLS_TABLE!;
const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { billId, receiptKey } = body;

    if (!billId || !receiptKey) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required fields: billId, receiptKey' }),
      };
    }

    // Get bill
    const billResult = await docClient.send(new GetCommand({
      TableName: BILLS_TABLE,
      Key: { billId },
    }));

    if (!billResult.Item) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Bill not found' }),
      };
    }

    // Get receipt from S3
    const s3Response = await s3Client.send(new GetObjectCommand({
      Bucket: RECEIPTS_BUCKET,
      Key: receiptKey,
    }));

    if (!s3Response.Body) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Receipt not found' }),
      };
    }

    // Analyze with Textract using S3 location
    const analysis = await textractService.analyzeReceipt(RECEIPTS_BUCKET, receiptKey);

    // Extract items and total
    const items = analysis.lineItems.map((item: any) => ({
      id: `item-${Date.now()}-${Math.random()}`,
      description: item.name,
      amount: item.price,
      quantity: 1,
      assignedTo: [],
    }));

    const total = analysis.total || items.reduce((sum: number, item: any) => sum + item.amount, 0);

    // Update bill with extracted data
    await docClient.send(new UpdateCommand({
      TableName: BILLS_TABLE,
      Key: { billId },
      UpdateExpression: 'SET #items = :items, #total = :total, receiptKey = :receiptKey, #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#items': 'items',
        '#total': 'total',
      },
      ExpressionAttributeValues: {
        ':items': items,
        ':total': total,
        ':receiptKey': receiptKey,
        ':status': 'processed',
        ':updatedAt': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        billId,
        items,
        total,
        merchant: analysis.vendorName || 'Receipt',
        date: analysis.receiptDate || new Date().toISOString().split('T')[0],
      }),
    };
  } catch (error) {
    console.error('Error processing receipt:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: 'Failed to process receipt',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};
