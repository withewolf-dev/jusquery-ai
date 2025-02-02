import { MongoClient } from 'mongodb';
import { DatabaseConfig, DatabaseSchema, CollectionSchema, FieldInfo } from '../types/schema.types';

class SchemaService {
  private async getFieldType(value: any): Promise<FieldInfo> {
    if (value === null) return { type: 'null' };
    
    if (Array.isArray(value)) {
      const itemType = value.length > 0 
        ? await this.getFieldType(value[0])
        : { type: 'unknown' };
      return {
        type: 'array',
        items: itemType
      };
    }
    
    if (typeof value === 'object') {
      if (value instanceof Date) return { type: 'date' };
      
      const properties: { [key: string]: FieldInfo } = {};
      for (const [key, val] of Object.entries(value)) {
        properties[key] = await this.getFieldType(val);
      }
      return {
        type: 'object',
        properties
      };
    }
    
    return { type: typeof value };
  }

  private async analyzeCollection(
    collection: any,
    collectionName: string
  ): Promise<CollectionSchema> {
    const sampleSize = 100;
    const documents = await collection.find().limit(sampleSize).toArray();
    const totalDocuments = await collection.countDocuments();
    
    const fields: { [key: string]: Set<string> } = {};
    const fieldTypes: { [key: string]: FieldInfo } = {};

    // Analyze each document
    for (const doc of documents) {
      for (const [key, value] of Object.entries(doc)) {
        if (key === '_id') continue;
        
        if (!fields[key]) {
          fields[key] = new Set();
        }
        
        const fieldType = await this.getFieldType(value);
        fields[key].add(fieldType.type);
        
        if (!fieldTypes[key]) {
          fieldTypes[key] = fieldType;
        }
      }
    }

    // Convert field information
    const schemaFields: { [key: string]: FieldInfo } = {};
    for (const [key, types] of Object.entries(fields)) {
      schemaFields[key] = {
        ...fieldTypes[key],
        required: documents.every((doc: any) => doc[key] !== undefined)
      };
    }

    return {
      collectionName,
      fields: schemaFields,
      totalDocuments
    };
  }

  async analyzeDatabase(config: DatabaseConfig): Promise<DatabaseSchema> {
    const client = new MongoClient(config.uri);
    
    try {
      await client.connect();
      const db = client.db();
      const collections = await db.listCollections().toArray();
      
      const collectionSchemas: CollectionSchema[] = [];
      
      for (const collection of collections) {
        const collectionObj = db.collection(collection.name);
        const schema = await this.analyzeCollection(collectionObj, collection.name);
        collectionSchemas.push(schema);
      }

      return {
        databaseName: db.databaseName,
        collections: collectionSchemas
      };
    } finally {
      await client.close();
    }
  }
}

export default new SchemaService(); 