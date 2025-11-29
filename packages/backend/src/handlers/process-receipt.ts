import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { TextractService } from '../services/textract.service';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const textractService = new TextractService();

const BILLS_TABLE = process.env.BILLS_TABLE!;
const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET!;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB - Textract sync API limit

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { billId, receiptKey } = body;

    if (!billId || !receiptKey) {
      return {
        statusCode: 400,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing required fields: billId, receiptKey' }),
      };
    }

    console.log(`Processing receipt for bill ${billId}: ${receiptKey}`);

    // Wait for S3 consistency and verify file exists
    let fileExists = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!fileExists && attempts < maxAttempts) {
      try {
        const headResult = await s3Client.send(new HeadObjectCommand({
          Bucket: RECEIPTS_BUCKET,
          Key: receiptKey,
        }));
        
        // Verify file size
        const fileSize = headResult.ContentLength || 0;
        if (fileSize > MAX_FILE_SIZE) {
          console.error(`File too large: ${fileSize} bytes (max: ${MAX_FILE_SIZE})`);
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
        
        fileExists = true;
        console.log(`File verified in S3: ${receiptKey}, size: ${fileSize} bytes`);
      } catch (error: any) {
        if (error.name === 'NotFound' && attempts < maxAttempts - 1) {
          attempts++;
          const delay = 1000 * attempts; // 1s, 2s, 3s, 4s, 5s
          console.log(`File not yet available, waiting ${delay}ms (attempt ${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (error.name === 'NotFound') {
          console.error(`File not found after ${maxAttempts} attempts: ${receiptKey}`);
          return {
            statusCode: 404,
            headers: { 
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              error: 'Receipt file not found in S3',
              billId,
              receiptKey,
            }),
          };
        } else {
          throw error;
        }
      }
    }

    // Analyze with Textract
    let items: any[] = [];
    let total = 0;
    let merchant = '';
    let date = '';
    let analysis: any = null;

    try {
      console.log('🔍 Starting Textract analysis...');
      console.log(`📁 S3 Location: s3://${RECEIPTS_BUCKET}/${receiptKey}`);
      const textractStart = Date.now();
      
      analysis = await textractService.analyzeReceipt(RECEIPTS_BUCKET, receiptKey);
      
      const textractTime = Date.now() - textractStart;
      console.log(`✅ Textract analysis completed in ${textractTime}ms`);
      
      items = analysis.lineItems.map((item: any) => ({
        id: `item-${Date.now()}-${Math.random()}`,
        description: item.name,
        amount: item.price,
        quantity: 1,
        assignedTo: [],
      }));
      
      total = analysis.total || items.reduce((sum, item) => sum + item.amount, 0);
      merchant = analysis.vendorName || 'Receipt';
      date = analysis.receiptDate || new Date().toISOString().split('T')[0];
      
      console.log(`✅ Textract extraction summary:`);
      console.log(`   📝 Items found: ${items.length}`);
      console.log(`   💰 Total: $${total.toFixed(2)}`);
      console.log(`   🏪 Merchant: ${merchant}`);
      console.log(`   📅 Date: ${date}`);
      console.log(`   📊 Confidence: ${analysis.confidence}%`);
      if (analysis.tax) console.log(`   💵 Tax: $${analysis.tax.toFixed(2)}`);
      if (analysis.tip) console.log(`   💸 Tip: $${analysis.tip.toFixed(2)}`);
      if (analysis.serviceCharge) console.log(`   🔧 Service Charge: $${analysis.serviceCharge.toFixed(2)}`);
    } catch (error) {
      console.error('Textract analysis failed:', error);
      
      // Update bill with error status
      await docClient.send(new UpdateCommand({
        TableName: BILLS_TABLE,
        Key: { billId },
        UpdateExpression: 'SET #status = :status, textractError = :error, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'textract_failed',
          ':error': error instanceof Error ? error.message : 'Unknown error',
          ':updatedAt': new Date().toISOString(),
        },
      }));
      
      // Return error response (still 200 since bill was created)
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          billId,
          items: [],
          total: 0,
          merchant: 'Receipt',
          date: new Date().toISOString().split('T')[0],
          textractFailed: true,
          error: 'Could not extract items from receipt. Please add items manually.',
          details: error instanceof Error ? error.message : 'Unknown error',
        }),
      };
    }

    // Build additionalFees array from service charge
    const additionalFees: any[] = [];
    if (analysis?.serviceCharge && analysis.serviceCharge > 0) {
      additionalFees.push({
        id: `fee-${Date.now()}`,
        description: 'Service Charge',
        amount: analysis.serviceCharge,
      });
    }

    // Update bill with extracted data
    await docClient.send(new UpdateCommand({
      TableName: BILLS_TABLE,
      Key: { billId },
      UpdateExpression: 'SET #items = :items, #total = :total, tax = :tax, extractedTax = :extractedTax, tip = :tip, extractedTip = :extractedTip, additionalFees = :additionalFees, merchant = :merchant, vendorName = :vendorName, #date = :date, receiptDate = :receiptDate, receiptTime = :receiptTime, numberOfGuests = :numberOfGuests, description = :description, #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#date': 'date',
        '#items': 'items',
        '#total': 'total',
      },
      ExpressionAttributeValues: {
        ':items': items,
        ':total': total,
        ':tax': analysis?.tax || 0,
        ':extractedTax': analysis?.tax || 0,
        ':tip': analysis?.tip || 0,
        ':extractedTip': analysis?.tip || 0,
        ':additionalFees': additionalFees,
        ':merchant': merchant,
        ':vendorName': merchant,
        ':date': date,
        ':receiptDate': analysis?.receiptDate || date,
        ':receiptTime': analysis?.receiptTime || null,
        ':numberOfGuests': analysis?.numberOfGuests || null,
        ':description': merchant,
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
        merchant,
        date,
      }),
    };
  } catch (error) {
    console.error('Error processing receipt:', error);
    return {
      statusCode: 500,
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Failed to process receipt',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};
