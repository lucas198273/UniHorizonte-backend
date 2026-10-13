import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogPostsService } from './posts.service.js';
import type { BlogPostsRepository } from './posts.repository.js';
import type { BlogCategoriesRepository } from './categories.repository.js';
import type { BlogPostProductsRepository } from './postProducts.repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { StorageService } from '../../shared/storage/StorageService.js';
import { SupabaseStorageRepository } from '../../shared/storage/SupabaseStorageRepository.js';
import { env } from '../../config/env.js';

const TENANT = '11111-1111-1111-1111-111';

function makePostsRepo(): BlogPostsRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    insert: vi.fn().mockImplementation((v) => Promise.resolve({ id: 'new', ...v })),
    update: vi.fn().mockImplementation((id, _t, v) => Promise.resolve({ id, ...v })),
    delete: vi.fn().mockResolvedValue(undefined),
    countByCoverUrl: vi.fn().mockResolvedValue(0),
  } as unknown as BlogPostsRepository;
}

const categoriesRepo = {
  findById: vi.fn().mockResolvedValue({ id: 'cat-1' }),
  findBySlug: vi.fn().mockResolvedValue(null),
} as unknown as BlogCategoriesRepository;
const linksRepo = { countByPost: vi.fn().mockResolvedValue(0) } as unknown as BlogPostProductsRepository;

// Storage mocks (capa)
const BUCKET = env.blogStorageBucket;
const makeStorageRepo = () => {
  const repo = Object.create(SupabaseStorageRepository.prototype) as SupabaseStorageRepository;
  repo.extractPathFromPublicUrl = vi.fn((url: string, bucket: string) => {
    const marker = `/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  }) as SupabaseStorageRepository['extractPathFromPublicUrl'];
  return repo;
};
const storage = { deleteImage: vi.fn().mockResolvedValue(undefined) } as unknown as StorageService;

function makeService(repo: BlogPostsRepository): BlogPostsService {
  return new BlogPostsService(repo, categoriesRepo, linksRepo, storage, makeStorageRepo());
}

let repo: BlogPostsRepository;
let service: BlogPostsService;

beforeEach(() => {
  repo = makePostsRepo();
  service = makeService(repo);
  (storage.deleteImage as ReturnType<typeof vi.fn>).mockClear();
});

describe('BlogPostsService.create', () => {
  it('gera slug, normaliza tags e seta published_at', async () => {
    await service.create(TENANT, 'user-1', {
      title: 'Meu Post!! Novo',
      content: 'texto',
      status: 'published',
      tags: [' A', 'a', 'b '],
    });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'meu-post-novo',
        tags: ['a', 'b'],
        published_at: expect.any(String),
        created_by: 'user-1',
      }),
    );
  });

  it('published_at null para draft', async () => {
    await service.create(TENANT, null, { title: 'Rascunho', content: 'x' });
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ published_at: null }));
  });

  it('rejeita slug duplicado no tenant', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue({ id: 'x', slug: 'a' } as never);
    await expect(service.create(TENANT, null, { title: 'A', content: 'x', slug: 'a' }))
      .rejects.toThrow(ConflictError);
  });

  it('rejeita categoria de outro tenant', async () => {
    vi.mocked(categoriesRepo.findById).mockResolvedValue(null as never);
    await expect(
      service.create(TENANT, null, { title: 'P', content: 'x', category_id: 'other' }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('BlogPostsService sanitização de content', () => {
  it('create: remove <script>', async () => {
    await service.create(TENANT, null, {
      title: 'T',
      content: '<p>ok</p><script>alert(1)</script>',
    });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ content: '<p>ok</p>' }),
    );
  });

  it('create: remove onerror de <img>', async () => {
    await service.create(TENANT, null, {
      title: 'T',
      content: '<img src="https://x/y.png" onerror="alert(1)">',
    });
    const saved = vi.mocked(repo.insert).mock.calls[0]?.[0] as { content: string } | undefined;
    expect(saved?.content).not.toContain('onerror');
    expect(saved?.content).toContain('src="https://x/y.png"');
  });

  it('create: bloqueia href javascript:', async () => {
    await service.create(TENANT, null, {
      title: 'T',
      content: '<a href="javascript:alert(1)">link</a>',
    });
    const saved = vi.mocked(repo.insert).mock.calls[0]?.[0] as { content: string } | undefined;
    expect(saved?.content).not.toContain('javascript:');
  });

  it('create: preserva HTML válido', async () => {
    await service.create(TENANT, null, {
      title: 'T',
      content: '<p>texto</p><strong>bold</strong>',
    });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ content: '<p>texto</p><strong>bold</strong>' }),
    );
  });

  it('create: remove <iframe>', async () => {
    await service.create(TENANT, null, {
      title: 'T',
      content: '<p>a</p><iframe src="https://evil"></iframe>',
    });
    const saved = vi.mocked(repo.insert).mock.calls[0]?.[0] as { content: string } | undefined;
    expect(saved?.content).not.toContain('iframe');
  });

  it('update: sanitiza content quando presente', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', published_at: null } as never);
    await service.update('p1', TENANT, null, { content: '<s>riscado</s><script>x()</script>' });
    expect(repo.update).toHaveBeenCalledWith(
      'p1', TENANT, expect.objectContaining({ content: '<s>riscado</s>' }),
    );
  });

  it('update: não toca content quando ausente', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', published_at: null } as never);
    await service.update('p1', TENANT, null, { title: 'Só título' });
    const args = vi.mocked(repo.update).mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(args?.content).toBeUndefined();
  });
});

describe('BlogPostsService limpeza de capa (storage)', () => {
  const OLD_URL = `https://proj.supabase.co/storage/v1/object/public/${BUCKET}/tenant-1/2026/10/old.jpg`;
  const EXT_URL = 'https://images.unsplash.com/photo-1.jpg';

  it('update trocando capa → deleteImage chamado com path da URL antiga', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: OLD_URL } as never);
    await service.update('p1', 'tenant-1', null, { cover_image_url: 'https://x/new.png' });
    expect(storage.deleteImage).toHaveBeenCalledWith(BUCKET, 'tenant-1', 'tenant-1/2026/10/old.jpg');
  });

  it('update sem trocar capa → deleteImage NÃO chamado', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: OLD_URL } as never);
    await service.update('p1', 'tenant-1', null, { title: 'Outro título' });
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });

  it('update com URL externa → deleteImage NÃO chamado', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: EXT_URL } as never);
    await service.update('p1', 'tenant-1', null, { cover_image_url: null });
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });

  it('update com URL ainda usada por outro post → deleteImage NÃO chamado', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: OLD_URL } as never);
    vi.mocked(repo.countByCoverUrl).mockResolvedValue(2);
    await service.update('p1', 'tenant-1', null, { cover_image_url: 'https://x/new.png' });
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });

  it('delete de post com capa → deleteImage chamado antes do delete no banco', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: OLD_URL } as never);
    await service.delete('p1', 'tenant-1', false);
    expect(storage.deleteImage).toHaveBeenCalledWith(BUCKET, 'tenant-1', 'tenant-1/2026/10/old.jpg');
    expect(repo.delete).toHaveBeenCalled();
  });

  it('delete de post sem capa → deleteImage NÃO chamado', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: null } as never);
    await service.delete('p1', 'tenant-1', false);
    expect(storage.deleteImage).not.toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalled();
  });

  it('storage falha → operação segue e erro NÃO propaga', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: OLD_URL } as never);
    (storage.deleteImage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bucket down'));
    await expect(service.delete('p1', 'tenant-1', false)).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalled();
  });

  it('update de post sem capa anterior → deleteImage NÃO chamado', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', cover_image_url: null } as never);
    await service.update('p1', 'tenant-1', null, { cover_image_url: 'https://x/nova.png' });
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });
});

