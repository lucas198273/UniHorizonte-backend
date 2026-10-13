import type { Product, ProductKind, ProductLevel, ProductModality } from './products.types.js';
import type { PaginatedData } from '../../shared/http/types.js';

export interface CreateProductInput {
  nome: string;
  slug?: string;
  sku?: string;
  descricao?: string;
  preco?: number;
  category_id?: string | null;
  images?: { url: string; alt?: string; displayOrder?: number }[];
  status?: 'draft' | 'active' | 'archived';
  display_order?: number;
  featured?: boolean;
  meta_title?: string;
  meta_description?: string;

  // Campos de curso
  kind?: ProductKind; // default 'course' no banco
  modality?: ProductModality | null;
  workload_hours?: number | null;
  duration_months?: number | null;
  level?: ProductLevel | null;
  certification?: boolean;
  certification_name?: string | null;
  start_date?: string | null;
  enrollment_deadline?: string | null;
  syllabus?: string | null;
  requirements?: string | null;
  coordinator_name?: string | null;
  coordinator_bio?: string | null;
  coordinator_photo_url?: string | null;
  video_url?: string | null;
  tags?: string[];
}

export interface UpdateProductInput {
  nome?: string;
  slug?: string;
  sku?: string | null;
  descricao?: string | null;
  preco?: number | null;
  category_id?: string | null;
  images?: { url: string; alt?: string; displayOrder?: number }[];
  status?: 'draft' | 'active' | 'archived';
  display_order?: number;
  featured?: boolean;
  meta_title?: string | null;
  meta_description?: string | null;

  // Campos de curso
  kind?: ProductKind;
  modality?: ProductModality | null;
  workload_hours?: number | null;
  duration_months?: number | null;
  level?: ProductLevel | null;
  certification?: boolean;
  certification_name?: string | null;
  start_date?: string | null;
  enrollment_deadline?: string | null;
  syllabus?: string | null;
  requirements?: string | null;
  coordinator_name?: string | null;
  coordinator_bio?: string | null;
  coordinator_photo_url?: string | null;
  video_url?: string | null;
  tags?: string[];
}

export type ProductDto = Omit<Product, 'tenant_id'>;
export type PaginatedProducts = PaginatedData<ProductDto>;
