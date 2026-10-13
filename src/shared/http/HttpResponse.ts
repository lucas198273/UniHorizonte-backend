import type { Request, Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
}

// Controllers NUNCA usam res.json() diretamente — sempre ok()/fail().
export function ok<T>(
  res: Response,
  data: T,
  message = 'OK',
  status = 200,
): Response<ApiResponse<T>> {
  return res.status(status).json({ success: true, data, message });
}

export function fail(
  res: Response,
  status: number,
  message: string,
): Response<ApiResponse<never>> {
  return res.status(status).json({ success: false, data: null, message });
}

// Usado apenas onde o Express exige assinatura de handler.
export type HttpHandler = (req: Request, res: Response) => Promise<unknown> | unknown;
