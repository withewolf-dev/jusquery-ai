import { OpenAI } from 'openai';
import { DatabaseContext } from '../types/ai.types';
import { DatabaseSchema } from '../types/schema.types';

export async function generateAIResponse(query: string, context: DatabaseContext, schema: DatabaseSchema) {
  const systemPrompt = `
    You are an expert MongoDB query generator. Your role is to convert natural language requests into precise, optimized MongoDB queries.
    You are provided with a detailed database schema, including field names, data types, semantic meanings, tags, and relationships between collections.

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
    Given this database context and schema:
    Context: ${JSON.stringify(context, null, 2)}
    Schema: ${JSON.stringify(schema, null, 2)}

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

export async function generateIntentBasedQuery(query: string, context: DatabaseContext, schema: DatabaseSchema) {
  const systemPrompt = `
    You are an expert MongoDB query generator. Your task is to convert natural language requests into accurate MongoDB queries.

    **Important:** Follow this 4-step reasoning process for each request to ensure accuracy:
    
    **Step 1 - Intent Identification:** 
    - Clearly state what the user is asking for (e.g., "List of upcoming recurring payments").

    **Step 2 - Collection Selection:** 
    - Analyze the database schema to identify which collection(s) are most relevant to the query.
    - Justify your choice based on the collection's purpose and relationships.

    **Step 3 - Field Mapping:** 
    - List the exact fields you'll use, including nested fields if necessary.
    - Cross-reference the schema to ensure fields are valid.
    - Explain why each field is relevant to the query.

    **Step 4 - Query Construction:** 
    - Write the final MongoDB query using proper syntax.
    - Use dot notation for nested fields (e.g., "phonePeSubscriptionData.nextPaymentInitDate").
    - Ensure the query is efficient and accurate.

    **Output Format:**
    Return a JSON object with:
    - **intent:** Clear summary of the user's intent.
    - **collection:** The collection(s) selected for the query.
    - **fieldsUsed:** List of fields used, with brief explanations.
    - **mongoQuery:** The final MongoDB query as a string.
    - **explanation:** Explanation of how the query works and why you chose the collection/fields.

    **Rules:**
    - Always validate field names against the schema.
    - Do not assume field names; cross-check with the schema.
    - Handle nested fields correctly with dot notation.
    - Base your reasoning on the schema's semantic meaning and structure.
  `;

  const userPrompt = `
    Given this database context and schema:
    Schema: ${JSON.stringify(schema, null, 2)}

    Generate a MongoDB query for this natural language request: "${query}"
    
    Follow the 4-step reasoning process outlined in the system prompt to ensure accuracy.
  `;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
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


export async function analyzeQueryRequirements(query: string, context: DatabaseContext, schema: DatabaseSchema) {
  const systemPrompt = `
    You are a MongoDB query analyzer. Your task is to:
    1. Analyze if the query intent is clear and matches available collections/fields
    2. Identify which collections and fields would be needed
    3. Verify if those collections/fields exist in the schema
    
    Return a detailed analysis that helps determine if we can proceed with query generation.
  `;

  const userPrompt = `
    Given this database context and schema:
    Context: ${JSON.stringify(context, null, 2)}
    Schema: ${JSON.stringify(schema, null, 2)}

    Analyze this query: "${query}"
    
    Return a JSON object with:
    {
      "canProceed": boolean,
      "relevantCollections": string[],
      "relevantFields": string[],
      "reasoning": string,
      "suggestedClarification": string (if canProceed is false)
    }
  `;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
}

