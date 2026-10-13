import cors from 'cors';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';

const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const corsMiddleware: RequestHandler = cors({
  origin: env.nodeEnv === 'production' && allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
});
