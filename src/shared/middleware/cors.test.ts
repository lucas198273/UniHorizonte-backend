import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock('../../config/env.js', () => {
  return { env: { corsOrigins: '' } };
});
vi.mock('../logger.js', () => {
  return { logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
});

async function loadWith(file: string | null, envOrigins: string): Promise<{ origins: string[]; source?: string }> {
  vi.resetModules();
  vi.mocked(existsSync).mockReturnValue(file !== null);
  vi.mocked(readFileSync).mockReturnValue(file ?? '');
  const { env } = await import('../../config/env.js');
  const { logger } = await import('../logger.js');
  (env as { corsOrigins: string[] }).corsOrigins = envOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const { corsOrigins } = await import('./cors.js');
  const info = vi.mocked(logger.info).mock.calls.at(-1);
  return { origins: corsOrigins, source: (info?.[1] as { source: string } | undefined)?.source };
}

describe('CORS origins', () => {
  afterEach(() => vi.clearAllMocks());

  it('lê as origens de CORS_ORIGINS e ignora espaços e entradas vazias', async () => {
    expect(await loadWith(null, ' https://a.example, https://b.example , ')).toEqual({
      origins: ['https://a.example', 'https://b.example'], source: 'env',
    });
  });

  it('ignora o arquivo cors-origins.txt (fonte é exclusivamente a env)', async () => {
    expect(await loadWith('https://file.example\n', 'https://env.example')).toEqual({
      origins: ['https://env.example'], source: 'env',
    });
  });

  it('retorna lista vazia (bloqueio) quando CORS_ORIGINS está vazio', async () => {
    expect(await loadWith(null, '')).toEqual({ origins: [], source: undefined });
  });
});
