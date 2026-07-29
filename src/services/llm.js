const { MIN_SIMILARITY } = require('./retrieval');

function buildPrompt(query, chunks) {
  const context = chunks.length === 0
    ? 'No relevant documents were found in the knowledge base.'
    : chunks.map((chunk, i) =>
        `[${i + 1}] (${chunk.source}, relevance: ${chunk.similarity})\n${chunk.text}`
      ).join('\n\n');

  return {
    system: 'You are a helpful assistant. Answer questions using ONLY the provided context. If the context does not contain enough information to answer the question, respond with: "I do not have enough information in the knowledge base to answer that question." Do not invent facts or use outside knowledge.',
    user: `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer:`
  };
}

function filterChunksForLLM(chunks) {
  return chunks.filter((chunk) => parseFloat(chunk.similarity) >= MIN_SIMILARITY);
}

async function generateAnswer(query, chunks) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      'LLM_API_KEY is not set — get a free key at https://console.groq.com and add it to .env'
    );
  }

  const relevantChunks = filterChunksForLLM(chunks);
  const { system, user } = buildPrompt(query, relevantChunks);
  const model = process.env.LLM_MODEL || 'llama-3.1-8b-instant';
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');

  const start = Date.now();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`LLM API returned ${response.status}: ${errBody}`);
  }

  const data = await response.json();

  return {
    answer: data.choices[0].message.content,
    model,
    durationMs: Date.now() - start,
    usage: data.usage || null,
    chunksUsed: relevantChunks.length
  };
}

module.exports = { generateAnswer, buildPrompt, filterChunksForLLM };
