import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const BILLS_TABLE = process.env.BILLS_TABLE!;
const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { payerId, payerName, description } = body;

    if (!payerId || !payerName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required fields: payerId, payerName' }),
      };
    }

    const billId = randomUUID();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    // Create bill record
    const bill = {
      billId,
      payerId,
      payerName,
      description: description || '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ttl,
      items: [],
      participants: [],
      total: 0,
    };

    await docClient.send(new PutCommand({
      TableName: BILLS_TABLE,
      Item: bill,
    }));

    // Generate presigned URL for receipt upload
    const receiptKey = `receipts/${billId}/${randomUUID()}`;
    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: RECEIPTS_BUCKET,
        Key: receiptKey,
        ContentType: 'image/*',
      }),
      { expiresIn: 3600 }
    );

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        bill: {
          id: billId,
          ...bill,
        },
        uploadUrl,
        receiptKey,
      }),
    };
  } catch (error) {
    console.error('Error creating bill:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to create bill' }),
    };
  }
};
