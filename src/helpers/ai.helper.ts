import { OpenAI } from 'openai';
import { DatabaseContext } from '../types/ai.types';
import { DatabaseSchema } from '../types/schema.types';

export async function generateAIResponse(query: string, context: string) {
  const systemPrompt = `
    You are an expert MongoDB query generator. Your role is to convert natural language requests into precise, optimized MongoDB queries.
    You are provided with a detailed database schema, including field names, data types, semantic meanings, tags, and relationships between collections.
    ${context}
    **Key Responsibilities:**
    1. **Intent Recognition:** Identify the user's intent behind the natural language query.
    2. **Contextual Analysis:** Analyze the schema's context, including:
       - Field names (with exact matches), data types, semantic meanings, and tags.
       - Nested fields within embedded documents or sub-collections.
       - Relationships between collections (e.g., foreign keys).
    3. **Dynamic Operator Selection:** Based on field types, semantic meaning, and structure:
       - **Numerical fields:** Use operators like **$gt**, **$lt**, **$gte**, **$lte**, or **$eq** when relevant.
       - **String fields (including enums):** Infer operators such as **$in**, **$eq**, or **$regex**, based on context.
       - **Date fields:** Apply date comparison operators like **$gte** or **$lte** when filtering by date ranges.
    4. **Nested Field Handling:** If the relevant field is part of an embedded document, ensure the query accesses it correctly using dot notation (e.g., **"phonePeSubscriptionData.nextPaymentInitDate"**).
    5. **Relationship Awareness:** Leverage relationships between collections to enhance query accuracy.

    6. **Multi-Collection Query Logic:**  
   - If the required field does not exist in the current collection, check related collections using references 
   - Use **aggregation pipelines** or **$lookup** to join collections and filter data accurately.
   - Always prioritize relationship-aware queries when handling multi-collection queries.

    **Output Format:**
    Return a JSON object with:
    - **mongoQuery:** The MongoDB query as a properly formatted string.
    - **explanation:** A concise explanation covering:
      - Why specific collections and fields were selected.
      - How semantic meanings, data types, relationships, and nested structures influenced the query.
      - Any assumptions made to interpret the natural language query.

    **Important Notes:**
    - Always cross-reference the schema to validate field names, including nested fields.
    - Match field names exactly as provided in the schema. Do not assume similar-sounding fields are correct unless validated.
    - Adapt your query logic based on semantic meaning and schema structure, not hardcoded rules.
    - Focus on generating efficient queries optimized for MongoDB performance.
  `;

  const userPrompt = `
    Given this database context and schema

    Generate a MongoDB query for this natural language request: "${query}"
    
    Important Instructions:
    1. Carefully analyze the context and schema to determine the most appropriate collection.
    2. Consider the purpose of each collection, field semantics, data types, and relationships.
    3. If relevant fields are nested, ensure correct usage of dot notation (e.g., "parentField.childField").
    4. Validate the query for accuracy and efficiency.

    Return a JSON object with:
    1. mongoQuery: the MongoDB query as a string (ensure you're using the correct collection and field names).
    2. explanation: explanation of how the query works and why you chose this collection and fields based on the schema.
  `;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
    });

    return JSON.parse(completion.choices[0].message.content || '{}');
  } catch (error: unknown) {
    console.error('Error generating MongoDB query:', error);
    throw error;
  }
}


