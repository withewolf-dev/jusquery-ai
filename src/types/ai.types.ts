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
  //results: any[];
  needsClarification: boolean;
  clarificationMessage?: string;
}

export interface ClarificationResponse {
  needsClarification: boolean;
  question?: string;
  options?: string[];
}

export interface QueryIntent {
  isAmbiguous: boolean;
  type?: 'regular-gold' | 'goal-gold';
  originalQuery: string;
} 