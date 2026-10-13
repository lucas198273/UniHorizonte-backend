import type { SupabaseClient } from '@supabase/supabase-js';

export interface UploadResult {
  path: string;      // ex: "tenant-id/2026/10/uuid.jpg"
  publicUrl: string; // URL pública completa
}

// Wrapper fino em volta do Supabase Storage.
export class SupabaseStorageRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Extrai o path de uma URL pública do Supabase Storage.
   * Retorna null se a URL não pertencer ao bucket indicado
   * (ex.: Unsplash, Cloudinary, outro bucket/outro projeto).
   */
  extractPathFromPublicUrl(publicUrl: string, bucket: string): string | null {
    const marker = `/object/public/${bucket}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    const path = publicUrl.slice(idx + marker.length);
    // Path não pode estar vazio nem conter query string/fragmento.
    if (path === '' || path.includes('?') || path.includes('#')) return null;
    return decodeURIComponent(path);
  }

  async upload(
    bucket: string,
    path: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<UploadResult> {
    const { error } = await this.db.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: mimetype,
        upsert: false,
        cacheControl: '31536000', // 1 ano — arquivos são imutáveis (uuid)
      });
    if (error) throw error;

    const { data } = this.db.storage.from(bucket).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  async remove(bucket: string, path: string): Promise<void> {
    const { error } = await this.db.storage.from(bucket).remove([path]);
    if (error) throw error;
  }
}
