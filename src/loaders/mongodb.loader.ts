import { MongoClient } from 'mongodb';
// export class MongoDBLoader {`
//     private client: MongoClient;
//     private batchSize: number;

//     constructor(mongoUri: string, batchSize: number = 1000) {
//         this.client = new MongoClient(mongoUri);
//         this.batchSize = batchSize;
//     }

//     async connect() {
//         await this.client.connect();
//         console.log('Connected to MongoDB');
//     }

//     async loadCollection(
//         dbName: string,
//         collectionName: string,
//         query: object = {},
//         projection: object = {},
//         transformFunction?: (doc: any) => Document
//     ): Promise<Document[]> {
//         const db = this.client.db(dbName);
//         const collection = db.collection(collectionName);
//         const documents: Document[] = [];

//         try {
//             const cursor = collection.find(query).project(projection);
//             let batch = [];

//             for await (const doc of cursor) {
//                 if (transformFunction) {
//                     const transformedDoc = transformFunction(doc);
//                     batch.push(transformedDoc);
//                 } else {
//                     // Default transformation
//                     batch.push(
//                         new Document({
//                             pageContent: JSON.stringify(doc),
//                             metadata: {
//                                 source: collectionName,
//                                 id: doc._id.toString(),
//                                 timestamp: doc.createdAt || new Date(),
//                             },
//                         })
//                     );
//                 }

//                 if (batch.length >= this.batchSize) {
//                     documents.push(...batch);
//                     batch = [];
//                 }
//             }

//             // Push remaining documents
//             if (batch.length > 0) {
//                 documents.push(...batch);
//             }

//             console.log(`Loaded ${documents.length} documents from ${collectionName}`);
//             return documents;
//         } catch (error) {
//             console.error(`Error loading documents from ${collectionName}:`, error);
//             throw error;
//         }
//     }

//     async loadCollections(
//         dbName: string,
//         collections: Array<{
//             name: string;
//             query?: object;
//             projection?: object;
//             transform?: (doc: any) => Document;
//         }>
//     ): Promise<Document[]> {
//         const allDocuments: Document[] = [];

//         for (const collection of collections) {
//             const docs = await this.loadCollection(
//                 dbName,
//                 collection.name,
//                 collection.query || {},
//                 collection.projection || {},
//                 collection.transform
//             );
//             allDocuments.push(...docs);
//         }

//         return allDocuments;
//     }

//     async close() {
//         await this.client.close();
//         console.log('Disconnected from MongoDB');
//     }

//     // Helper method to create a custom document transformer
//     static createTransformer(
//         contentExtractor: (doc: any) => string,
//         metadataExtractor?: (doc: any) => object
//     ) {
//         return (doc: any): Document => {
//             const metadata = metadataExtractor
//                 ? metadataExtractor(doc)
//                 : {
//                       source: 'mongodb',
//                       id: doc._id.toString(),
//                       timestamp: doc.createdAt || new Date(),
//                   };

//             return new Document({
//                 pageContent: contentExtractor(doc),
//                 metadata,
//             });
//         };
//     }
// } 