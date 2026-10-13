import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';
import type { UsersRepository } from './users.repository.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';

const TENANT = '11111-1111-1111-1111-111';

function makeRepo(): UsersRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    countAdmins: vi.fn().mockResolvedValue(1),
    insert: vi.fn().mockImplementation((v) => Promise.resolve({ ...v, ativo: true })),
    update: vi.fn().mockImplementation((id, _t, v) => Promise.resolve({ id, ...v })),
  } as unknown as UsersRepository;
}

const auth = {
  auth: {
    admin: {
      createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }),
      deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
} as unknown as import('@supabase/supabase-js').SupabaseClient;

let repo: UsersRepository;
let service: UsersService;

beforeEach(() => {
  repo = makeRepo();
  service = new UsersService(repo, auth);
});

describe('UsersService.create', () => {
  it('rejeita email duplicado no tenant', async () => {
    vi.mocked(repo.findByEmail).mockResolvedValue({ id: 'x' } as never);
    await expect(
      service.create(TENANT, { nome: 'A', email: 'a@b.c', role: 'user', password: '12345678' }),
    ).rejects.toThrow(ConflictError);
  });

  it('faz rollback do auth user se insert do perfil falhar', async () => {
    vi.mocked(repo.insert).mockRejectedValue(new Error('db fail'));
    await expect(
      service.create(TENANT, { nome: 'A', email: 'a@b.c', role: 'user', password: '12345678' }),
    ).rejects.toThrow('db fail');
    expect(auth.auth.admin.deleteUser).toHaveBeenCalledWith('auth-1');
  });
});

describe('UsersService.update', () => {
  it('bloqueia rebaixar o último admin ativo', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'u1', role: 'admin', ativo: true } as never);
    vi.mocked(repo.countAdmins).mockResolvedValue(0);
    await expect(service.update('u1', TENANT, { role: 'editor' })).rejects.toThrow(ConflictError);
    await expect(service.update('u1', TENANT, { ativo: false })).rejects.toThrow(ConflictError);
  });

  it('permite se existe outro admin', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'u1', role: 'admin', ativo: true } as never);
    vi.mocked(repo.countAdmins).mockResolvedValue(2);
    await expect(service.update('u1', TENANT, { role: 'editor' })).resolves.toBeDefined();
  });

  it('404 quando usuário não existe no tenant', async () => {
    await expect(service.update('nope', TENANT, { nome: 'X' })).rejects.toThrow(NotFoundError);
  });
});

describe('UsersService.delete (soft)', () => {
  it('desativa e nunca chama auth.deleteUser', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'u1', role: 'user', ativo: true } as never);
    await service.delete('u1', TENANT);
    expect(repo.update).toHaveBeenCalledWith('u1', TENANT, { ativo: false });
    expect(auth.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('bloqueia desativar o último admin', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ id: 'u1', role: 'admin', ativo: true } as never);
    vi.mocked(repo.countAdmins).mockResolvedValue(0);
    await expect(service.delete('u1', TENANT)).rejects.toThrow(ConflictError);
  });
});
