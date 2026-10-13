import type { ProductCategory } from './productCategories.types.js';

export interface CreateProductCategoryInput {
  nome: string;
  slug?: string;
  descricao?: string;
  parent_id?: string;
  display_order?: number;
}

export interface UpdateProductCategoryInput {
  nome?: string;
  slug?: string;
  descricao?: string | null;
  parent_id?: string | null;
  display_order?: number;
  status?: 'active' | 'archived';
}

export type ProductCategoryDto = Omit<ProductCategory, 'tenant_id'>;
