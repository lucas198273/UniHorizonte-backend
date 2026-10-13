import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../errors/AppError.js';
import { fail } from '../http/HttpResponse.js';
import { logger } from '../logger.js';
import { env } from '../../config/env.js';

// ÚLTIMO middleware do app. Express 5 encaminha aqui qualquer throw
// em handlers async — controllers não precisam de try/catch.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      fail(res, 400, `Arquivo maior que ${env.maxUploadSizeMb} MB`);
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      fail(res, 400, 'Campo de arquivo inválido. Use "file".');
      return;
    }
    fail(res, 400, `Erro no upload: ${err.message}`);
    return;
  }

  if (err instanceof AppError) {
    fail(res, err.statusCode, err.message);
    return;
  }

  logger.error('Unhandled error', { error: String(err) });
  fail(res, 500, 'Internal server error');
}
