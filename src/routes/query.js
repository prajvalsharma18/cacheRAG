const express = require('express');
const crypto = require('crypto');
const { embed } = require('../services/embeddings');
const { retrieveWithMMR } = require('../services/retrieval');
const { generateAnswer } = require('../services/llm');
const { normalizeQuery } = require('../services/normalize');

const NO_CONTEXT_ANSWER =
  'I do not have enough information in the knowledge base to answer that question.';

module.exports = function (redisClient) {
  const router = express.Router();

  const BASE_TTL = 3600;
  const TTL_INCREMENT = 1800;
  const MAX_TTL = 86400 * 7;
  const SIMILARITY_THRESHOLD = 0.92;

  function hashQuery(normalizedQuery) {
    return crypto.createHash('sha256').update(normalizedQuery).digest('hex');
  }

  function vectorToBuffer(vector) {
    return Buffer.from(new Float32Array(vector).buffer);
  }

  async function bumpHitCountAndGetTTL(hitCountKey) {
    const hitCount = await redisClient.incr(hitCountKey);
    const newTTL = Math.min(BASE_TTL + hitCount * TTL_INCREMENT, MAX_TTL);
    return { hitCount, newTTL };
  }

  router.post('/', async (req, res) => {
    const { query, topK } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query field is required' });
    }

    const normalized = normalizeQuery(query);
    const exactHash = hashQuery(normalized);
    const exactKey = `exact:${exactHash}`;
    const hitCountKey = `hits:${exactHash}`;

    try {
      // --- LEVEL 1: Exact-match cache ---
      const exactCached = await redisClient.get(exactKey);

      if (exactCached) {
        const { hitCount, newTTL } = await bumpHitCountAndGetTTL(hitCountKey);
        await redisClient.expire(exactKey, newTTL);

        return res.json({
          answer: exactCached,
          cacheLevel: 'exact',
          hitCount,
          ttlSeconds: newTTL,
          query: query
        });
      }

      // --- LEVEL 2: Semantic cache ---
      const embedResult = await embed(normalized);
      const vectorBuffer = vectorToBuffer(embedResult.vector);

      const searchResults = await redisClient.ft.search(
        'idx:semantic_cache',
        '*=>[KNN 1 @embedding $vec AS score]',
        {
          PARAMS: { vec: vectorBuffer },
          RETURN: ['score', 'answer', 'query'],
          SORTBY: 'score',
          DIALECT: 2
        }
      );

      if (searchResults.total > 0) {
        const topMatch = searchResults.documents[0];
        const distance = parseFloat(topMatch.value.score);
        const similarity = 1 - distance;

        if (similarity >= SIMILARITY_THRESHOLD) {
          const matchedKey = topMatch.id;
          const matchedHash = matchedKey.split(':')[1];
          const matchedHitCountKey = `hits:${matchedHash}`;

          const { hitCount, newTTL } = await bumpHitCountAndGetTTL(matchedHitCountKey);

          await redisClient.expire(matchedKey, newTTL);
          await redisClient.expire(`exact:${matchedHash}`, newTTL);

          return res.json({
            answer: topMatch.value.answer,
            cacheLevel: 'semantic',
            similarity: similarity.toFixed(4),
            matchedQuery: topMatch.value.query,
            hitCount,
            ttlSeconds: newTTL,
            embeddingDurationMs: embedResult.durationMs,
            query: query
          });
        }
      }

      // --- LEVEL 3: Genuine miss — retrieve → LLM → cache ---
      const k = topK || 5;
      const retrieval = await retrieveWithMMR(redisClient, query, k, {
        vector: embedResult.vector
      });

      if (retrieval.results.length === 0) {
        return res.json({
          answer: NO_CONTEXT_ANSWER,
          cacheLevel: 'miss',
          sources: [],
          chunksRetrieved: 0,
          filteredBelowMinSimilarity: retrieval.filteredBelowMinSimilarity,
          embeddingDurationMs: embedResult.durationMs,
          retrievalDurationMs: retrieval.retrievalDurationMs,
          llmSkipped: true,
          query: query
        });
      }

      const llmResult = await generateAnswer(query, retrieval.results);

      await redisClient.set(exactKey, llmResult.answer, { EX: BASE_TTL });

      const semanticKey = `semantic:${exactHash}`;
      await redisClient.hSet(semanticKey, {
        query: normalized,
        answer: llmResult.answer,
        embedding: vectorBuffer
      });
      await redisClient.expire(semanticKey, BASE_TTL);

      return res.json({
        answer: llmResult.answer,
        cacheLevel: 'miss',
        sources: retrieval.results.map((r) => ({
          source: r.source,
          rank: r.rank,
          similarity: r.similarity
        })),
        chunksRetrieved: retrieval.results.length,
        chunksUsedByLLM: llmResult.chunksUsed,
        filteredBelowMinSimilarity: retrieval.filteredBelowMinSimilarity,
        embeddingDurationMs: embedResult.durationMs,
        retrievalDurationMs: retrieval.retrievalDurationMs,
        llmDurationMs: llmResult.durationMs,
        llmModel: llmResult.model,
        llmUsage: llmResult.usage,
        ttlSeconds: BASE_TTL,
        query: query
      });

    } catch (err) {
      console.error('Query pipeline error:', err);
      const message = err.message || 'Internal query error';
      const status = message.includes('LLM_API_KEY') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
  });

  return router;
};
