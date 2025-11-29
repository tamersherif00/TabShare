import {
  TextractClient,
  AnalyzeExpenseCommand,
  GetExpenseAnalysisCommand,
  StartExpenseAnalysisCommand,
  ExpenseDocument,
  ExpenseField,
  LineItemGroup,
} from '@aws-sdk/client-textract';
import { ReceiptAnalysis, ExtractedLineItem, AnalysisStatus } from '../types/textract.js';

const CONFIDENCE_THRESHOLD = 50; // Lowered from 80 to capture more items

export class TextractService {
  private textractClient: TextractClient;

  constructor() {
    this.textractClient = new TextractClient({});
  }

  /**
   * Analyze a receipt image from bytes (for local testing without S3)
   * For synchronous processing of receipt images
   */
  async analyzeReceiptFromBytes(imageBytes: Buffer, retryCount: number = 0): Promise<ReceiptAnalysis> {
    const MAX_RETRIES = 3;
    
    try {
      const command = new AnalyzeExpenseCommand({
        Document: {
          Bytes: imageBytes,
        },
      });

      const response = await this.textractClient.send(command);
      return this.parseTextractResponse(response.ExpenseDocuments || []);
    } catch (error) {
      console.error(`Textract analysis failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
      
      // Check if error is retryable
      const isRetryable = this.isRetryableError(error);
      
      if (isRetryable && retryCount < MAX_RETRIES - 1) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.analyzeReceiptFromBytes(imageBytes, retryCount + 1);
      }
      
      throw new Error(`Failed to analyze receipt after ${retryCount + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze a receipt image using AWS Textract AnalyzeExpense API
   * For synchronous processing of receipts stored in S3
   * Implements retry logic for transient errors
   */
  async analyzeReceipt(s3Bucket: string, s3Key: string, retryCount: number = 0): Promise<ReceiptAnalysis> {
    const MAX_RETRIES = 3;
    
    try {
      const command = new AnalyzeExpenseCommand({
        Document: {
          S3Object: {
            Bucket: s3Bucket,
            Name: s3Key,
          },
        },
      });

      const response = await this.textractClient.send(command);
      return this.parseTextractResponse(response.ExpenseDocuments || []);
    } catch (error) {
      console.error(`Textract analysis failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
      
      // Check if error is retryable
      const isRetryable = this.isRetryableError(error);
      
      if (isRetryable && retryCount < MAX_RETRIES - 1) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.analyzeReceipt(s3Bucket, s3Key, retryCount + 1);
      }
      
      throw new Error(`Failed to analyze receipt after ${retryCount + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Retry on throttling errors
    if (error.name === 'ThrottlingException' || error.name === 'ProvisionedThroughputExceededException') {
      return true;
    }
    
    // Retry on service unavailable
    if (error.name === 'ServiceUnavailableException' || error.$metadata?.httpStatusCode === 503) {
      return true;
    }
    
    // Retry on internal server errors
    if (error.$metadata?.httpStatusCode >= 500) {
      return true;
    }
    
    return false;
  }

  /**
   * Start asynchronous expense analysis for larger documents
   * Implements retry logic for transient errors
   */
  async startExpenseAnalysis(s3Bucket: string, s3Key: string, retryCount: number = 0): Promise<string> {
    const MAX_RETRIES = 3;
    
    try {
      const command = new StartExpenseAnalysisCommand({
        DocumentLocation: {
          S3Object: {
            Bucket: s3Bucket,
            Name: s3Key,
          },
        },
      });

      const response = await this.textractClient.send(command);
      
      if (!response.JobId) {
        throw new Error('No JobId returned from Textract');
      }

      return response.JobId;
    } catch (error) {
      console.error(`Failed to start Textract job (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
      
      const isRetryable = this.isRetryableError(error);
      
      if (isRetryable && retryCount < MAX_RETRIES - 1) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.startExpenseAnalysis(s3Bucket, s3Key, retryCount + 1);
      }
      
      throw new Error(`Failed to start expense analysis after ${retryCount + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Poll the status of an asynchronous Textract job
   */
  async pollAnalysisStatus(jobId: string): Promise<AnalysisStatus> {
    try {
      const command = new GetExpenseAnalysisCommand({
        JobId: jobId,
      });

      const response = await this.textractClient.send(command);

      if (!response.JobStatus) {
        throw new Error('No job status returned from Textract');
      }

      if (response.JobStatus === 'SUCCEEDED') {
        const result = this.parseTextractResponse(response.ExpenseDocuments || []);
        return {
          status: 'SUCCEEDED',
          result,
        };
      } else if (response.JobStatus === 'FAILED') {
        return {
          status: 'FAILED',
          error: response.StatusMessage || 'Textract job failed',
        };
      } else {
        return {
          status: 'IN_PROGRESS',
        };
      }
    } catch (error) {
      console.error('Failed to poll Textract job status:', error);
      return {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse Textract ExpenseDocument response to extract line items, tax, tip, and totals
   */
  private parseTextractResponse(expenseDocuments: ExpenseDocument[]): ReceiptAnalysis {
    if (expenseDocuments.length === 0) {
      throw new Error('No expense documents found in Textract response');
    }

    const doc = expenseDocuments[0];
    console.log('📋 Textract returned', doc.LineItemGroups?.length || 0, 'line item groups');
    console.log('📋 Textract returned', doc.SummaryFields?.length || 0, 'summary fields');
    
    const lineItems: ExtractedLineItem[] = [];
    let tax = 0;
    let tip = 0;
    let subtotal = 0;
    let total = 0;
    let serviceCharge = 0;
    let stateGst = 0;
    let centralGst = 0;
    let overallConfidence = 0;
    let confidenceCount = 0;
    let vendorName: string | undefined;
    let receiptDate: string | undefined;
    let receiptTime: string | undefined;
    let numberOfGuests: number | undefined;

    // Extract summary fields (tax, tip, subtotal, total, service charge, GST, metadata)
    if (doc.SummaryFields) {
      console.log('📊 Processing summary fields:');
      for (const field of doc.SummaryFields) {
        const fieldType = this.getFieldType(field);
        const fieldText = field.Type?.Text || '';
        const fieldValue = this.getFieldValue(field);
        const confidence = this.getFieldConfidence(field);
        const valueText = field.ValueDetection?.Text || '';

        console.log(`  Summary: ${fieldType} = "${valueText}" (${fieldValue}) [confidence: ${confidence.toFixed(1)}%]`);

        // Extract metadata fields (lower confidence threshold for text fields)
        const metadataThreshold = 30;
        if (confidence >= metadataThreshold) {
          switch (fieldType?.toUpperCase()) {
            case 'VENDOR_NAME':
            case 'MERCHANT_NAME':
            case 'NAME':
              if (valueText && !vendorName) {
                vendorName = valueText;
                console.log(`  ✅ Found vendor name: ${valueText}`);
              }
              break;
            case 'INVOICE_RECEIPT_DATE':
            case 'DATE':
              if (valueText && !receiptDate) {
                receiptDate = valueText;
                console.log(`  ✅ Found receipt date: ${valueText}`);
              }
              break;
            case 'INVOICE_RECEIPT_TIME':
            case 'TIME':
              if (valueText && !receiptTime) {
                receiptTime = valueText;
                console.log(`  ✅ Found receipt time: ${valueText}`);
              }
              break;
            case 'NUMBER_OF_GUESTS':
            case 'PARTY_SIZE':
            case 'GUESTS':
            case 'COVERS':
              if (fieldValue !== null && !numberOfGuests) {
                numberOfGuests = fieldValue;
                console.log(`  ✅ Found number of guests: ${fieldValue}`);
              }
              break;
          }
        }

        if (confidence >= CONFIDENCE_THRESHOLD && fieldValue !== null) {
          // Check for service charge (SERC, Service Charge, etc.)
          if (fieldText.toLowerCase().includes('serc') || 
              fieldText.toLowerCase().includes('service') ||
              fieldType?.toUpperCase() === 'SERVICE_CHARGE') {
            serviceCharge = fieldValue;
            console.log(`  ✅ Found service charge: ${fieldValue}`);
            overallConfidence += confidence;
            confidenceCount++;
            continue;
          }

          // Check for State GST (also check valueText for the label)
          const fullText = (fieldText + ' ' + valueText).toLowerCase();
          if ((fullText.includes('state') && fullText.includes('gst')) ||
              (fieldText.toLowerCase().includes('state') && fieldText.toLowerCase().includes('gst'))) {
            stateGst = fieldValue;
            console.log(`  ✅ Found State GST: ${fieldValue}`);
            overallConfidence += confidence;
            confidenceCount++;
            continue;
          }

          // Check for Central GST (also check valueText for the label)
          if ((fullText.includes('central') && fullText.includes('gst')) ||
              (fieldText.toLowerCase().includes('central') && fieldText.toLowerCase().includes('gst')) ||
              (fullText.includes('cgst'))) {
            centralGst = fieldValue;
            console.log(`  ✅ Found Central GST: ${fieldValue}`);
            overallConfidence += confidence;
            confidenceCount++;
            continue;
          }
          
          // Check for SGST (State GST abbreviation)
          if (fullText.includes('sgst')) {
            stateGst = fieldValue;
            console.log(`  ✅ Found SGST (State GST): ${fieldValue}`);
            overallConfidence += confidence;
            confidenceCount++;
            continue;
          }

          switch (fieldType?.toUpperCase()) {
            case 'TAX':
            case 'SALES_TAX':
              // Only use if we haven't found GST separately
              if (stateGst === 0 && centralGst === 0) {
                tax = fieldValue;
              }
              overallConfidence += confidence;
              confidenceCount++;
              break;
            case 'TIP':
            case 'GRATUITY':
              tip = fieldValue;
              overallConfidence += confidence;
              confidenceCount++;
              break;
            case 'SUBTOTAL':
              subtotal = fieldValue;
              overallConfidence += confidence;
              confidenceCount++;
              break;
            case 'TOTAL':
            case 'AMOUNT_PAID':
              total = fieldValue;
              overallConfidence += confidence;
              confidenceCount++;
              break;
          }
        }
      }
    }

    // Combine GST into tax if found separately
    if (stateGst > 0 || centralGst > 0) {
      tax = stateGst + centralGst;
      console.log(`  💰 Combined GST: State ${stateGst} + Central ${centralGst} = ${tax}`);
    }

    // Extract line items
    if (doc.LineItemGroups) {
      for (const group of doc.LineItemGroups) {
        const extractedItems = this.extractLineItems(group);
        lineItems.push(...extractedItems);
        
        // Add to overall confidence calculation
        extractedItems.forEach(item => {
          overallConfidence += item.confidence;
          confidenceCount++;
        });
      }
    }

    // Calculate average confidence
    const avgConfidence = confidenceCount > 0 ? overallConfidence / confidenceCount : 0;

    // If subtotal wasn't extracted, calculate it from line items
    if (subtotal === 0 && lineItems.length > 0) {
      subtotal = lineItems.reduce((sum, item) => sum + item.price, 0);
    }

    // If total wasn't extracted, calculate it
    if (total === 0) {
      total = subtotal + tax + tip + serviceCharge;
    }

    console.log(`📊 Final totals: Subtotal=${subtotal}, Tax=${tax}, Tip=${tip}, Service=${serviceCharge}, Total=${total}`);
    console.log(`📋 Metadata: Vendor=${vendorName}, Date=${receiptDate}, Time=${receiptTime}, Guests=${numberOfGuests}`);

    return {
      lineItems,
      tax,
      tip,
      subtotal,
      total,
      serviceCharge,
      confidence: Math.round(avgConfidence),
      vendorName,
      receiptDate,
      receiptTime,
      numberOfGuests,
    };
  }

  /**
   * Extract line items from a LineItemGroup
   */
  private extractLineItems(group: LineItemGroup): ExtractedLineItem[] {
    const items: ExtractedLineItem[] = [];

    if (!group.LineItems) {
      return items;
    }

    for (const lineItem of group.LineItems) {
      if (!lineItem.LineItemExpenseFields) {
        continue;
      }

      let itemName = '';
      let itemPrice = 0;
      let itemConfidence = 0;
      let confidenceCount = 0;

      // First pass: collect all fields
      const fields = {
        name: '',
        price: 0,
        unitPrice: 0,
        expenseRow: 0,
        quantity: 1
      };

      for (const field of lineItem.LineItemExpenseFields) {
        const fieldType = this.getFieldType(field);
        const confidence = this.getFieldConfidence(field);
        const text = field.ValueDetection?.Text;

        // Log all fields for debugging
        console.log(`  Field: ${fieldType} = "${text}" (confidence: ${confidence.toFixed(1)}%)`);

        if (confidence < CONFIDENCE_THRESHOLD) {
          console.log(`    ⚠️ Skipped (confidence ${confidence.toFixed(1)}% < ${CONFIDENCE_THRESHOLD}%)`);
          continue;
        }

        const fieldValue = this.getFieldValue(field);

        switch (fieldType?.toUpperCase()) {
          case 'ITEM':
          case 'DESCRIPTION':
          case 'PRODUCT_CODE':
            if (text) {
              fields.name = text;
            }
            break;
          case 'QUANTITY':
          case 'QTY':
            if (fieldValue !== null && fieldValue > 0) {
              fields.quantity = fieldValue;
            }
            break;
          case 'PRICE':
            if (fieldValue !== null && fieldValue > 0) {
              fields.price = fieldValue;
            }
            break;
          case 'UNIT_PRICE':
            if (fieldValue !== null && fieldValue > 0) {
              fields.unitPrice = fieldValue;
            }
            break;
          case 'EXPENSE_ROW':
            if (fieldValue !== null && fieldValue > 0) {
              fields.expenseRow = fieldValue;
            }
            break;
        }
      }

      // Prioritize PRICE field, then UNIT_PRICE, then EXPENSE_ROW
      itemName = fields.name;
      itemPrice = fields.price || fields.unitPrice || fields.expenseRow;
      const quantity = fields.quantity || 1;
      
      if (itemName && itemPrice > 0) {
        itemConfidence = 100; // We found valid data
        confidenceCount = 1;
      }

      // Only add item if we have both name and price with sufficient confidence
      if (itemName && itemPrice > 0 && confidenceCount > 0) {
        // If quantity > 1, add it to the item name
        const displayName = quantity > 1 ? `${itemName} (x${quantity})` : itemName;
        
        items.push({
          name: displayName,
          price: itemPrice,
          confidence: Math.round(itemConfidence / confidenceCount),
        });
      }
    }

    return items;
  }

  /**
   * Get field type from ExpenseField
   */
  private getFieldType(field: ExpenseField): string | undefined {
    return field.Type?.Text;
  }

  /**
   * Get numeric value from ExpenseField
   */
  private getFieldValue(field: ExpenseField): number | null {
    const text = field.ValueDetection?.Text;
    if (!text) {
      return null;
    }

    // Remove currency symbols and commas
    const cleanedText = text.replace(/[$,]/g, '');
    const value = parseFloat(cleanedText);

    return isNaN(value) ? null : value;
  }

  /**
   * Get confidence score from ExpenseField
   */
  private getFieldConfidence(field: ExpenseField): number {
    return field.ValueDetection?.Confidence || 0;
  }
}
