import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './StorageService.js';
import type { SupabaseStorageRepository } from './SupabaseStorageRepository.js';
import { ValidationError } from '../errors/index.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const BUCKET = 'blog-images';
const MAX = 5 * 1024 * 1024;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.from([...Buffer.from('RIFF'), 0x00, 0x00, 0x00, 0x00, ...Buffer.from('WEBP')]);
const AVIF = Buffer.from([...Buffer.from('0000'), ...Buffer.from('ftyp'), ...Buffer.from('avif')]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

let repo: SupabaseStorageRepository;
let service: StorageService;

beforeEach(() => {
  repo = {
    upload: vi.fn().mockImplementation((_b, path, _buf, mime) =>
      Promise.resolve({ path, publicUrl: `https://cdn.test/${path} (${mime})` })),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as SupabaseStorageRepository;
  service = new StorageService(repo);
});

describe('StorageService.uploadImage', () => {
  it.each([
    ['jpeg', JPEG, 'image/jpeg', 'jpg'],
    ['png', PNG, 'image/png', 'png'],
    ['webp', WEBP, 'image/webp', 'webp'],
    ['avif', AVIF, 'image/avif', 'avif'],
    ['gif', GIF, 'image/gif', 'gif'],
  ])('aceita %s válido e retorna url/path/size/mimetype', async (_n, buf, mime, ext) => {
    const result = await service.uploadImage(BUCKET, TENANT, buf, MAX);
    expect(result.mimetype).toBe(mime);
    expect(result.size).toBe(buf.length);
    expect(result.url).toContain(result.path);
    expect(result.path).toMatch(new RegExp(`^${TENANT}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.${ext}$`));
  });

  it('rejeita buffer maior que o limite', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX)]);
    await expect(service.uploadImage(BUCKET, TENANT, big, MAX))
      .rejects.toThrow(ValidationError);
  });

  it('rejeita buffer vazio', async () => {
    await expect(service.uploadImage(BUCKET, TENANT, Buffer.alloc(0), MAX))
      .rejects.toThrow('Arquivo vazio');
  });

  it('rejeita bytes que não são imagem (ex: .txt renomeado)', async () => {
    const txt = Buffer.from('hello world, isto não é uma imagem');
    await expect(service.uploadImage(BUCKET, TENANT, txt, MAX))
      .rejects.toThrow('Formato não suportado');
  });

  it('path gerado começa com tenantId e usa UUID', async () => {
    await service.uploadImage(BUCKET, TENANT, JPEG, MAX);
    expect(repo.upload).toHaveBeenCalledWith(
      BUCKET,
      expect.stringMatching(new RegExp(`^${TENANT}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.jpg$`)),
      JPEG,
      'image/jpeg',
    );
  });
});

describe('StorageService.deleteImage', () => {
  it('remove path do próprio tenant', async () => {
    const path = `${TENANT}/2026/10/abc.jpg`;
    await service.deleteImage(BUCKET, TENANT, path);
    expect(repo.remove).toHaveBeenCalledWith(BUCKET, path);
  });

  it('rejeita path de outro tenant', async () => {
    await expect(
      service.deleteImage(BUCKET, TENANT, 'outro-tenant/2026/10/abc.jpg'),
    ).rejects.toThrow('Path não pertence a este tenant');
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
