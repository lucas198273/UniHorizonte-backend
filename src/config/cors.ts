import cors from 'cors';
import type { RequestHandler } from 'express';
import { env } from './env.js';
import { logger } from '../shared/logger.js';

// ---------------------------------------------------------------------------
// CORS — configuração centralizada (único local onde CORS é definido)
// ---------------------------------------------------------------------------

/**
 * Origens autorizadas — vindas da variável de ambiente CORS_ORIGINS
 * (separadas por vírgula). Em desenvolvimento cai para o frontend local.
 *
 * Ex.: CORS_ORIGINS="https://app.exemplo.com,https://staging.exemplo.com"
 */
export const ALLOWED_ORIGINS: string[] = env.corsOrigins;

/**
 * Whitelist de rotas que aceitam requisições cross-origin (DOCUMENTAÇÃO).
 * São os mount points reais da aplicação (ver src/app.ts).
 * Nota: o middleware já NÃO é condicionado por estas rotas — o CORS corre
 * globalmente e o controlo de segurança é feito pela whitelist de ORIGINS.
 * Cada entrada identifica claramente o módulo que expõe:
 */
export const CORS_ROUTES = [
  '/api/users', // módulo users (perfil, listagem admin, etc.)
  '/api/blog', // módulo blog (categorias, posts, upload)
  '/api/products', // módulo products (produtos, categorias, upload)
] as const;

/** Métodos realmente usados pelas rotas acima. */
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Headers essenciais para a API. */
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
  'x-tenant-slug', // multi-tenant: enviado pelo frontend em todas as requisições
];

export const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Permitir requests sem header Origin (curl, same-origin, health checks).
    if (!origin) return callback(null, true);
    // Em dev, além das origens configuradas, aceita o frontend local.
    const isDev = env.nodeEnv !== 'production';
    if (ALLOWED_ORIGINS.includes(origin) || (isDev && origin.startsWith('http://localhost:'))) {
      return callback(null, true);
    }
    // Rejeição explícita (não lançamos exceção para não derrubar o servidor)
    // + log para auditoria de tentativas não autorizadas.
    logger.warn('CORS: origem não autorizada', { origin });
    return callback(null, false);
  },
  methods: ALLOWED_METHODS,
  allowedHeaders: ALLOWED_HEADERS,
  // A API usa autenticação via header Authorization (JWT/Supabase), não cookies:
  // mantenho credentials:false (só mudar para true se passar a usar cookies/sessão).
  credentials: false,
  // Cache do preflight (OPTIONS) por 24h.
  maxAge: 86400,
};

/** Instância do middleware CORS. */
const corsHandler = cors(corsOptions);

/**
 * Middleware de CORS aplicado GLOBALMENTE (Opção A — recomendado).
 *
 * O controlo de segurança é sobre ORIGINS (dentro de corsOptions.origin);
 * condicionar o middleware por rota impediria preflights (OPTIONS) de chegar
 * ao corsHandler (req.path pode não corresponder ao path real dentro dos
 * routers) e bloquearia pedidos com headers como x-tenant-slug.
 *
 * CORS_ROUTES mantém-se apenas como documentação da superfície da API.
 *
 * Uso no app principal (antes das rotas):
 *
 *   import { corsMiddleware } from './config/cors.js';
 *   app.use(corsMiddleware); // ← antes de app.use('/api/...', ...)
 */
export const corsMiddleware: RequestHandler = corsHandler;
