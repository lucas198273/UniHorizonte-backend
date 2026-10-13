import type { UserProfile, UserRole } from '../users/users.types.js';
import type { PaginatedData } from '../../shared/http/types.js';

export interface CreateUserInput {
  nome: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface UpdateUserInput {
  nome?: string;
  role?: UserRole;
  ativo?: boolean;
}

// Nunca expõe tenant_id (implícito) nem dados de auth.
export type UserDto = Omit<UserProfile, 'tenant_id'>;
export type PaginatedUsers = PaginatedData<UserDto>;
