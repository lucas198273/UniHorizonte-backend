import { ConflictError } from '../../shared/errors/ConflictError.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { buildMeta } from '../../shared/pagination/pagination.js';
import type { parsePagination } from '../../shared/pagination/pagination.js';
import type { UsersRepository } from './users.repository.js';
import type { CreateUserInput, PaginatedUsers, UpdateUserInput } from './users.dtos.js';
import type { UserProfile } from './users.types.js';

interface AuthAdminClient {
  auth: {
    admin: {
      createUser(attrs: {
        email: string;
        password: string;
        email_confirm?: boolean;
      }): Promise<{ data: { user: { id: string } | null }; error: Error | null }>;
      deleteUser(id: string): Promise<{ data: unknown; error: Error | null }>;
    };
  };
}

export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly auth: AuthAdminClient,
  ) {}

  async getMe(userId: string, tenantId: string): Promise<UserProfile> {
    const profile = await this.repo.findMeById(userId, tenantId);
    if (!profile) throw new NotFoundError('User profile not found');
    return profile;
  }

  async list(tenantId: string, pagination: ReturnType<typeof parsePagination>): Promise<PaginatedUsers> {
    const { items, total } = await this.repo.list(tenantId, pagination);
    return { items, meta: buildMeta(total, pagination.page, pagination.limit) };
  }

  async getById(id: string, tenantId: string): Promise<UserProfile> {
    const profile = await this.repo.findById(id, tenantId);
    if (!profile) throw new NotFoundError('User not found');
    return profile;
  }

  async create(tenantId: string, input: CreateUserInput): Promise<UserProfile> {
    if (await this.repo.findByEmail(input.email, tenantId)) {
      throw new ConflictError(`Email "${input.email}" already exists in this tenant`);
    }

    // Cria no auth.users; se o insert do perfil falhar, faz rollback do auth user.
    const { data, error } = await this.auth.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('Failed to create auth user');

    try {
      return await this.repo.insert({
        id: data.user.id,
        tenant_id: tenantId,
        nome: input.nome,
        email: input.email,
        role: input.role,
      });
    } catch (err) {
      await this.auth.auth.admin.deleteUser(data.user.id);
      throw err;
    }
  }

  async update(id: string, tenantId: string, input: UpdateUserInput): Promise<UserProfile> {
    const current = await this.repo.findById(id, tenantId);
    if (!current) throw new NotFoundError('User not found');

    // Não permite rebaixar o último admin ativo do tenant.
    const demoting =
      (input.role && input.role !== 'admin') || input.ativo === false;
    if (current.role === 'admin' && current.ativo && demoting) {
      const otherAdmins = await this.repo.countAdmins(tenantId, id);
      if (otherAdmins === 0) {
        throw new ConflictError('Cannot demote/deactivate the last active admin');
      }
    }

    return this.repo.update(id, tenantId, input);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    // Soft delete: nunca apaga do auth.users sem confirmação explícita.
    const current = await this.repo.findById(id, tenantId);
    if (!current) throw new NotFoundError('User not found');

    if (current.role === 'admin' && current.ativo) {
      const otherAdmins = await this.repo.countAdmins(tenantId, id);
      if (otherAdmins === 0) {
        throw new ConflictError('Cannot deactivate the last active admin');
      }
    }

    await this.repo.update(id, tenantId, { ativo: false });
  }
}
