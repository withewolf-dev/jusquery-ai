import { OpenAI } from 'openai';
import { DatabaseSchema } from '../types/schema.types';
import { DatabaseContext, QueryResult } from '../types/ai.types';
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
    try {
      // Get context and schema
      const context = JSON.parse(await fs.readFile(this.contextPath, 'utf-8'));
      const savedAnalysis = await this.loadSchemaAnalysis();
      const schema = savedAnalysis || JSON.parse(await fs.readFile(this.schemaPath, 'utf-8'));

      // Generate query using AI
      const response = await generateAIResponse(query, context, schema);
      
      // Parse the query
      const { collectionName, operation, params } = parseMongoQuery(response.mongoQuery);
      
      // Execute the query
      const results = await executeMongoQuery(collectionName, operation, params);

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