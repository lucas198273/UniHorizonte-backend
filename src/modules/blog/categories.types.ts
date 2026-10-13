export interface BlogCategory {
  id: string;
  tenant_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  parent_id: string | null;
  display_order: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

// Categoria com contagem de posts publicados (listagem pública).
// Retrocompatível: estende BlogCategory, só adiciona post_count.
export interface BlogCategoryWithCount extends BlogCategory {
  post_count: number;
}
