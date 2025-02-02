import { Router } from 'express';
import schemaController from '../controllers/schema.controller';

const router = Router();

// POST /api/schema/analyze - Analyze database schema
router.post('/analyze', (req, res) => schemaController.analyzeDatabase(req, res));

export default router; 