import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`API running on port ${env.port}`, { env: env.nodeEnv });
});

// Shutdown gracioso (Render/Fly/etc. enviam SIGTERM).
function shutdown(signal: string): void {
  logger.info(`${signal} received, closing server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
