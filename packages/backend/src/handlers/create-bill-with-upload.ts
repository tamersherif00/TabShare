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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB - Textract sync API limit

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Received event headers:', JSON.stringify(event.headers));
    console.log('Received event body (first 200 chars):', event.body?.substring(0, 200));
    
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
      console.log('Parsed body:', body);
    } catch (parseError) {
      console.error('Failed to parse body as JSON:', parseError);
      console.error('Body content type:', event.headers['content-type'] || event.headers['Content-Type']);
      return {
        statusCode: 400,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid JSON in request body',
          details: parseError instanceof Error ? parseError.message : 'Unknown error'
        }),
      };
    }
    
    const { payerId, payerName, fileType = 'image/jpeg', fileSize } = body;

    // Validate file size
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return {
        statusCode: 400,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'File size exceeds 5MB limit',
          maxSize: MAX_FILE_SIZE,
          receivedSize: fileSize,
        }),
      };
    }

    if (!payerId || !payerName) {
      return {
        statusCode: 400,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing required fields: payerId, payerName' }),
      };
    }

    const billId = randomUUID();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    // Generate S3 key for receipt
    const receiptKey = `receipts/${billId}/${randomUUID()}.jpg`;

    // Generate presigned URL for direct upload
    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: RECEIPTS_BUCKET,
        Key: receiptKey,
        ContentType: fileType,
      }),
      { expiresIn: 900 } // 15 minutes - increased for large files
    );

    // Create bill record
    const bill = {
      billId,
      payerId,
      payerName,
      description: 'Receipt',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ttl,
      items: [],
      participants: [],
      total: 0,
      receiptKey,
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
        uploadUrl,
        receiptKey,
      }),
    };
  } catch (error) {
    console.error('Error creating bill:', error);
    return {
      statusCode: 500,
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Failed to create bill',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};
