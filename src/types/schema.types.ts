export interface DatabaseConfig {
  uri: string;
}

export interface FieldInfo {
  type: string;
  required?: boolean;
  items?: FieldInfo;  // For array types
  properties?: { [key: string]: FieldInfo };  // For object types
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