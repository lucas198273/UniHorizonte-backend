import type { BlogPost } from './posts.types.js';
import type { PaginatedData } from '../../shared/http/types.js';

export interface CreatePostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  cover_image_url?: string;
  status?: 'draft' | 'published' | 'archived';
  featured?: boolean;
  tags?: string[];
  category_id?: string | null;
  meta_title?: string;
  meta_description?: string;
  og_image_url?: string;
}

export interface UpdatePostInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content?: string;
  cover_image_url?: string | null;
  status?: 'draft' | 'published' | 'archived';
  featured?: boolean;
  tags?: string[];
  category_id?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  og_image_url?: string | null;
}

export type PostDto = Omit<BlogPost, 'tenant_id'>;
export type PaginatedPosts = PaginatedData<PostDto>;
