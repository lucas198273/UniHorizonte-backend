import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogPostProductsService } from './postProducts.service.js';
import type { BlogPostProductsRepository } from './postProducts.repository.js';
import type { BlogPostsRepository } from './posts.repository.js';
import type { ProductsRepository } from '../products/products.repository.js';
import { NotFoundError, ValidationError } from '../../shared/errors/index.js';

const TENANT = '11111-1111-1111-1111-111';

function makeLinksRepo(): BlogPostProductsRepository {
  return {
    listByPost: vi.fn().mockResolvedValue([]),
    associate: vi.fn().mockResolvedValue(undefined),
    dissociate: vi.fn().mockResolvedValue(undefined),
  } as unknown as BlogPostProductsRepository;
}

const postsRepo = { findById: vi.fn().mockResolvedValue({ id: 'p1' }) } as unknown as BlogPostsRepository;
const productsRepo = { findById: vi.fn().mockResolvedValue({ id: 'pr1' }) } as unknown as ProductsRepository;

let links: BlogPostProductsRepository;
let service: BlogPostProductsService;

beforeEach(() => {
  links = makeLinksRepo();
  vi.mocked(postsRepo.findById).mockResolvedValue({ id: 'p1' } as never);
  vi.mocked(productsRepo.findById).mockResolvedValue({ id: 'pr1' } as never);
  service = new BlogPostProductsService(links, postsRepo, productsRepo);
});

describe('BlogPostProductsService.associate', () => {
  it('valida que produto pertence ao tenant', async () => {
    vi.mocked(productsRepo.findById).mockResolvedValue(null as never);
    await expect(service.associate('p1', TENANT, ['pr-errado']))
      .rejects.toThrow(ValidationError);
  });

  it('associa produtos do mesmo tenant (dedupe)', async () => {
    await service.associate('p1', TENANT, ['pr1', 'pr1']);
    expect(links.associate).toHaveBeenCalledWith('p1', TENANT, ['pr1']);
  });

  it('404 quando post não existe no tenant', async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null as never);
    await expect(service.associate('nope', TENANT, ['pr1'])).rejects.toThrow(NotFoundError);
  });
});

describe('BlogPostProductsService.dissociate', () => {
  it('404 quando produto não existe no tenant', async () => {
    vi.mocked(productsRepo.findById).mockResolvedValue(null as never);
    await expect(service.dissociate('p1', 'pr-errado', TENANT)).rejects.toThrow(NotFoundError);
  });

  it('desassocia produto válido', async () => {
    await expect(service.dissociate('p1', 'pr1', TENANT)).resolves.toBeUndefined();
  });
});

describe('BlogPostProductsRepository.listByPost — guard de imagens', () => {
  function makeDb(rows: { products: unknown }[]) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows }),
    };
    return { from: vi.fn().mockReturnValue(chain) } as never;
  }

  async function run(rows: { products: unknown }[]) {
    const { BlogPostProductsRepository } = await import('./postProducts.repository.js');
    const repo = new BlogPostProductsRepository(makeDb(rows));
    return repo.listByPost('p1', TENANT, false);
  }

  it('normaliza images="" para array vazio', async () => {
    const result = await run([{ products: { id: 'pr1', images: '' } }]);
    expect(result[0]).toEqual({ id: 'pr1', images: [] });
  });

  it('normaliza images=null para array vazio', async () => {
    const result = await run([{ products: { id: 'pr2', images: null } }]);
    expect(result[0]).toEqual({ id: 'pr2', images: [] });
  });

  it('preserva array de imagens válido', async () => {
    const imgs = [{ url: 'https://x/y.png', displayOrder: 0 }];
    const result = await run([{ products: { id: 'pr3', images: imgs } }]);
    expect(result[0]?.images).toEqual(imgs);
  });
});
