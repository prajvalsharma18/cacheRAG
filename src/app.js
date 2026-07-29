require('dotenv').config();
const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.on('error', (err) => console.error('Redis Client Error', err));

async function startServer() {
  await redisClient.connect();
  console.log('Connected to Redis');

  const queryRoute = require('./routes/query')(redisClient);
  app.use('/query', queryRoute);

  const ingestRoute = require('./routes/ingest')(redisClient);
  app.use('/ingest', ingestRoute);

  const retrieveRoute = require('./routes/retrieve')(redisClient);
  app.use('/retrieve', retrieveRoute);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`SmartCacheRAG server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});