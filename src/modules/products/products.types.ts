export type ProductStatus = 'draft' | 'active' | 'archived';
export type ProductKind = 'product' | 'course';
export type ProductModality = 'presencial' | 'online' | 'hibrido';
export type ProductLevel = 'iniciante' | 'intermediario' | 'avancado';
export type ProductSort =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'name_desc'
  | 'display_order';

export interface ProductImage {
  url: string;
  alt?: string;
  displayOrder: number;
}

export interface Product {
  id: string;
  tenant_id: string;
  category_id: string | null;
  sku: string | null;
  nome: string;
  slug: string;
  descricao: string | null;
  preco: number | null;
  images: ProductImage[];
  status: ProductStatus;
  display_order: number;
  featured: boolean;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;

  // Campos de curso (migration 0002)
  kind: ProductKind;
  modality: ProductModality | null;
  workload_hours: number | null;
  duration_months: number | null;
  level: ProductLevel | null;
  certification: boolean;
  certification_name: string | null;
  start_date: string | null; // ISO date
  enrollment_deadline: string | null; // ISO date
  syllabus: string | null; // HTML sanitizado
  requirements: string | null;
  coordinator_name: string | null;
  coordinator_bio: string | null;
  coordinator_photo_url: string | null;
  video_url: string | null;
  tags: string[];
}
