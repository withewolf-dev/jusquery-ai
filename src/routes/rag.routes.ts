import { Router } from 'express';
import { RAGController } from '../controllers/rag.controller';

const router = Router();
const ragController = new RAGController();

// Initialize RAG system with MongoDB connection
router.post('/initialize', ragController.initialize);

// Query the RAG system
router.post('/query', ragController.query);

// Delete all schemas from Pinecone
router.delete('/schemas', ragController.deleteSchemas);

export default router; 