export interface DatabaseContext {
  schemaDescription: string;
  relationships: string[];
  sampleQueries: string[];
  collections: {
    name: string;
    description: string;
    fields: {
      name: string;
      type: string;
      description: string;
    }[];
  }[];
}

export interface NLQueryRequest {
  query: string;
}

export interface QueryResult {
  mongoQuery: string;
  explanation: string;
  results: any[];
} 