const { embed } = require('./embeddings');
const { cosineSimilarity } = require('./similarity');

const CANDIDATE_POOL_SIZE = 10;
const MMR_LAMBDA = 0.7;
const MIN_SIMILARITY = 0.55;
const DEDUPE_SIMILARITY = 0.95;

function vectorToBuffer(vector) {
  return Buffer.from(new Float32Array(vector).buffer);
}

function dedupeCandidates(candidates) {
  const unique = [];

  for (const candidate of candidates) {
    const isDuplicate = unique.some((existing) =>
      existing.text === candidate.text ||
      cosineSimilarity(existing.vector, candidate.vector) >= DEDUPE_SIMILARITY
    );

    if (!isDuplicate) {
      unique.push(candidate);
    }
  }

  return unique;
}

function selectWithMMR(candidates, topN) {
  const selected = [];
  const remaining = [...candidates];

  while (selected.length < topN && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = parseFloat(candidate.similarity);

      let maxSimToSelected = 0;
      for (const sel of selected) {
        const sim = cosineSimilarity(candidate.vector, sel.vector);
        if (sim > maxSimToSelected) maxSimToSelected = sim;
      }

      const mmrScore = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxSimToSelected;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

async function retrieveWithMMR(redisClient, query, topK = 5, options = {}) {
  const start = Date.now();

  const embedResult = options.vector
    ? { vector: options.vector, durationMs: 0 }
    : await embed(query);

  const vectorBuffer = vectorToBuffer(embedResult.vector);

  const vectorResults = await redisClient.ft.search(
    'idx:documents',
    `*=>[KNN ${CANDIDATE_POOL_SIZE} @embedding $vec AS score]`,
    {
      PARAMS: { vec: vectorBuffer },
      RETURN: ['score', 'text', 'source', 'chunkIndex'],
      SORTBY: 'score',
      DIALECT: 2
    }
  );

  const candidates = [];
  for (const doc of vectorResults.documents) {
    const similarity = 1 - parseFloat(doc.value.score);
    if (similarity < MIN_SIMILARITY) continue;

    const embeddingJson = await redisClient.hGet(doc.id, 'embeddingJson');
    candidates.push({
      chunkId: doc.id,
      text: doc.value.text,
      source: doc.value.source,
      similarity: similarity.toFixed(4),
      vector: JSON.parse(embeddingJson)
    });
  }

  const deduped = dedupeCandidates(candidates);
  const diversified = selectWithMMR(deduped, topK);

  const results = diversified.map((item, rank) => ({
    chunkId: item.chunkId,
    text: item.text,
    source: item.source,
    rank: rank + 1,
    similarity: item.similarity
  }));

  return {
    results,
    candidatePoolSize: candidates.length,
    dedupedPoolSize: deduped.length,
    filteredBelowMinSimilarity: vectorResults.documents.length - candidates.length,
    embeddingDurationMs: embedResult.durationMs,
    retrievalDurationMs: Date.now() - start
  };
}

module.exports = {
  retrieveWithMMR,
  MIN_SIMILARITY,
  DEDUPE_SIMILARITY
};
