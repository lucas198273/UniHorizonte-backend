import { randomUUID } from 'node:crypto';
import { ValidationError } from '../errors/ValidationError.js';
import { validateImage } from '../upload/validateImage.js';
import { EXTENSION_BY_MIME } from '../upload/constants.js';
import type { SupabaseStorageRepository } from './SupabaseStorageRepository.js';

export interface UploadedImage {
  url: string;
  path: string;
  size: number;
  mimetype: string;
}

export class StorageService {
  constructor(private readonly repo: SupabaseStorageRepository) {}

  async uploadImage(
    bucket: string,
    tenantId: string,
    buffer: Buffer,
    maxSizeBytes: number,
  ): Promise<UploadedImage> {
    const { mimetype } = validateImage(buffer, maxSizeBytes);

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    const ext = EXTENSION_BY_MIME[mimetype];
    const filename = `${randomUUID()}.${ext}`;
    const path = `${tenantId}/${year}/${month}/${filename}`;

    const { publicUrl } = await this.repo.upload(bucket, path, buffer, mimetype);

    return {
      url: publicUrl,
      path,
      size: buffer.length,
      mimetype,
    };
  }

  async deleteImage(bucket: string, tenantId: string, path: string): Promise<void> {
    // Segurança: só permite deletar paths do próprio tenant
    if (!path.startsWith(`${tenantId}/`)) {
      throw new ValidationError('Path não pertence a este tenant');
    }
    await this.repo.remove(bucket, path);
  }
}
