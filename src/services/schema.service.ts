import { MongoClient } from 'mongodb';
import { DatabaseConfig, DatabaseSchema, CollectionSchema, FieldInfo } from '../types/schema.types';
import aiService from './ai.service';
import { ObjectId } from 'mongodb';

class SchemaService {
  private async getFieldType(value: any): Promise<FieldInfo> {
    if (value === null) return { type: 'null' };
    
    // Improved ObjectId detection
    if (
      value instanceof ObjectId || 
      (value && typeof value === 'object' && 'buffer' in value && Array.isArray(value.buffer) && value.buffer.length === 12) ||
      (value && typeof value === 'object' && value._bsontype === 'ObjectID')
    ) {
      return { type: 'ObjectId' };
    }
    
    if (Array.isArray(value)) {
      // Check if array contains only strings and could be an enum
      if (value.length > 0 && value.every(item => typeof item === 'string')) {
        const uniqueValues = new Set(value);
        // If array has a small set of unique string values, treat it as enum
        if (uniqueValues.size < value.length && uniqueValues.size <= 10) {
          return {
            type: 'enum',
            values: Array.from(uniqueValues)
          };
        }
      }

      const itemType = value.length > 0 
        ? await this.getFieldType(value[0])
        : { type: 'unknown' as const };
      return {
        type: 'array',
        items: itemType
      };
    }
    
    if (typeof value === 'object') {
      if (value instanceof Date) return { type: 'date' };
      if (value instanceof Buffer) return { type: 'binary' };
      
      // Skip processing if it's an ObjectId's internal structure
      if ('buffer' in value && Array.isArray(value.buffer) && value.buffer.length === 12) {
        return { type: 'ObjectId' };
      }
      
      const properties: { [key: string]: FieldInfo } = {};
      for (const [key, val] of Object.entries(value)) {
        // Skip buffer properties of ObjectIds
        if (key === 'buffer' && Array.isArray(val) && val.length === 12) continue;
        properties[key] = await this.getFieldType(val);
      }
      return {
        type: 'object',
        properties
      };
    }

    // Map JavaScript types to our FieldInfo types
    switch (typeof value) {
      case 'string': return { type: 'string' };
      case 'number': return { type: 'number' };
      case 'boolean': return { type: 'boolean' };
      default: return { type: 'unknown' };
    }
  }

  private async analyzeCollection(
    collection: any,
    collectionName: string
  ): Promise<CollectionSchema> {
    // First try to get Mongoose schema if available
    try {
      const mongoose = require('mongoose');
      const model = mongoose.models[collectionName];
      if (model) {
        const mongooseSchema = model.schema;
        return this.convertMongooseSchema(mongooseSchema, collectionName);
      }
    } catch (e) {
      // Mongoose not available or model not found, continue to next method
    }

    // Then try to get MongoDB schema validation
    try {
      const options = await collection.options();
      if (options.validator?.$jsonSchema) {
        return this.convertJsonSchema(options.validator.$jsonSchema, collectionName);
      }
    } catch (e) {
      // No schema validation found, continue to sampling method
    }

    // Fall back to sampling method if no schema definitions found
    return this.analyzeCollectionBySampling(collection, collectionName);
  }
  private convertMongooseSchema(mongooseSchema: any, collectionName: string): CollectionSchema {
    // This method converts a Mongoose schema into our CollectionSchema format
    // It takes a Mongoose schema object and collection name as input
    // and returns a CollectionSchema with field definitions
    
    // Initialize empty fields object to store the converted schema fields
    const fields: { [key: string]: FieldInfo } = {};
    
    // Iterate through each path (field) in the Mongoose schema
    for (const [key, path] of Object.entries(mongooseSchema.paths)) {
      // Skip the _id field since it's automatically added by MongoDB
      if (key === '_id') continue;
      
      // Convert each Mongoose path to our FieldInfo format using processMongoosePath
      fields[key] = this.processMongoosePath(path);
    }

    // Return the converted schema with collection name, fields
    // and a placeholder for total documents count
    return {
      collectionName,
      fields,
      totalDocuments: 0 // This could be populated by querying the actual count
    };
  }

