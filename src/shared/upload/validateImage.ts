import { ValidationError } from '../errors/ValidationError.js';
import { ALLOWED_MIME_TYPES, type AllowedMimeType } from './constants.js';

// Assinaturas de magic bytes para os formatos aceitos.
const SIGNATURES: Array<{ mime: AllowedMimeType; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

// Detecta o tipo real pelo conteúdo (não confia no mimetype do cliente).
export function detectMimeFromBytes(buffer: Buffer): AllowedMimeType | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // AVIF: bytes 4-11 = "ftypavif" ou "ftypavis"
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    (buffer.toString('ascii', 8, 12) === 'avif' ||
     buffer.toString('ascii', 8, 12) === 'avis')
  ) {
    return 'image/avif';
  }

  return null;
}

export function validateImage(
  buffer: Buffer,
  maxSizeBytes: number,
): { mimetype: AllowedMimeType } {
  if (buffer.length === 0) {
    throw new ValidationError('Arquivo vazio');
  }
  if (buffer.length > maxSizeBytes) {
    throw new ValidationError(
      `Arquivo maior que ${Math.floor(maxSizeBytes / 1024 / 1024)} MB`,
    );
  }

  const mime = detectMimeFromBytes(buffer);
  if (!mime) {
    throw new ValidationError(
      `Formato não suportado. Aceitos: ${ALLOWED_MIME_TYPES.join(', ')}`,
    );
  }

  return { mimetype: mime };
}
