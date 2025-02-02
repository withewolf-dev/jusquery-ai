import { MongoClient } from 'mongodb';

export async function executeMongoQuery(collectionName: string, operation: string, params: any): Promise<any[]> {
  const client = new MongoClient(process.env.MONGODB_URI || '');
  try {
    await client.connect();
    const collection = client.db().collection(collectionName);

    let results: any[] = [];
    if (operation === 'aggregate') {
      results = await collection.aggregate(params).toArray();
    } else if (operation === 'find') {
      results = await collection.find(params).toArray();
    } else if (operation === 'findOne') {
      const result = await collection.findOne(params);
      results = result ? [result] : [];
    } else {
      throw new Error('Unsupported query operation');
    }

    return results;
  } finally {
    await client.close();
  }
} 