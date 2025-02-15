import fs from 'fs';
import path from 'path';

interface SchemaField {
    field: string;
    semanticMeaning: string;
    importance: number;
    tags: string[];
}

interface Collection {
    collectionName: string;
    fields: SchemaField[];
    totalDocuments?: number;
}

interface SchemaAnalysis {
    databaseName: string;
    collections: Collection[];
}

class SchemaChunker {
    private maxFieldsPerChunk: number;
    private overlapFields: number;

    constructor(maxFieldsPerChunk: number = 10, overlapFields: number = 2) {
        this.maxFieldsPerChunk = maxFieldsPerChunk;
        this.overlapFields = overlapFields;
    }

    chunkSchema(schema: SchemaAnalysis): any[] {
        const chunks: any[] = [];
        
        // Create a database-level chunk with overview
        chunks.push({
            type: 'database_overview',
            content: {
                databaseName: schema.databaseName,
                totalCollections: schema.collections.length,
                collectionNames: schema.collections.map(c => c.collectionName)
            }
        });

        // Process each collection
        schema.collections.forEach(collection => {
            // Create collection-level chunk with metadata
            chunks.push({
                type: 'collection_overview',
                content: {
                    databaseName: schema.databaseName,
                    collectionName: collection.collectionName,
                    totalFields: collection.fields.length,
                    totalDocuments: collection.totalDocuments
                }
            });

            // Chunk the fields
            const fields = collection.fields;
            for (let i = 0; i < fields.length; i += this.maxFieldsPerChunk - this.overlapFields) {
                const fieldChunk = fields.slice(i, i + this.maxFieldsPerChunk);
                
                chunks.push({
                    type: 'collection_fields',
                    content: {
                        databaseName: schema.databaseName,
                        collectionName: collection.collectionName,
                        chunkIndex: Math.floor(i / (this.maxFieldsPerChunk - this.overlapFields)),
                        totalChunks: Math.ceil(fields.length / (this.maxFieldsPerChunk - this.overlapFields)),
                        fields: fieldChunk,
                        isFirstChunk: i === 0,
                        isLastChunk: i + this.maxFieldsPerChunk >= fields.length
                    }
                });
            }

            // Create semantic relationships chunk
            const relationships = this.extractRelationships(collection);
            if (relationships.length > 0) {
                chunks.push({
                    type: 'collection_relationships',
                    content: {
                        databaseName: schema.databaseName,
                        collectionName: collection.collectionName,
                        relationships
                    }
                });
            }
        });

        return chunks;
    }

    private extractRelationships(collection: Collection): any[] {
        const relationships: any[] = [];
        
        // Group fields by tags
        const tagGroups = new Map<string, SchemaField[]>();
        collection.fields.forEach(field => {
            field.tags.forEach(tag => {
                if (!tagGroups.has(tag)) {
                    tagGroups.set(tag, []);
                }
                tagGroups.get(tag)!.push(field);
            });
        });

        // Create relationships based on common tags
        tagGroups.forEach((fields, tag) => {
            if (fields.length > 1) {
                relationships.push({
                    tag,
                    fields: fields.map(f => f.field),
                    averageImportance: fields.reduce((acc, f) => acc + f.importance, 0) / fields.length
                });
            }
        });

        return relationships;
    }
}

async function main() {
    try {
        // Read the schema analysis file
        const schemaPath = path.join(process.cwd(), 'data', 'schema_analysis.json');
        const schema: SchemaAnalysis = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

        // Create chunks
        const chunker = new SchemaChunker(10, 2);
        const chunks = chunker.chunkSchema(schema);

        // Write chunks to file
        const outputPath = path.join(process.cwd(), 'data', 'chunk_schema_analysis.json');
        fs.writeFileSync(outputPath, JSON.stringify(chunks, null, 2));

        console.log(`Successfully created ${chunks.length} chunks`);
        console.log('Chunks saved to:', outputPath);

        // Write a summary
        console.log('\nChunk Types Summary:');
        const typeCounts = chunks.reduce((acc: any, chunk: any) => {
            acc[chunk.type] = (acc[chunk.type] || 0) + 1;
            return acc;
        }, {});
        console.log(typeCounts);
    } catch (error) {
        console.error('Error processing schema:', error);
    }
}

// Run the script
main(); 