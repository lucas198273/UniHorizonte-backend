import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsService } from './products.service.js';
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from './products.validation.js';
import type { ProductsRepository } from './products.repository.js';
import type { ProductCategoriesRepository } from './productCategories.repository.js';
import type { BlogPostProductsRepository } from '../blog/postProducts.repository.js';

const TENANT = '11111-1111-1111-1111-111';
const UUID_CAT = '123e4567-e89b-42d3-a456-426614174000';

function makeRepo(): ProductsRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    insert: vi.fn().mockImplementation((v) => Promise.resolve({ id: 'new', ...v })),
  } as unknown as ProductsRepository;
}

function makeCategoriesRepo(): ProductCategoriesRepository {
  return {
    findById: vi.fn().mockResolvedValue({ id: 'cat-1' }),
    findBySlug: vi.fn().mockResolvedValue(null),
  } as unknown as ProductCategoriesRepository;
}

const linksRepo = {
  countByProduct: vi.fn().mockResolvedValue(0),
} as unknown as BlogPostProductsRepository;

let repo: ProductsRepository;
let categoriesRepo: ProductCategoriesRepository;
let service: ProductsService;

beforeEach(() => {
  repo = makeRepo();
  categoriesRepo = makeCategoriesRepo();
  service = new ProductsService(repo, categoriesRepo, linksRepo);
});

describe('ProductsService.list — filtro category (UUID ou slug)', () => {
  const opts = (category?: string) => ({
    pagination: { page: 1, limit: 20, offset: 0 },
    categoryId: category,
    includeDrafts: false,
  });

  it('category=UUID passa direto pro repo (retrocompatível)', async () => {
    await service.listPublic(TENANT, opts(UUID_CAT) as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ categoryId: UUID_CAT }),
    );
    expect(categoriesRepo.findBySlug).not.toHaveBeenCalled();
  });

  it('category=slug resolve via findBySlug', async () => {
    vi.mocked(categoriesRepo.findBySlug).mockResolvedValue({ id: 'cat-9' } as never);
    await service.listPublic(TENANT, opts('ferramentas') as never);
    expect(categoriesRepo.findBySlug).toHaveBeenCalledWith('ferramentas', TENANT);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ categoryId: 'cat-9' }),
    );
  });

  it('category=slug inexistente retorna lista vazia (total 0, sem 404)', async () => {
    vi.mocked(categoriesRepo.findBySlug).mockResolvedValue(null as never);
    const result = await service.listPublic(TENANT, opts('nao-existe') as never);
    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('sem category não filtra por categoria', async () => {
    await service.listPublic(TENANT, opts() as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ categoryId: undefined }),
    );
    expect(categoriesRepo.findBySlug).not.toHaveBeenCalled();
  });
});

describe('ProductsService — campos de curso', () => {
  it('create sanitiza syllabus e repassa campos novos', async () => {
    await service.create(TENANT, {
      nome: 'Curso Teste',
      modality: 'online',
      workload_hours: 40,
      tags: ['marketing'],
      syllabus: '<p>Módulo 1</p><script>alert(1)</script>',
    });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        modality: 'online',
        workload_hours: 40,
        tags: ['marketing'],
        syllabus: '<p>Módulo 1</p>',
      }),
    );
  });

  it('create preserva syllabus null', async () => {
    await service.create(TENANT, { nome: 'X', syllabus: null });
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ syllabus: null }));
  });
});

describe('products.validation — campos de curso', () => {
  it('aceita payload válido de curso e mantém datas como string ISO', () => {
    const { error, value } = createProductSchema.validate({
      nome: 'Curso',
      kind: 'course',
      modality: 'hibrido',
      level: 'avancado',
      certification: true,
      start_date: '2026-11-01',
      tags: ['a', 'b'],
    });
    expect(error).toBeUndefined();
    expect(value.start_date).toBe('2026-11-01');
  });

  it('rejeita enum inválido', () => {
    const { error } = updateProductSchema.validate({ modality: 'ead' });
    expect(error).toBeDefined();
  });

  it('rejeita workload_hours não positivo', () => {
    const { error } = updateProductSchema.validate({ workload_hours: 0 });
    expect(error).toBeDefined();
  });
});
describe('ProductsService.list — filtros de curso (normalização)', () => {
  const opts = (extra: Record<string, unknown>) => ({
    pagination: { page: 1, limit: 20, offset: 0 },
    includeDrafts: false,
    ...extra,
  });

  it('modality "online,hibrido" vira array', async () => {
    await service.listPublic(TENANT, opts({ modality: 'online,hibrido' }) as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ modality: ['online', 'hibrido'] }),
    );
  });

  it('level como array explícito é mantido', async () => {
    await service.listPublic(TENANT, opts({ level: ['iniciante', 'avancado'] }) as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ level: ['iniciante', 'avancado'] }),
    );
  });

  it('tags "a, b" é trimada', async () => {
    await service.listPublic(TENANT, opts({ tags: 'a, b' }) as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ tags: ['a', 'b'] }),
    );
  });

  it('sem filtros novos → undefined (não filtra, retrocompatível)', async () => {
    await service.listPublic(TENANT, opts({}) as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        modality: undefined,
        level: undefined,
        certification: undefined,
        tags: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        minWorkload: undefined,
        maxWorkload: undefined,
        sort: undefined,
      }),
    );
  });

  it('filtros numéricos e sort passam direto', async () => {
    await service.listPublic(
      TENANT,
      opts({ minPrice: 100, maxPrice: 500, certification: true, sort: 'price_asc' }) as never,
    );
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        minPrice: 100,
        maxPrice: 500,
        certification: true,
        sort: 'price_asc',
      }),
    );
  });

  it('modality vazia ("") não filtra', async () => {
    await service.listPublic(TENANT, opts({ modality: '' }) as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ modality: undefined }),
    );
  });
});

describe('listProductsQuerySchema — filtros de curso', () => {
  it('aceita modality single e multi', () => {
    expect(listProductsQuerySchema.validate({ modality: 'online' }).error).toBeUndefined();
    expect(listProductsQuerySchema.validate({ modality: 'online,hibrido' }).error).toBeUndefined();
  });

  it('rejeita modality inválida', () => {
    expect(listProductsQuerySchema.validate({ modality: 'xyz' }).error).toBeDefined();
    expect(listProductsQuerySchema.validate({ modality: 'online,xyz' }).error).toBeDefined();
  });

  it('aceita level válido e rejeita inválido', () => {
    expect(listProductsQuerySchema.validate({ level: 'avancado' }).error).toBeUndefined();
    expect(listProductsQuerySchema.validate({ level: 'expert' }).error).toBeDefined();
  });

  it('aceita tags e rejeita min_price > max_price', () => {
    expect(listProductsQuerySchema.validate({ tags: 'marketing,digital' }).error).toBeUndefined();
    expect(
      listProductsQuerySchema.validate({ min_price: 100, max_price: 50 }).error,
    ).toBeDefined();
  });

  it('aceita sort válido e rejeita inválido', () => {
    expect(listProductsQuerySchema.validate({ sort: 'price_asc' }).error).toBeUndefined();
    expect(listProductsQuerySchema.validate({ sort: 'banana' }).error).toBeDefined();
  });

  it('sem filtros → sem erro (retrocompatível)', () => {
    expect(listProductsQuerySchema.validate({}).error).toBeUndefined();
  });
});