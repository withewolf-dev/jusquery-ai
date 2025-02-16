import { Request, Response } from 'express';
import schemaService from '../services/schema.service';
import { DatabaseConfig } from '../types/schema.types';
import * as fs from 'fs/promises';
import path from 'path';
import { OpenAI } from 'openai';

class SchemaController {
  private analysisPath: string;
  private contextPath: string;

  constructor() {
    this.analysisPath = path.join(__dirname, '../../data/schema_analysis.json');
    this.contextPath = path.join(__dirname, '../../data/schema_context.json');
    // Bind methods to this instance
    this.analyzeDatabase = this.analyzeDatabase.bind(this);
    this.getSavedAnalysis = this.getSavedAnalysis.bind(this);
    this.generateSchemaContext = this.generateSchemaContext.bind(this);
  }

  async analyzeDatabase(req: Request, res: Response) {
    try {
      const config: DatabaseConfig = req.body;
      
      if (!config.uri) {
        return res.status(400).json({ 
          error: 'MongoDB URI is required' 
        });
      }

      const schema = await schemaService.analyzeDatabase(config);
      
      // Ensure the directory exists
      const dirPath = path.dirname(this.analysisPath);
      await fs.mkdir(dirPath, { recursive: true });

      // Save the analysis results
      await fs.writeFile(
        this.analysisPath,
        JSON.stringify(schema, null, 2),
        'utf-8'
      );

      res.json({
        message: 'Database schema analyzed and saved successfully',
        analysisPath: this.analysisPath,
        schema
      });
    } catch (error: any) {
      console.error('Schema analysis error:', error);
      res.status(500).json({ 
        error: 'Failed to analyze database schema',
        details: error.message,
        path: this.analysisPath // Add this for debugging
      });
    }
  }

  async getSavedAnalysis() {
    try {
      const data = await fs.readFile(this.analysisPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading saved analysis:', error);
      return null;
    }
  }

  async generateSchemaContext(req: Request, res: Response) {
    try {
      const analysis = await this.getSavedAnalysis();
      if (!analysis) {
        return res.status(404).json({
          error: 'No schema analysis found. Please run analyze endpoint first.'
        });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const systemPrompt = `
        The following JSON represents a MongoDB collection schema for a savings and investment app called Pluto Money. 
        In Pluto Money, users can invest in digital gold, silver, and savings goals, which ultimately get invested in digital gold. 
        The platform offers core features such as signup, signin, withdrawals, PAN verification, Aadhaar verification, and other related functionalities.

        Your task is to extend and elaborate the provided JSON schema by adding subdocuments, nested fields, and relationships wherever applicable. 
        The objective is to create a well-defined schema prompt that enables ChatGPT to generate accurate MongoDB queries without hallucinating new fields or misinterpreting relationships.

        Focus on:
        1. Expanding and clarifying subdocuments and nested fields
        2. Avoiding hallucination of new fields
        3. Ensuring precise interpretation for query generation
        4. Explaining relationships between collections

        Respond with a detailed analysis of the collection, including:
        1. Purpose and main use cases
        2. Key fields and their significance
        3. Relationships with other collections
        4. Common query patterns
        5. Important considerations for query generation
      `;

      let fullContext = '';
      
      // Process each collection
      for (const collection of analysis.collections) {
        console.log(collection);
        const collectionPrompt = `Analyze this collection schema:\n${JSON.stringify(collection, null, 2)}`;
        
        const completion = await openai.chat.completions.create({
          model: 'chatgpt-4o-latest',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: collectionPrompt }
          ],
          temperature: 0.2,
        });

        const collectionAnalysis = completion.choices[0].message.content;
        console.log(collectionAnalysis);
        
        fullContext += `\n\n=== Collection: ${collection.collectionName} ===\n${collectionAnalysis}`;
      }

      // Save the context
      await fs.writeFile(
        this.contextPath,
        JSON.stringify({ context: fullContext }, null, 2),
        'utf-8'
      );

      res.json({
        message: 'Schema context generated and saved successfully',
        contextPath: this.contextPath,
        context: fullContext
      });
    } catch (error: any) {
      console.error('Schema context generation error:', error);
      res.status(500).json({
        error: 'Failed to generate schema context',
        details: error.message
      });
    }
  }
}

// Create a single instance with proper binding
const schemaController = new SchemaController();
export default schemaController; 