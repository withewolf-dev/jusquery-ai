import { MongoClient } from 'mongodb';
import { Pinecone } from '@pinecone-database/pinecone';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { VectorStore } from '@langchain/core/vectorstores';
import { ChatOpenAI } from '@langchain/openai';

interface SchemaRelationship {
    fromCollection: string;
    toCollection: string;
    throughField: string;
    relationType: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
    description: string;
}

interface EntityField {
    name: string;
    type: string;
    description: string;
    isReference?: boolean;
    referenceCollection?: string;
    isEnum?: boolean;
    enumValues?: string[];
    isRequired?: boolean;
    semanticType?: string; // e.g., 'amount', 'date', 'status', 'type', 'reference'
}

interface CollectionMetadata {
    name: string;
    description: string;
    purpose: string;
    fields: EntityField[];
    relationships: SchemaRelationship[];
    commonQueries: string[];
    businessRules: string[];
}

export class RAGService {
    private mongoClient!: MongoClient;
    private pinecone!: Pinecone;
    private embeddings: OpenAIEmbeddings;
    private vectorStore: VectorStore | null = null;
    private model: ChatOpenAI;

    constructor() {
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
        this.model = new ChatOpenAI({
            modelName: 'gpt-4',
            temperature: 0,
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
    }

    async initialize(mongoUri: string) {
        // Initialize MongoDB connection
        this.mongoClient = new MongoClient(mongoUri);
        await this.mongoClient.connect();

        // Initialize Pinecone
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!
        });

        // Verify that the index name is provided
        const indexName = process.env.PINECONE_INDEX;
        if (!indexName) {
            throw new Error('PINECONE_INDEX environment variable is required');
        }

        try {
            // Try to get the index - if it doesn't exist, this will throw
            await this.pinecone.describeIndex(indexName);
        } catch (error) {
            // If index doesn't exist, create it
            await this.pinecone.createIndex({
                name: indexName,
                dimension: 1536, // OpenAI embeddings dimension
                metric: 'cosine',
                spec: {
                    serverless: {
                        cloud: 'aws',
                        region: 'us-west-2'
                    }
                }
            });
        }
    }

    async analyzeAndStoreSchema() {
        const db = this.mongoClient.db();
        console.log('Getting collections from database...');
        const collections = await db.listCollections().toArray();
        console.log(`Found ${collections.length} collections`);
        
        const schemaDocuments: Document[] = [];

        for (const collection of collections) {
            console.log(`Analyzing collection: ${collection.name}`);
            const sample = await db.collection(collection.name).findOne();
            if (!sample) {
                console.log(`No documents found in collection: ${collection.name}`);
                continue;
            }

            // Create a document describing the collection schema
            const schemaDescription = this.generateSchemaDescription(collection.name, sample);
            console.log(`Schema for ${collection.name}:\n${schemaDescription}`);
            
            schemaDocuments.push(
                new Document({
                    pageContent: schemaDescription,
                    metadata: {
                        collectionName: collection.name,
                        type: 'schema',
                    },
                })
            );
        }

        console.log(`Generated schema descriptions for ${schemaDocuments.length} collections`);

        // Initialize Pinecone vector store with explicit index name
        const indexName = process.env.PINECONE_INDEX!;
        console.log(`Using Pinecone index: ${indexName}`);
        const index = this.pinecone.Index(indexName);
        
        // Create embeddings and store in Pinecone
        const texts = schemaDocuments.map(doc => doc.pageContent);
        console.log('Creating embeddings...');
        const embeddings = await this.embeddings.embedDocuments(texts);
        console.log(`Created ${embeddings.length} embeddings`);
        
        // Store embeddings in Pinecone
        console.log('Storing embeddings in Pinecone...');
        try {
            await index.upsert(
                embeddings.map((embedding, idx) => ({
                    id: `schema_${idx}`,
                    values: embedding,
                    metadata: {
                        ...schemaDocuments[idx].metadata,
                        pageContent: schemaDocuments[idx].pageContent
                    },
                }))
            );
            console.log('Successfully stored embeddings in Pinecone');
        } catch (error) {
            console.error('Error storing embeddings:', error);
            throw error;
        }
    }

