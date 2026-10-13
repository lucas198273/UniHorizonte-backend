import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from './users.types.js';
import type { UpdateUserInput } from './users.dtos.js';
import type { Pagination } from '../../shared/pagination/pagination.js';

// Só persistência. Toda query filtra por tenant_id.
export class UsersRepository {
  constructor(private readonly db: SupabaseClient) { }

  async findById(id: string, tenantId: string): Promise<UserProfile | null> {
    const { data } = await this.db
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as UserProfile | null) ?? null;
  }

  async findMeById(id: string, tenantId: string): Promise<UserProfile | null> {
    const { data, error } = await this.db
      .from('usuarios')
      .select('id, tenant_id, nome, email, role, ativo, created_at, updated_at')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    return (data as UserProfile | null) ?? null;
  }

  async findByEmail(email: string, tenantId: string): Promise<UserProfile | null> {
    const { data } = await this.db
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as UserProfile | null) ?? null;
  }

  async list(tenantId: string, pagination: Pagination): Promise<{ items: UserProfile[]; total: number }> {
    const { data, count } = await this.db
      .from('usuarios')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(pagination.offset, pagination.offset + pagination.limit - 1);
    return { items: (data as UserProfile[] | null) ?? [], total: count ?? 0 };
  }

  async countAdmins(tenantId: string, excludeUserId?: string): Promise<number> {
    let query = this.db
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .eq('ativo', true);
    if (excludeUserId) query = query.neq('id', excludeUserId);
    const { count } = await query;
    return count ?? 0;
  }

  async insert(values: {
    id: string;
    tenant_id: string;
    nome: string;
    email: string;
    role: string;
  }): Promise<UserProfile> {
    const { data, error } = await this.db
      .from('usuarios')
      .insert(values)
      .select('*')
      .single();
    if (error) throw error;
    return data as UserProfile;
  }

  async update(id: string, tenantId: string, values: UpdateUserInput): Promise<UserProfile> {
    const { data, error } = await this.db
      .from('usuarios')
      .update(values)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return data as UserProfile;
  }
}
