import { Request, Response } from 'express';
import schemaService from '../services/schema.service';
import { DatabaseConfig } from '../types/schema.types';
import * as fs from 'fs/promises';
import path from 'path';

class SchemaController {
  private analysisPath: string;

  constructor() {
    this.analysisPath = path.join(__dirname, '../../data/schema_analysis.json');
    // Bind methods to this instance
    this.analyzeDatabase = this.analyzeDatabase.bind(this);
    this.getSavedAnalysis = this.getSavedAnalysis.bind(this);
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
}

// Create a single instance with proper binding
const schemaController = new SchemaController();
export default schemaController; 