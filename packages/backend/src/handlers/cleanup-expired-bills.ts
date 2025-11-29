import { Handler } from 'aws-lambda';

export const handler: Handler = async () => {
  console.log('Cleanup expired bills handler - not implemented yet');
  return { statusCode: 200, body: 'OK' };
};
