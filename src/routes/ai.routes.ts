import { Router } from 'express';
import aiController from '../controllers/ai.controller';

const router = Router();

// POST /api/ai/context - Generate and save database context
router.post('/context', aiController.generateContext);

// POST /api/ai/query - Execute natural language query
router.post('/query', aiController.executeQuery);

// GET /api/ai/test - Test OpenAI API functionality

export default router; 