  private processMongoosePath(path: any): FieldInfo {
    const instance = path.instance?.toLowerCase();
    
    // Handle arrays
    if (instance === 'array') {
      return {
        type: 'array',
        items: path.caster ? this.processMongoosePath(path.caster) : { type: 'unknown' },
        required: path.isRequired || false
      };
    }

    // Handle subdocuments
    if (instance === 'embedded' || path.schema) {
      const subFields: { [key: string]: FieldInfo } = {};
      const subSchema = path.schema;
      
      for (const [subKey, subPath] of Object.entries(subSchema.paths)) {
        if (subKey === '_id') continue;
        subFields[subKey] = this.processMongoosePath(subPath);
      }

      return {
        type: 'object',
        properties: subFields,
        required: path.isRequired || false
      };
    }

    // Handle maps
    if (instance === 'map') {
      return {
        type: 'object',
        properties: {},
        additionalProperties: this.processMongoosePath(path.$__schemaType),
        required: path.isRequired || false
      };
    }

    // Handle basic types
    return {
      type: this.getMongooseType(path),
      required: path.isRequired || false
    };
  }

  private convertJsonSchema(jsonSchema: any, collectionName: string): CollectionSchema {
    const fields: { [key: string]: FieldInfo } = {};
    
    for (const [key, definition] of Object.entries(jsonSchema.properties || {})) {
      if (key === '_id') continue;
      fields[key] = this.processJsonSchemaDefinition(
        definition, 
        (jsonSchema.required || []).includes(key)
      );
    }

    return {
      collectionName,
      fields,
      totalDocuments: 0
    };
  }

  private processJsonSchemaDefinition(definition: any, isRequired: boolean): FieldInfo {
    // Handle arrays
    if (definition.type === 'array') {
      return {
        type: 'array',
        items: definition.items ? 
          this.processJsonSchemaDefinition(definition.items, false) : 
          { type: 'unknown' },
        required: isRequired
      };
    }

    // Handle objects/subdocuments
    if (definition.type === 'object') {
      const properties: { [key: string]: FieldInfo } = {};
      
      for (const [key, prop] of Object.entries(definition.properties || {})) {
        properties[key] = this.processJsonSchemaDefinition(
          prop,
          (definition.required || []).includes(key)
        );
      }

      return {
        type: 'object',
        properties,
        required: isRequired,
        ...(definition.additionalProperties ? {
          additionalProperties: this.processJsonSchemaDefinition(definition.additionalProperties, false)
        } : {})
      };
    }

    // Handle basic types
    return {
      type: this.convertBsonType(definition.bsonType || definition.type),
      required: isRequired
    };
  }

  private getMongooseType(path: any): FieldInfo['type'] {
    const instance = path.instance?.toLowerCase();
    switch (instance) {
      case 'objectid': return 'ObjectId';
      case 'number': return 'number';
      case 'string': return 'string';
      case 'boolean': return 'boolean';
      case 'date': return 'date';
      case 'buffer': return 'binary';
      case 'array': return 'array';
      case 'map':
      case 'object': return 'object';
      default: return 'unknown';
    }
  }

  private convertBsonType(bsonType: string): FieldInfo['type'] {
    switch (bsonType) {
      case 'objectId': return 'ObjectId';
      case 'int':
      case 'long':
      case 'double':
      case 'decimal': return 'number';
      case 'string': return 'string';
      case 'bool': return 'boolean';
      case 'date': return 'date';
      case 'binData': return 'binary';
      case 'array': return 'array';
      case 'object': return 'object';
      default: return 'unknown';
    }
  }

