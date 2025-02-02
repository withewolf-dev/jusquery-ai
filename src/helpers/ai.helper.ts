import { OpenAI } from 'openai';
import { DatabaseContext } from '../types/ai.types';
import { DatabaseSchema } from '../types/schema.types';

export async function generateAIResponse(query: string, context: DatabaseContext, schema: DatabaseSchema) {
  const prompt = `Given this database context and schema:
    Context: ${JSON.stringify(context, null, 2)}
    Schema: ${JSON.stringify(schema, null, 2)}

    Generate a MongoDB query for this natural language request: "${query}"
    
    Return a JSON object with:
    1. mongoQuery: the MongoDB query as a string
    2. explanation: explanation of how the query works
    `;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: "json_object" },
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
  });

  return JSON.parse(completion.choices[0].message.content || '{}');
} 