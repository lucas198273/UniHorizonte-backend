import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogCategoriesService } from './categories.service.js';
import type { BlogCategoriesRepository } from './categories.repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';

const TENANT = '11111-1111-1111-1111-111';

function makeRepo(): BlogCategoriesRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    listActive: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockImplementation((v) => Promise.resolve({ id: 'new', ...v })),
    update: vi.fn().mockImplementation((id, _t, v) => Promise.resolve({ id, ...v })),
    delete: vi.fn().mockResolvedValue(undefined),
    countPostsByCategory: vi.fn().mockResolvedValue(0),
    countActivePostsGrouped: vi.fn().mockResolvedValue(new Map()),
  } as unknown as BlogCategoriesRepository;
}

let repo: BlogCategoriesRepository;
let service: BlogCategoriesService;

beforeEach(() => {
  repo = makeRepo();
  service = new BlogCategoriesService(repo);
});

describe('BlogCategoriesService.create', () => {
  it('gera slug a partir do nome quando não informado', async () => {
    await service.create(TENANT, { nome: 'Eletrônicos & Casa' });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'eletronicos-casa', tenant_id: TENANT }),
    );
  });

  it('rejeita slug duplicado no tenant', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue({ id: 'x', slug: 'tech' } as never);
    await expect(service.create(TENANT, { nome: 'Tech', slug: 'tech' }))
      .rejects.toThrow(ConflictError);
  });

  it('rejeita parent de outro tenant (não encontrado)', async () => {
    await expect(
      service.create(TENANT, { nome: 'Filha', parent_id: '22222-2222-2222-2222-222' }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('BlogCategoriesService.update', () => {
  it('rejeita auto-referência de parent_id', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'cat-1' } as never);
    await expect(
      service.update('cat-1', TENANT, { parent_id: 'cat-1' }),
    ).rejects.toThrow(ValidationError);
  });

  it('404 quando categoria não existe no tenant', async () => {
    await expect(service.update('nope', TENANT, { nome: 'X' }))
      .rejects.toThrow(NotFoundError);
  });
});

describe('BlogCategoriesService.listWithPostCount', () => {
  it('retorna categorias com post_count (0 quando sem posts)', async () => {
    vi.mocked(repo.listActive).mockResolvedValue([
      { id: 'cat-1', nome: 'A' },
      { id: 'cat-2', nome: 'B' },
    ] as never);
    vi.mocked(repo.countActivePostsGrouped).mockResolvedValue(new Map([['cat-1', 7]]));
    const result = await service.listWithPostCount(TENANT, false);
    expect(result).toEqual([
      expect.objectContaining({ id: 'cat-1', post_count: 7 }),
      expect.objectContaining({ id: 'cat-2', post_count: 0 }),
    ]);
  });
});

describe('BlogCategoriesService.delete', () => {
  it('bloqueia delete com posts associados sem force', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'cat-1' } as never);
    vi.mocked(repo.countPostsByCategory).mockResolvedValue(3);
    await expect(service.delete('cat-1', TENANT, false))
      .rejects.toThrow(ConflictError);
  });

  it('permite delete com force=true', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'cat-1' } as never);
    vi.mocked(repo.countPostsByCategory).mockResolvedValue(3);
    await expect(service.delete('cat-1', TENANT, true)).resolves.toBeUndefined();
  });
});
