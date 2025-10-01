import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) return [];
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding hiccup:', error);
    return [];
  }
}
