import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '10000')),
  corsOrigins: optional('CORS_ORIGINS', ''),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  blogStorageBucket: optional('BLOG_STORAGE_BUCKET', 'blog-images'),
  productStorageBucket: optional('PRODUCT_STORAGE_BUCKET', 'product-images'),
  maxUploadSizeMb: Number(optional('MAX_UPLOAD_SIZE_MB', '5')),

  // Origens CORS já parseadas (ver src/config/cors.ts)
  corsOrigins: optional('CORS_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
} as const;