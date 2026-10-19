import cors from 'cors';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

function loadCorsOrigins(): string[] {
  const envOrigins = env.corsOrigins;

  if (envOrigins.length === 0) {
    logger.error('CORS_ORIGINS não configurado. Requisições cross-origin serão recusadas.');
    return [];
  }

  logger.info('CORS origins loaded', {
    source: 'env',
    count: envOrigins.length,
    origins: envOrigins,
  });

  return envOrigins;
}

export const corsOrigins = loadCorsOrigins();

export const corsMiddleware: RequestHandler = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    logger.warn('CORS blocked origin', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});
