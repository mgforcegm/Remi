import 'dotenv/config';

import express from 'express';
import { dispatchRouter } from './routes/dispatch';
import { disconnectProducer } from './services/kafka-producer';
import { logger } from './utils/logger';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'remi-dispatcher' });
});

// Dispatch route
app.use(dispatchRouter);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'remi-dispatcher is running');
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down...');
  server.close();
  await disconnectProducer();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
