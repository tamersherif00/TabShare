import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const BILLS_TABLE = process.env.BILLS_TABLE!;
const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET!;

// Parse multipart form data properly handling binary data
function parseMultipartFormData(event: APIGatewayProxyEvent): { fields: Record<string, string>, files: Record<string, Buffer> } {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  
  if (!boundaryMatch || !event.body) {
    throw new Error('Invalid multipart form data');
  }

  const boundary = boundaryMatch[1];
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf-8');
  
  const fields: Record<string, string> = {};
  const files: Record<string, Buffer> = {};

  // Split by boundary
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = 0;
  
  while (true) {
    const index = body.indexOf(boundaryBuffer, start);
    if (index === -1) break;
    if (start > 0) {
      parts.push(body.slice(start, index));
    }
    start = index + boundaryBuffer.length;
  }

  for (const part of parts) {
    // Find the double CRLF that separates headers from content
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;

    const headers = part.slice(0, headerEnd).toString('utf-8');
    const content = part.slice(headerEnd + 4, part.length - 2); // Remove trailing CRLF

    const nameMatch = headers.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const isFile = headers.includes('filename=');

    if (isFile) {
      files[name] = content;
    } else {
      fields[name] = content.toString('utf-8');
    }
  }

  return { fields, files };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Parse multipart form data
    const { fields, files } = parseMultipartFormData(event);
    
    const { payerId, payerName } = fields;
    const receiptFile = files['receipt'];

    if (!payerId || !payerName || !receiptFile) {
      return {
        statusCode: 400,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing required fields: payerId, payerName, receipt' }),
      };
    }

    const billId = randomUUID();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    // Upload receipt to S3
    const receiptKey = `receipts/${billId}/${randomUUID()}.jpg`;
    await s3Client.send(new PutObjectCommand({
      Bucket: RECEIPTS_BUCKET,
      Key: receiptKey,
      Body: receiptFile,
      ContentType: 'image/jpeg',
    }));

    // Textract disabled - multipart form data parsing needs fixing
    // Users can manually add items through the UI
    const items: any[] = [];
    const total = 0;
    const merchant = 'Receipt';
    const date = new Date().toISOString().split('T')[0];

    // Create bill record
    const bill = {
      billId,
      payerId,
      payerName,
      description: merchant || 'Receipt',
      status: 'processed',
      createdAt: now,
      updatedAt: now,
      ttl,
      items,
      participants: [],
      total,
      receiptKey,
      merchant,
      date,
    };

    await docClient.send(new PutCommand({
      TableName: BILLS_TABLE,
      Item: bill,
    }));

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
      }),
    };
  } catch (error) {
    console.error('Error uploading bill:', error);
    return {
      statusCode: 500,
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Failed to upload bill',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};
