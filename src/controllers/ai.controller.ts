import { Request, Response } from 'express';
import aiService from '../services/ai.service';
import schemaController from '../controllers/schema.controller';
import { NLQueryRequest } from '../types/ai.types';
import * as fs from 'fs/promises';
import path from 'path';

class AIController {
  private analysisPath: string;

  constructor() {
    this.analysisPath = path.join(__dirname, '../../data/schema_analysis.json');
    this.generateContext = this.generateContext.bind(this);
    this.executeQuery = this.executeQuery.bind(this);
  }

  async generateContext(req: Request, res: Response) {
    try {
      // First try to read the saved schema analysis
      try {
        const analysisData = await fs.readFile(this.analysisPath, 'utf-8');
        const schema = JSON.parse(analysisData);

        // Generate and save context using the saved schema
        const context = await aiService.generateContext(schema);
        
        res.json({
          message: 'Context generated and saved succassaaessfully',
          context
        });
      } catch (readError) {
        console.error('Error reading schema analysis:', readError);
        res.status(500).json({
          error: 'Failed to read schema analysis',
          details: 'Please run /api/schema/analyze first to generate the schema analysis',
          path: this.analysisPath
        });
      }
    } catch (error: any) {
      console.error('Context generation error:', error);
      res.status(500).json({
        error: 'Failed to generate context',
        details: error.message,
        type: error.name
      });
    }
  }

  async executeQuery(req: Request, res: Response) {
    try {
      const { query, proceed } = req.body as { 
        query: string;
        proceed?: boolean;
      };
      
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const result = await aiService.generateMongoQuery(query);

      if (result.needsClarification && proceed === undefined) {
        return res.json({
          needsClarification: true,
          message: result.clarificationMessage,
          options: {
            proceed: true,
            cancel: false
          }
        });
      }

      if (proceed === false) {
        return res.json({
          message: 'Query cancelled as per user request',
          success: false
        });
      }

      return res.json(result);

    } catch (error: any) {
      console.error('Query execution error:', error);
      res.status(500).json({
        error: 'Failed to execute query',
        details: error.message
      });
    }
  }

  async testOpenAI(req: Request, res: Response) {
    try {
      const result = await aiService.testOpenAI();
      res.json({
        message: 'OpenAI API test successful',
        result
      });
    } catch (error: any) {
      console.error('OpenAI test error:', error);
      res.status(500).json({
        error: 'OpenAI API test failed',
        details: error.message
      });
    }
  }
}

export default new AIController(); 