    private analyzeField(fieldName: string, value: any): EntityField {
        const field: EntityField = {
            name: fieldName,
            type: typeof value,
            description: ''
        };

        // Analyze field name patterns
        const namePatterns = {
            id: /^.*[iI]d$/,
            status: /^.*[sS]tatus$/,
            type: /^.*[tT]ype$/,
            date: /^.*[dD]ate$/,
            amount: /^.*[aA]mount$/,
        };

        // Detect semantic types
        for (const [semantic, pattern] of Object.entries(namePatterns)) {
            if (pattern.test(fieldName)) {
                field.semanticType = semantic;
                break;
            }
        }

        // Analyze value patterns
        if (value?._bsontype === 'ObjectId') {
            field.type = 'ObjectId';
            field.isReference = true;
            // Infer referenced collection from field name
            const possibleCollectionName = fieldName.replace(/Id$|_id$/i, '');
            field.referenceCollection = possibleCollectionName;
        } else if (value instanceof Date) {
            field.type = 'date';
            field.semanticType = 'date';
        }

        // Infer descriptions and rules based on field patterns
        if (field.semanticType === 'status') {
            field.isEnum = true;
            field.description = `Represents the current status of the ${field.name.replace('Status', '')}`;
        } else if (field.semanticType === 'type') {
            field.isEnum = true;
            field.description = `Categorizes the type of ${field.name.replace('Type', '')}`;
        } else if (field.semanticType === 'amount') {
            field.description = `Monetary value representing the ${field.name.replace('Amount', '')}`;
        }

        return field;
    }

    private generateCollectionMetadata(collectionName: string, sample: any): CollectionMetadata {
        const fields = Object.entries(sample).map(([fieldName, value]) => 
            this.analyzeField(fieldName, value)
        );

        const relationships: SchemaRelationship[] = [];
        const referenceFields = fields.filter(f => f.isReference);

        // Analyze relationships
        for (const field of referenceFields) {
            if (field.referenceCollection) {
                relationships.push({
                    fromCollection: collectionName,
                    toCollection: field.referenceCollection,
                    throughField: field.name,
                    relationType: 'many-to-one', // Default assumption, can be refined
                    description: `${collectionName} belongs to ${field.referenceCollection}`
                });
            }
        }

        // Generate collection metadata
        const metadata: CollectionMetadata = {
            name: collectionName,
            description: this.generateCollectionDescription(collectionName, fields),
            purpose: this.inferCollectionPurpose(collectionName, fields),
            fields,
            relationships,
            commonQueries: this.generateCommonQueries(collectionName, fields, relationships),
            businessRules: this.inferBusinessRules(collectionName, fields, relationships)
        };

        return metadata;
    }

    private generateCollectionDescription(collectionName: string, fields: EntityField[]): string {
        const referenceFields = fields.filter(f => f.isReference);
        const statusFields = fields.filter(f => f.semanticType === 'status');
        const typeFields = fields.filter(f => f.semanticType === 'type');
        
        let description = `The ${collectionName} collection `;
        
        if (referenceFields.length > 0) {
            description += `is related to ${referenceFields.map(f => f.referenceCollection).join(', ')}. `;
        }
        
        if (statusFields.length > 0) {
            description += `It tracks status through ${statusFields.map(f => f.name).join(', ')}. `;
        }
        
        if (typeFields.length > 0) {
            description += `It categorizes data using ${typeFields.map(f => f.name).join(', ')}. `;
        }
        
        return description;
    }

    private inferCollectionPurpose(collectionName: string, fields: EntityField[]): string {
        const hasTimestamps = fields.some(f => f.semanticType === 'date');
        const hasAmounts = fields.some(f => f.semanticType === 'amount');
        const hasStatus = fields.some(f => f.semanticType === 'status');
        
        let purpose = '';
        
        if (hasTimestamps && hasAmounts) {
            purpose += 'Tracks financial transactions or activities over time. ';
        }
        if (hasStatus) {
            purpose += 'Manages state transitions and workflow. ';
        }
        
        return purpose || 'Stores domain-specific data. ';
    }

