import { OpenAI } from 'openai';
import { DatabaseContext } from '../types/ai.types';
import { DatabaseSchema } from '../types/schema.types';

export async function generateAIResponse(query: string, context: DatabaseContext, schema: DatabaseSchema) {
  const systemPrompt = `
    You are an expert MongoDB query generator. Your role is to convert natural language requests into accurate MongoDB queries.
    Consider the provided database context and schema carefully to choose the correct collections and fields.
    Ensure queries are efficient, syntactically correct, and optimized for real-world MongoDB usage.
    Always explain your reasoning behind the collection and field selection.
  `;

  const userPrompt = `
    Given this database context and schema:
    Context: ${JSON.stringify(context, null, 2)}
    Schema: ${JSON.stringify(schema, null, 2)}

    Generate a MongoDB query for this natural language request: "${query}"
    
    Important Instructions:
    1. Carefully analyze the context and schema to determine the most appropriate collection
    2. Look at each collection's purpose, fields, and relationships
    3. Choose the collection that best matches the query requirements
    4. Consider the field types and data structure in your collection choice
    
    Return a JSON object with:
    1. mongoQuery: the MongoDB query as a string (ensure you're using the correct collection)
    2. explanation: explanation of how the query works and why you chose this collection based on the schema
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
      temperature: 0.3,  // Reduced temperature for more focused responses
    });

    return JSON.parse(completion.choices[0].message.content || '{}');
  } catch (error: unknown) {
    console.error('Error generating MongoDB query:', error);
    throw error;
  }
}

