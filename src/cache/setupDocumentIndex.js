require('dotenv').config();
const { createClient } = require('redis');

async function setupDocumentIndex() {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => console.error('Redis Client Error', err));
  await client.connect();

  const indexName = 'idx:documents';

  try {
    await client.ft.info(indexName);
    console.log(`Index "${indexName}" already exists — skipping creation.`);
    console.log('To apply vector-only schema (no BM25), drop and recreate:');
    console.log(`  redis-cli FT.DROPINDEX ${indexName}`);
    console.log(`  node src/cache/setupDocumentIndex.js`);
  } catch (err) {
    console.log(`Creating index "${indexName}"...`);

    await client.ft.create(
      indexName,
      {
        text: { type: 'TEXT', NOINDEX: true },
        source: { type: 'TEXT', NOINDEX: true },
        chunkIndex: { type: 'NUMERIC', NOINDEX: true },
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
        PREFIX: 'doc:'
      }
    );

    console.log(`Index "${indexName}" created successfully (vector-only, no BM25).`);
  }

  await client.disconnect();
}

setupDocumentIndex().catch((err) => {
  console.error('Failed to set up document index:', err);
  process.exit(1);
});
