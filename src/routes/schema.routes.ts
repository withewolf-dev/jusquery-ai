import { Router, Request, Response } from 'express';
import schemaController from '../controllers/schema.controller';

const router = Router();

// POST /api/schema/analyze - Analyze database schema
router.post('/analyze', (req: Request, res: Response) => schemaController.analyzeDatabase(req, res));

// POST /api/schema/generate-context - Generate schema context using ChatGPT
router.post('/generate-context', (req: Request, res: Response) => schemaController.generateSchemaContext(req, res));

export default router; 