    private generateCommonQueries(
        collectionName: string,
        fields: EntityField[],
        relationships: SchemaRelationship[]
    ): string[] {
        const queries = [];
        
        // Add relationship-based queries
        for (const rel of relationships) {
            queries.push(
                `Find ${collectionName} by ${rel.toCollection}`,
                `Get all ${collectionName} for a specific ${rel.toCollection}`
            );
        }
        
        // Add field-based queries
        const statusFields = fields.filter(f => f.semanticType === 'status');
        const dateFields = fields.filter(f => f.semanticType === 'date');
        const amountFields = fields.filter(f => f.semanticType === 'amount');
        
        if (statusFields.length > 0) {
            queries.push(`Get ${collectionName} by status`);
        }
        if (dateFields.length > 0) {
            queries.push(`Get ${collectionName} by date range`);
        }
        if (amountFields.length > 0) {
            queries.push(`Calculate total amount for ${collectionName}`);
        }
        
        return queries;
    }

    private inferBusinessRules(
        collectionName: string,
        fields: EntityField[],
        relationships: SchemaRelationship[]
    ): string[] {
        const rules = [];
        
        // Relationship-based rules
        for (const rel of relationships) {
            rules.push(
                `Each ${collectionName} must have a valid ${rel.toCollection} reference`,
                `When a ${rel.toCollection} is deleted, related ${collectionName} should be handled appropriately`
            );
        }
        
        // Field-based rules
        const statusFields = fields.filter(f => f.semanticType === 'status');
        const amountFields = fields.filter(f => f.semanticType === 'amount');
        
        if (statusFields.length > 0) {
            rules.push(`Status transitions should follow valid state machine rules`);
        }
        if (amountFields.length > 0) {
            rules.push(`Amount values should be validated and handled according to business logic`);
        }
        
        return rules;
    }

    private generateSchemaDescription(collectionName: string, sample: any): string {
        const metadata = this.generateCollectionMetadata(collectionName, sample);
        
        let description = `Collection "${collectionName}":\n\n`;
        
        // Technical Schema
        description += 'Technical Schema:\n';
        metadata.fields.forEach(field => {
            description += `- ${field.name}: ${field.type}`;
            if (field.isReference) {
                description += ` (references ${field.referenceCollection})`;
            }
            if (field.semanticType) {
                description += ` (semantic type: ${field.semanticType})`;
            }
            description += '\n';
        });
        
        // Semantic Description
        description += '\nPurpose:\n';
        description += metadata.purpose;
        
        // Relationships
        if (metadata.relationships.length > 0) {
            description += '\nRelationships:\n';
            metadata.relationships.forEach(rel => {
                description += `- ${rel.description}\n`;
            });
        }
        
        // Common Queries
        description += '\nCommon Questions:\n';
        metadata.commonQueries.forEach(query => {
            description += `- "${query}"\n`;
        });
        
        // Business Rules
        description += '\nBusiness Rules:\n';
        metadata.businessRules.forEach(rule => {
            description += `- ${rule}\n`;
        });
        
        return description;
    }

