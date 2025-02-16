export interface DatabaseConfig {
  uri: string;
}

export interface FieldInfo {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'date' | 'binary' | 'ObjectId' | 'enum' | 'unknown';
  required?: boolean;
  items?: FieldInfo;  // For array types
  properties?: { [key: string]: FieldInfo };  // For object types
  additionalProperties?: FieldInfo;  // For maps/dynamic objects
  values?: string[];  // For enum types
}

export interface CollectionSchema {
  collectionName: string;
  fields: { [key: string]: FieldInfo };
  totalDocuments: number;
}

export interface DatabaseSchema {
  databaseName: string;
  collections: CollectionSchema[];
} 