  private async analyzeCollectionBySampling(
    collection: any,
    collectionName: string
  ): Promise<CollectionSchema> {
    const sampleSize = 100;
    const documents = await collection.find().limit(sampleSize).toArray();
    const totalDocuments = await collection.countDocuments();
    
    const fields: { [key: string]: Set<string> } = {};
    const fieldTypes: { [key: string]: FieldInfo } = {};
    const uniqueValues: { [key: string]: Set<any> } = {};

    // Helper function to process nested fields
    const processField = async (value: any, path: string[] = []): Promise<void> => {
      if (value === null || value === undefined) return;

      // Skip if this is an ObjectId's internal structure
      const isObjectIdLike = (
        value && 
        typeof value === 'object' && 
        'buffer' in value && 
        value.buffer instanceof Uint8Array && 
        value.buffer.byteLength === 12
      );

      if (isObjectIdLike) {
        const fieldPath = path.join('.');
        if (!fields[fieldPath]) {
          fields[fieldPath] = new Set();
          uniqueValues[fieldPath] = new Set();
        }
        fields[fieldPath].add('ObjectId');
        fieldTypes[fieldPath] = { type: 'ObjectId' };
        return;
      }

      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Process each field in the subdocument
        for (const [key, val] of Object.entries(value)) {
          // Skip buffer properties of ObjectIds
          if (key === 'buffer' && Array.isArray(val) && val.length === 12) continue;
          
          const newPath = [...path, key];
          const fieldPath = newPath.join('.');
          
          if (!fields[fieldPath]) {
            fields[fieldPath] = new Set();
            uniqueValues[fieldPath] = new Set();
          }
          
          const fieldType = await this.getFieldType(val);
          fields[fieldPath].add(fieldType.type);
          
          // Track unique values for string fields
          if (typeof val === 'string') {
            uniqueValues[fieldPath].add(val);
          }
          
          if (!fieldTypes[fieldPath]) {
            fieldTypes[fieldPath] = fieldType;
          }

          // Recursively process nested objects
          await processField(val, newPath);
        }
      } else if (Array.isArray(value) && value.length > 0) {
        // Process array items
        for (const item of value) {
          await processField(item, path);
        }
      }
    };

    // Analyze each document
    for (const doc of documents) {
      for (const [key, value] of Object.entries(doc)) {
        if (key === '_id') continue;
        
        if (!fields[key]) {
          fields[key] = new Set();
          uniqueValues[key] = new Set();
        }
        
        const fieldType = await this.getFieldType(value);
        fields[key].add(fieldType.type);
        
        // Track unique values for string fields
        if (typeof value === 'string') {
          uniqueValues[key].add(value);
        }
        
        if (!fieldTypes[key]) {
          fieldTypes[key] = fieldType;
        }

        // Process nested fields
        await processField(value, [key]);
      }
    }

    // Convert field information
    const schemaFields: { [key: string]: FieldInfo } = {};
    for (const [key, types] of Object.entries(fields)) {
      if (types.has('string') && uniqueValues[key]) {
        const values = Array.from(uniqueValues[key]);
        // If we have a reasonable number of unique values, treat it as an enum
        if (values.length <= 10 && values.length < documents.length * 0.5) {
          schemaFields[key] = {
            type: 'enum',
            values,
            required: documents.every((doc:any) => doc[key] !== undefined)
          };
          continue;
        }
      }

      schemaFields[key] = {
        ...fieldTypes[key],
        required: documents.every((doc:any) => doc[key] !== undefined)
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
      const collections = ['goals','ledger-files','payment-transactions','users','transactions','sips','goal-investors','payout-benificiaries'];
      //await db.listCollections().toArray();
      const collectionSchemas: CollectionSchema[] = [];
  
      for (const collection of collections) {
        const collectionObj = db.collection(collection);
        const schema = await this.analyzeCollection(collectionObj, collection);
  
        // Enrich fields dynamically using OpenAI
        console.log('Analyzing collection:', collection);
       const enrichedFields = await aiService.enrichFieldsWithOpenAI(schema.fields, collection);
       schema.fields = enrichedFields;
       console.log('Enriched fields:', schema.fields);
        collectionSchemas.push(schema);
        console.log('PUSHED');
      }
  
      return {
        databaseName: db.databaseName,
        collections: collectionSchemas
      };
    } finally {
      await client.close();
    }
  }
  

  // async analyzeDatabase(config: DatabaseConfig): Promise<DatabaseSchema> {
  //   const client = new MongoClient(config.uri);
    
  //   try {
  //     await client.connect();
  //     const db = client.db();
  //     const collections = await db.listCollections().toArray();
      
  //     const collectionSchemas: CollectionSchema[] = [];
      
  //     for (const collection of collections) {
  //       const collectionObj = db.collection(collection.name);
  //       const schema = await this.analyzeCollection(collectionObj, collection.name);
  //       collectionSchemas.push(schema);
  //     }

  //     return {
  //       databaseName: db.databaseName,
  //       collections: collectionSchemas
  //     };
  //   } finally {
  //     await client.close();
  //   }
  // }
}

export default new SchemaService(); 