    async queryData(question: string, chatHistory: [string, string][] = []): Promise<{
        answer: string;
        needsClarification: boolean;
        followUpQuestions?: string[];
    }> {
        console.log('Processing query:', question);
        
        // Initialize Pinecone if not already initialized
        if (!this.pinecone) {
            console.log('Initializing Pinecone...');
            this.pinecone = new Pinecone({
                apiKey: process.env.PINECONE_API_KEY!
            });
        }

        const indexName = process.env.PINECONE_INDEX;
        if (!indexName) {
            throw new Error('PINECONE_INDEX environment variable is required');
        }
        
        // Get embeddings for the question
        const questionEmbedding = await this.embeddings.embedQuery(question);
        
        // Query Pinecone
        console.log(`Using Pinecone index: ${indexName}`);
        const index = this.pinecone.Index(indexName);
        console.log('Querying Pinecone...');
        const queryResponse = await index.query({
            vector: questionEmbedding,
            topK: 3,
            includeMetadata: true,
        });
        console.log('Pinecone response:', JSON.stringify(queryResponse, null, 2));
        
        // Format the context from the retrieved documents
        const context = queryResponse.matches
            .map(match => match.metadata?.pageContent || '')
            .join('\n\n');

        console.log('Retrieved context:', context);

        if (!context) {
            console.log('No context found in Pinecone');
            return {
                answer: "I don't have any schema information yet. Please initialize the system first using the /api/rag/initialize endpoint.",
                needsClarification: true,
                followUpQuestions: ["Have you initialized the system with your MongoDB connection?"]
            };
        }

        // Update the prompt to be more conversational and context-aware
        const prompt = `
        You are a helpful financial advisor assistant that understands investment platforms, particularly focusing on SIPs (Systematic Investment Plans) and gold investments. You have access to the following database schema information:
        
        ${context}

        User Question: ${question}

        Based on the schema information and common investment scenarios:
        1. If you understand the intent but need specific details, ask clarifying questions
        2. If you see multiple possible interpretations, explain them and ask for clarification
        3. If you can answer the question, provide a clear, user-friendly response
        4. Always think about the business context - this is a financial investment platform
        5. Consider relationships between collections when answering
        
        Remember: Users might ask questions in natural language without knowing the technical structure. Try to understand their intent and guide them appropriately.
        `;

        // Generate response using the model
        const response = await this.model.invoke([
            { role: 'user', content: prompt }
        ]);

        // Convert response to string
        const answer = typeof response.content === 'string' 
            ? response.content 
            : JSON.stringify(response.content);

        // Check if clarification is needed
        const clarificationCheck = await this.checkIfNeedsClarification(
            question,
            answer
        );

        return {
            answer,
            ...clarificationCheck,
        };
    }

    private async checkIfNeedsClarification(
        question: string,
        answer: string
    ): Promise<{ needsClarification: boolean; followUpQuestions?: string[] }> {
        const clarificationPrompt = `
        Analyze this Q&A pair and determine if the question needs clarification:
        Question: ${question}
        Answer: ${answer}

        If the answer is vague or could have multiple interpretations, return specific follow-up questions.
        Return in format:
        needsClarification: true/false
        followUpQuestions: [list of specific questions if needed]
        `;

        const response = await this.model.invoke([
            { role: 'user', content: clarificationPrompt }
        ]);
        
        // Convert the response to string if it's not already
        const responseText = typeof response.content === 'string' 
            ? response.content 
            : JSON.stringify(response.content);
            
        const parsed = this.parseClarificationResponse(responseText);
        
        return {
            needsClarification: parsed.needsClarification,
            followUpQuestions: parsed.followUpQuestions,
        };
    }

    private parseClarificationResponse(response: string): {
        needsClarification: boolean;
        followUpQuestions?: string[];
    } {
        // Simple parsing logic - can be enhanced based on actual response format
        const needsClarification = response.toLowerCase().includes('true');
        const questions = response.match(/(?<=\d\.\s).*$/gm) || [];
        
        return {
            needsClarification,
            followUpQuestions: questions.length > 0 ? questions : undefined,
        };
    }

    async deleteAllSchemas() {
        const indexName = process.env.PINECONE_INDEX;
        if (!indexName) {
            throw new Error('PINECONE_INDEX environment variable is required');
        }

        // Initialize Pinecone if not already initialized
        if (!this.pinecone) {
            this.pinecone = new Pinecone({
                apiKey: process.env.PINECONE_API_KEY!
            });
        }

        console.log(`Deleting all vectors from index: ${indexName}`);
        const index = this.pinecone.Index(indexName);
        
        try {
            // Delete all vectors in the index
            await index.deleteAll();
            console.log('Successfully deleted all vectors from Pinecone');
        } catch (error) {
            console.error('Error deleting vectors:', error);
            throw error;
        }
    }

    async disconnect() {
        await this.mongoClient.close();
    }
} 