describe('BlogPostsService.update', () => {
  it('draft->published define published_at se ainda não tiver', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft', published_at: null } as never);
    await service.update('p1', TENANT, null, { status: 'published' });
    expect(repo.update).toHaveBeenCalledWith(
      'p1', TENANT, expect.objectContaining({ published_at: expect.any(String) }),
    );
  });

  it('published->draft mantém published_at (histórico)', async () => {
    const past = '2024-01-01T00:00:00Z';
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'published', published_at: past } as never);
    await service.update('p1', TENANT, null, { status: 'draft' });
    expect(repo.update).toHaveBeenCalledWith(
      'p1', TENANT, expect.objectContaining({ published_at: past }),
    );
  });

  it('404 quando post não existe', async () => {
    await expect(service.update('nope', TENANT, null, { title: 'X' })).rejects.toThrow(NotFoundError);
  });
});

describe('BlogPostsService.delete', () => {
  it('bloqueia delete com produtos associados sem force', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft' } as never);
    vi.mocked(linksRepo.countByPost).mockResolvedValue(2);
    await expect(service.delete('p1', TENANT, false)).rejects.toThrow(ConflictError);
  });

  it('permite delete com force=true', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft' } as never);
    vi.mocked(linksRepo.countByPost).mockResolvedValue(2);
    await expect(service.delete('p1', TENANT, true)).resolves.toBeUndefined();
  });
});

describe('BlogPostsService listagem pública', () => {
  it('getById público esconde não-publicados', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'p1', status: 'draft' } as never);
    await expect(service.getById('p1', TENANT, true)).rejects.toThrow(NotFoundError);
    await expect(service.getById('p1', TENANT, false)).resolves.toBeDefined();
  });
});

describe('BlogPostsService.list — filtro category (UUID ou slug)', () => {
  const UUID_CAT = '123e4567-e89b-42d3-a456-426614174000';

  it('category=UUID passa direto pro repo (retrocompatível)', async () => {
    await service.list(TENANT, {
      pagination: { page: 1, limit: 20, offset: 0 },
      categoryId: UUID_CAT,
      publishedOnly: true,
    } as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ categoryId: UUID_CAT }),
    );
    expect(categoriesRepo.findBySlug).not.toHaveBeenCalled();
  });

  it('category=slug resolve via findBySlug', async () => {
    vi.mocked(categoriesRepo.findBySlug).mockResolvedValue({ id: 'cat-9' } as never);
    await service.list(TENANT, {
      pagination: { page: 1, limit: 20, offset: 0 },
      categoryId: 'cidades-da-europa',
      publishedOnly: true,
    } as never);
    expect(categoriesRepo.findBySlug).toHaveBeenCalledWith('cidades-da-europa', TENANT);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ categoryId: 'cat-9' }),
    );
  });

  it('category=slug inexistente retorna lista vazia (total 0, sem 404)', async () => {
    vi.mocked(categoriesRepo.findBySlug).mockResolvedValue(null as never);
    const result = await service.list(TENANT, {
      pagination: { page: 1, limit: 20, offset: 0 },
      categoryId: 'nao-existe',
      publishedOnly: true,
    } as never);
    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('sem category não filtra por categoria', async () => {
    await service.list(TENANT, {
      pagination: { page: 1, limit: 20, offset: 0 },
      publishedOnly: true,
    } as never);
    expect(repo.list).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ categoryId: undefined }),
    );
    expect(categoriesRepo.findBySlug).not.toHaveBeenCalled();
  });
});
