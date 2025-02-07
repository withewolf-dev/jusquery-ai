import { MongoClient } from 'mongodb';
import { DatabaseConfig, DatabaseSchema, CollectionSchema, FieldInfo } from '../types/schema.types';
import aiService from './ai.service';

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
    const fields: { [key: string]: FieldInfo } = {};
    
    for (const [key, path] of Object.entries(mongooseSchema.paths)) {
      if (key === '_id') continue;
      
      fields[key] = this.processMongoosePath(path);
    }

    return {
      collectionName,
      fields,
      totalDocuments: 0 // You might want to still get this count
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

  private getMongooseType(path: any): string {
    const instance = path.instance?.toLowerCase();
    switch (instance) {
      case 'objectid': return 'string';
      case 'number': return 'number';
      case 'string': return 'string';
      case 'boolean': return 'boolean';
      case 'date': return 'date';
      case 'buffer': return 'binary';
      case 'mixed': return 'mixed';
      case 'array': return 'array';
      case 'map':
      case 'object': return 'object';
      default: return 'unknown';
    }
  }

  private convertBsonType(bsonType: string): string {
    switch (bsonType) {
      case 'objectId': return 'string';
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

    // Helper function to process nested fields
    const processField = async (value: any, path: string[] = []): Promise<void> => {
      if (value === null || value === undefined) return;

      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Process each field in the subdocument
        for (const [key, val] of Object.entries(value)) {
          const newPath = [...path, key];
          const fieldPath = newPath.join('.');
          
          if (!fields[fieldPath]) {
            fields[fieldPath] = new Set();
          }
          
          const fieldType = await this.getFieldType(val);
          fields[fieldPath].add(fieldType.type);
          
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
        }
        
        const fieldType = await this.getFieldType(value);
        fields[key].add(fieldType.type);
        
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
      schemaFields[key] = {
        ...fieldTypes[key],
        required: documents.every((doc: any) => {
          const parts = key.split('.');
          let value = doc;
          for (const part of parts) {
            if (value === undefined || value === null) return false;
            value = value[part];
          }
          return value !== undefined;
        })
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
  
        // Enrich fields dynamically using OpenAI
        console.log('Analyzing collection:', collection.name);
       const enrichedFields = await aiService.enrichFieldsWithOpenAI(schema.fields, collection.name);
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