import { OpenAI } from 'openai';
import { DatabaseSchema } from '../types/schema.types';
import { DatabaseContext, QueryResult, QueryIntent } from '../types/ai.types';
import * as fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { executeMongoQuery } from '../helpers/mongo.helper';
import { generateAIResponse } from '../helpers/ai.helper';
import { parseMongoQuery } from '../helpers/query.helper';

// Ensure environment variables are loaded
dotenv.config();

class AIService {
  private openai: OpenAI;
  private contextPath: string;
  private schemaPath: string;
  private analysisPath: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    this.openai = new OpenAI({
      apiKey
    });

    this.contextPath = path.join(__dirname, '../../data/context.json');
    this.schemaPath = path.join(__dirname, '../../data/schema.json');
    this.analysisPath = path.join(__dirname, '../../data/schema_analysis.json');
  }

  private async loadSchemaAnalysis(): Promise<DatabaseSchema | null> {
    try {
      const data = await fs.readFile(this.analysisPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async saveSchema(schema: DatabaseSchema): Promise<void> {
    await fs.mkdir(path.dirname(this.schemaPath), { recursive: true });
    await fs.writeFile(this.schemaPath, JSON.stringify(schema, null, 2));
  }

  async generateContext(schema: DatabaseSchema): Promise<DatabaseContext> {
    const savedAnalysis = await this.loadSchemaAnalysis();
    const schemaToUse = savedAnalysis || schema;
    const systemPrompt = `
    You are a MongoDB schema expert and an AI assistant skilled in analyzing and summarizing complex database structures.
    Your goal is to transform a large MongoDB schema into a summarized, structured context suitable for generating accurate queries and understanding relationships between collections.
    Ensure that your response is concise, structured as JSON, and follows the specified format.
    
    Focus on:
    1. Extracting collection names and their primary fields.
    2. Identifying relationships between collections.
    3. Providing a high-level description of the database.
    4. Ignoring unnecessary sample data or deeply nested objects.
    
    Format your response like this:
    
    {
      "overallDatabaseDescription": "High-level overview of what the database is used for.",
      "collections": [
        {
          "name": "collection_name",
          "fields": ["field_name (data_type)", "field_name (data_type)"],
          "relationships": ["Describe how this collection relates to others, e.g., field_name links to another_collection.field_name"]
        }
      ]
    }
    `;
    
    const userPrompt =  `
    Analyze the following MongoDB schema and generate a summarized context according to the specified format:
    ${JSON.stringify(schemaToUse, null, 2)}
    `;
    

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
    }).catch(error => {
      console.error('Error generating context:', error);
      throw error;
    });

    const context: DatabaseContext = JSON.parse(completion.choices[0].message.content || '{}');
    await fs.mkdir(path.dirname(this.contextPath), { recursive: true });
    await fs.writeFile(this.contextPath, JSON.stringify(context, null, 2));
    
    return context;
  }

  async generateMongoQuery(query: string): Promise<QueryResult> {
    try {
      const context = JSON.parse(await fs.readFile(this.contextPath, 'utf-8'));
      const savedAnalysis = await this.loadSchemaAnalysis();
      const schema = savedAnalysis || JSON.parse(await fs.readFile(this.schemaPath, 'utf-8'));

      // First, analyze if we can proceed with the query
      // const analysis = await analyzeQueryRequirements(query, context, schema);
      
      // if (!analysis.canProceed) {
      //   return {
      //     mongoQuery: '',
      //     explanation: analysis.reasoning,
      //     results: [],
      //     needsClarification: true,
      //     clarificationMessage: analysis.suggestedClarification
      //   };
      // }

      // If we can proceed, generate the query
      const response = await generateAIResponse(query);
      console.log('generateAIResponse()->:', response);
      // const { collectionName, operation, params } = parseMongoQuery(response.mongoQuery);
      // const results = await executeMongoQuery(collectionName, operation, params);

      return {
        mongoQuery: response.mongoQuery,
        explanation: response.explanation,
        // results,
        needsClarification: false
      };
    } catch (error) {
      console.error('Query execution error:', error);
      return {
        mongoQuery: '',
        explanation: 'Query execution failed: ' + (error instanceof Error ? error.message : String(error)),
       // results: [],
        needsClarification: false
      };
    }
  }

  

  async testOpenAI(): Promise<any> {
    const systemPrompt = `The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format. 

EXAMPLE INPUT: 
Which is the highest mountain in the world? Mount Everest.

EXAMPLE JSON OUTPUT:
{
    "question": "Which is the highest mountain in the world?",
    "answer": "Mount Everest"
}`;

    const userPrompt = "Which is the longest river in the world? The Nile River.";

    try {
      console.log('Making test API call to OpenAI...');
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });

      console.log('Raw API Response:', completion);
      
      if (!completion.choices[0]?.message?.content) {
        throw new Error('Empty response from OpenAI API');
      }

      const content = completion.choices[0].message.content;
      console.log('Response content:', content);
      
      return JSON.parse(content);
    } catch (error: any) {
      console.error('OpenAI Test Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw new Error(`OpenAI test failed: ${error.message}`);
    }
  }

  async  enrichFieldsWithOpenAI(fields: any, collectionName: string) {
    const systemPrompt = `
      You are a MongoDB schema analysis expert. Your task is to analyze database fields and provide:
      1. Semantic Meaning: A concise, database-agnostic description of what each field represents, based on its name, data type, and structure.
      2. Importance (1-10): A numeric score representing how critical the field might be for querying, filtering, or data analysis.
      3. Tags: A set of generic, descriptive tags that categorize the field (e.g., "identifier", "status", "financial", "metadata", "user_info", "transaction_data").
  
      Ensure the output is strictly valid JSON following the provided format.
    `;
  
    const userPrompt = `
      Analyze the following fields in the "${collectionName}" collection:
      ${JSON.stringify(fields, null, 2)}
  
      For each field, return:
      - field: Name of the field
      - semanticMeaning: A concise description of the field's purpose
      - importance: A numeric value between 1-10 representing the field's importance
      - tags: Relevant tags as an array
  
      Format the response as a JSON array like:
      [
        {
          "field": "status",
          "semanticMeaning": "Indicates the current state of a record",
          "importance": 9,
          "tags": ["status", "record_state", "workflow"]
        },
        {
          "field": "amount",
          "semanticMeaning": "Represents a monetary value",
          "importance": 8,
          "tags": ["financial", "currency", "transaction_value"]
        }
      ]
    `;
  
    const functions = [
      {
        name: "enrichField",
        description: "Enriches fields with semantic meaning, importance, and tags.",
        parameters: {
          type: "object",
          properties: {
            enrichedFields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  semanticMeaning: { type: "string" },
                  importance: { type: "integer", minimum: 1, maximum: 10 },
                  tags: { type: "array", items: { type: "string" } }
                },
                required: ["field", "semanticMeaning", "importance", "tags"]
              }
            }
          },
          required: ["enrichedFields"]
        }
      }
    ];
  
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        functions,
        function_call: { name: "enrichField" },
        temperature: 0.3
      });
  
      return completion.choices[0]?.message?.function_call?.arguments
        ? JSON.parse(completion.choices[0].message.function_call.arguments).enrichedFields
        : [];
  
    } catch (error: unknown) {
      console.error('Error enriching fields:', error);
  
      // Type checking to handle errors safely
      if (error instanceof Error) {
        try {
          const fallbackResponse = (error as any).response?.data?.choices?.[0]?.message?.content;
  
          if (fallbackResponse) {
            const fixedContent = fallbackResponse
              .replace(/(\w+):/g, '"$1":')    // Add quotes around property names
              .replace(/,\s*}/g, '}')         // Remove trailing commas
              .replace(/,\s*]/g, ']');        // Fix arrays
  
            return JSON.parse(fixedContent);
          }
        } catch (fallbackError) {
          console.error('Failed to fix JSON:', fallbackError);
          throw fallbackError;
        }
      }
  
      throw error; // Re-throw if not an instance of Error
    }
  }  
  
}

// Create instance only if environment variables are properly loaded
let aiService: AIService;
try {
  aiService = new AIService();
} catch (error) {
  console.error('Failed to initialize AIService:', error);
  throw error;
}

export default aiService; 