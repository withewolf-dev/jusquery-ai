import { OpenAI } from 'openai';
import { DatabaseSchema } from '../types/schema.types';
import { DatabaseContext, QueryResult } from '../types/ai.types';
import { MongoClient } from 'mongodb';
import * as fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

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

    const prompt = `Analyze this MongoDB schema and generate a comprehensive context:
    ${JSON.stringify(schemaToUse, null, 2)}
    
    Generate a detailed analysis including:
    1. Overall database description
    2. Relationships between collections
    3. Purpose of each collection
    4. Description of important fields
    5. Sample queries that might be useful
    
    Format the response as a JSON object matching the DatabaseContext interface.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: "json_object" },
      messages: [{ role: 'user', content: prompt }],
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
    const context = JSON.parse(await fs.readFile(this.contextPath, 'utf-8'));
    const savedAnalysis = await this.loadSchemaAnalysis();
    const schema = savedAnalysis || JSON.parse(await fs.readFile(this.schemaPath, 'utf-8'));

    const prompt = `Given this database context and schema:
    Context: ${JSON.stringify(context, null, 2)}
    Schema: ${JSON.stringify(schema, null, 2)}

    Generate a MongoDB query for this natural language request: "${query}"
    
    Return a JSON object with:
    1. mongoQuery: the MongoDB query as a string
    2. explanation: explanation of how the query works
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: "json_object" },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    });
    const response = JSON.parse(completion.choices[0].message.content || '{}');
    console.log(response);
    const mongoUri = process.env.MONGODB_URI;
    const client = new MongoClient(mongoUri || '');
    try {
      await client.connect();
      const db = client.db();
      
      const queryStr = response.mongoQuery;
      
      // Updated regex to better handle collection names with hyphens
      const collectionMatch = queryStr.match(/db\.(['"]?)([^.'"\s]+)\1\.(aggregate|find|findOne|update|delete)/);
      
      if (!collectionMatch) {
        throw new Error('Invalid query format');
      }

      const [, , collectionName, operation] = collectionMatch;
     
      const collection = db.collection(collectionName);

      let results: any[] = [];  // Initialize as empty array
      if (operation === 'aggregate') {
        const pipelineMatch = queryStr.match(/aggregate\(([\s\S]*)\)/);
        if (!pipelineMatch) {
          throw new Error('Invalid aggregate query format');
        }
        const pipelineStr = pipelineMatch[1];
        console.log(pipelineStr, "pipelineStr");
        
        // Evaluate the pipeline string directly since it's already in valid array format
        const pipeline = eval(pipelineStr);
        console.log('Pipeline:', pipeline);
        results = await collection.aggregate(pipeline).toArray();
      } else if (operation === 'find' || operation === 'findOne') {
        const queryMatch = queryStr.match(/find(?:One)?\((.*)\)/);
        if (!queryMatch) {
          throw new Error('Invalid find query format');
        }
        const queryParams = queryMatch[1] ? JSON.parse(queryMatch[1]) : {};
        results = operation === 'find' 
          ? await collection.find(queryParams).toArray()
          : await collection.findOne(queryParams) ? [await collection.findOne(queryParams)] : [];
      } else {
        throw new Error('Unsupported query operation');
      }
      
      return {
        mongoQuery: response.mongoQuery,
        explanation: response.explanation,
        results
      };
    } catch (error) {
      console.error('Query execution error:', error);
      return {
        mongoQuery: '',
        explanation: 'Query execution failed: ' + (error instanceof Error ? error.message : String(error)),
        results: []
      };
    } finally {
      await client.close();
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