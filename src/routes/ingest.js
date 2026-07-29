const express = require('express');
const crypto = require('crypto');
const { embed } = require('../services/embeddings');
const { chunkText } = require('../services/chunking');
const { cosineSimilarity } = require('../services/similarity');

const DEDUPE_SIMILARITY = 0.95;

module.exports = function (redisClient) {
  const router = express.Router();

  function vectorToBuffer(vector) {
    return Buffer.from(new Float32Array(vector).buffer);
  }

  router.post('/', async (req, res) => {
    const { text, source } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text field is required' });
    }

    const docSource = source || 'unnamed-document';

    try {
      const chunks = chunkText(text);
      const storedChunks = [];
      const seenText = new Set();
      let skippedDuplicates = 0;
      let lastVector = null;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const textKey = chunk.trim().toLowerCase();

        if (seenText.has(textKey)) {
          skippedDuplicates++;
          continue;
        }

        const embedResult = await embed(chunk);

        if (lastVector && cosineSimilarity(lastVector, embedResult.vector) >= DEDUPE_SIMILARITY) {
          skippedDuplicates++;
          continue;
        }

        seenText.add(textKey);
        lastVector = embedResult.vector;

        const vectorBuffer = vectorToBuffer(embedResult.vector);
        const chunkId = crypto.randomUUID();
        const docKey = `doc:${chunkId}`;

        await redisClient.hSet(docKey, {
          text: chunk,
          source: docSource,
          chunkIndex: storedChunks.length,
          embedding: vectorBuffer,
          embeddingJson: JSON.stringify(embedResult.vector)
        });

        storedChunks.push({
          chunkId,
          chunkIndex: storedChunks.length - 1,
          textPreview: chunk.slice(0, 60) + (chunk.length > 60 ? '...' : '')
        });
      }

      return res.json({
        message: `Ingested ${storedChunks.length} chunks from source "${docSource}"`,
        chunksStored: storedChunks,
        skippedDuplicates
      });

    } catch (err) {
      console.error('Ingestion error:', err);
      return res.status(500).json({ error: 'Internal ingestion error' });
    }
  });

  return router;
};
