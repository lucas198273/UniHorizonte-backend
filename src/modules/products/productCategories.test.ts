import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductCategoriesService } from './productCategories.service.js';
import type { ProductCategoriesRepository } from './productCategories.repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';

const TENANT = '11111-1111-1111-1111-111';

function makeRepo(): ProductCategoriesRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    listActive: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockImplementation((v) => Promise.resolve({ id: 'new', ...v })),
    update: vi.fn().mockImplementation((id, _t, v) => Promise.resolve({ id, ...v })),
    delete: vi.fn().mockResolvedValue(undefined),
    countProductsByCategory: vi.fn().mockResolvedValue(0),
    countActiveProductsGrouped: vi.fn().mockResolvedValue(new Map()),
  } as unknown as ProductCategoriesRepository;
}

let repo: ProductCategoriesRepository;
let service: ProductCategoriesService;

beforeEach(() => {
  repo = makeRepo();
  service = new ProductCategoriesService(repo);
});

describe('ProductCategoriesService.create', () => {
  it('gera slug a partir do nome', async () => {
    await service.create(TENANT, { nome: 'Ferramentas' });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'ferramentas', tenant_id: TENANT }),
    );
  });

  it('rejeita slug duplicado no tenant', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue({ id: 'x', slug: 'tools' } as never);
    await expect(service.create(TENANT, { nome: 'Tools', slug: 'tools' }))
      .rejects.toThrow(ConflictError);
  });
});

describe('ProductCategoriesService.update', () => {
  it('rejeita auto-referência de parent_id', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'cat-1' } as never);
    await expect(
      service.update('cat-1', TENANT, { parent_id: 'cat-1' }),
    ).rejects.toThrow(ValidationError);
  });

  it('404 quando não existe no tenant', async () => {
    await expect(service.update('nope', TENANT, { nome: 'X' }))
      .rejects.toThrow(NotFoundError);
  });
});

describe('ProductCategoriesService.listWithProductCount', () => {
  it('retorna categorias com product_count (0 quando sem produtos)', async () => {
    vi.mocked(repo.listActive).mockResolvedValue([
      { id: 'cat-1', nome: 'A' },
      { id: 'cat-2', nome: 'B' },
    ] as never);
    vi.mocked(repo.countActiveProductsGrouped).mockResolvedValue(new Map([['cat-2', 4]]));
    const result = await service.listWithProductCount(TENANT);
    expect(result).toEqual([
      expect.objectContaining({ id: 'cat-1', product_count: 0 }),
      expect.objectContaining({ id: 'cat-2', product_count: 4 }),
    ]);
  });
});

describe('ProductCategoriesService.delete', () => {
  it('bloqueia delete com produtos associados sem force', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'cat-1' } as never);
    vi.mocked(repo.countProductsByCategory).mockResolvedValue(2);
    await expect(service.delete('cat-1', TENANT, false)).rejects.toThrow(ConflictError);
  });
});
