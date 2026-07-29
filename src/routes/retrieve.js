const express = require('express');
const { retrieveWithMMR } = require('../services/retrieval');

module.exports = function (redisClient) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { query, topK } = req.body;
    const k = topK || 5;

    if (!query) {
      return res.status(400).json({ error: 'query field is required' });
    }

    try {
      const retrieval = await retrieveWithMMR(redisClient, query, k);

      return res.json({
        query,
        candidatePoolSize: retrieval.candidatePoolSize,
        dedupedPoolSize: retrieval.dedupedPoolSize,
        filteredBelowMinSimilarity: retrieval.filteredBelowMinSimilarity,
        results: retrieval.results,
        embeddingDurationMs: retrieval.embeddingDurationMs,
        retrievalDurationMs: retrieval.retrievalDurationMs
      });

    } catch (err) {
      console.error('Retrieval error:', err);
      return res.status(500).json({ error: 'Internal retrieval error' });
    }
  });

  return router;
};
