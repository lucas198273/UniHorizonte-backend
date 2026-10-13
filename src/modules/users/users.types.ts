export type UserRole = 'admin' | 'editor' | 'user';

export interface UserProfile {
  id: string;
  tenant_id: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}
