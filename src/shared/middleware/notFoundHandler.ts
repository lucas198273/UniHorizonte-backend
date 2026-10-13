import type { Request, Response } from 'express';
import { fail } from '../http/HttpResponse.js';

export function notFoundHandler(req: Request, res: Response): void {
  fail(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}
