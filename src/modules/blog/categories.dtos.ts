import type { BlogCategory } from './categories.types.js';

export interface CreateBlogCategoryInput {
  nome: string;
  slug?: string;
  descricao?: string;
  parent_id?: string;
  display_order?: number;
}

export interface UpdateBlogCategoryInput {
  nome?: string;
  slug?: string;
  descricao?: string | null;
  parent_id?: string | null;
  display_order?: number;
  status?: 'active' | 'archived';
}

export type BlogCategoryDto = Omit<BlogCategory, 'tenant_id'>;
