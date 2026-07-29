require('dotenv').config();
const { createClient } = require('redis');

async function setupVectorIndex() {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => console.error('Redis Client Error', err));
  await client.connect();

  const indexName = 'idx:semantic_cache';

  try {
    await client.ft.info(indexName);
    console.log(`Index "${indexName}" already exists — skipping creation.`);
  } catch (err) {
    console.log(`Creating index "${indexName}"...`);

    await client.ft.create(
      indexName,
      {
        query: { type: 'TEXT', NOINDEX: true },
        answer: { type: 'TEXT', NOINDEX: true },
        embedding: {
          type: 'VECTOR',
          ALGORITHM: 'HNSW',
          TYPE: 'FLOAT32',
          DIM: 384,
          DISTANCE_METRIC: 'COSINE'
        }
      },
      {
        ON: 'HASH',
        PREFIX: 'semantic:'
      }
    );

    console.log(`Index "${indexName}" created successfully (vector-only).`);
  }

  await client.disconnect();
}

setupVectorIndex().catch((err) => {
  console.error('Failed to set up vector index:', err);
  process.exit(1);
});
