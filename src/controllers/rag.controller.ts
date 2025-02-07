import { Request, Response } from 'express';
import { RAGService } from '../services/rag.service';

export class RAGController {
    private ragService: RAGService;

    constructor() {
        this.ragService = new RAGService();
    }

    initialize = async (req: Request, res: Response) => {
        try {
            const { mongoUri } = req.body;
            if (!mongoUri) {
                return res.status(400).json({ error: 'MongoDB URI is required' });
            }

            await this.ragService.initialize(mongoUri);
            await this.ragService.analyzeAndStoreSchema();
            
            res.json({ message: 'RAG system initialized successfully' });
        } catch (error) {
            console.error('Error initializing RAG:', error);
            res.status(500).json({ error: 'Failed to initialize RAG system' });
        }
    };

    query = async (req: Request, res: Response) => {
        try {
            const { question, chatHistory = [], clarification } = req.body;
            if (!question) {
                return res.status(400).json({ error: 'Question is required' });
            }

            // If this is a clarification, append it to the chat history
            let updatedChatHistory = [...chatHistory];
            if (clarification) {
                // Add the original question and its response to history
                const lastQuestion = chatHistory.length > 0 
                    ? chatHistory[chatHistory.length - 1] 
                    : [question, "I need more information to help you better."];
                
                updatedChatHistory = [
                    ...chatHistory,
                    lastQuestion,
                    ["Clarification", clarification]
                ];
            }

            const response = await this.ragService.queryData(
                clarification || question,
                updatedChatHistory
            );

            res.json({
                ...response,
                chatHistory: updatedChatHistory
            });
        } catch (error) {
            console.error('Error querying RAG:', error);
            res.status(500).json({ error: 'Failed to process query' });
        }
    };

    deleteSchemas = async (req: Request, res: Response) => {
        try {
            await this.ragService.deleteAllSchemas();
            res.json({ message: 'Successfully deleted all schemas from Pinecone' });
        } catch (error) {
            console.error('Error deleting schemas:', error);
            res.status(500).json({ error: 'Failed to delete schemas' });
        }
    };
} 