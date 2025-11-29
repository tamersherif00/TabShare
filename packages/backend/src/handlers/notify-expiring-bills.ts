import { Handler } from 'aws-lambda';

export const handler: Handler = async () => {
  console.log('Notify expiring bills handler - not implemented yet');
  return { statusCode: 200, body: 'OK' };
};
