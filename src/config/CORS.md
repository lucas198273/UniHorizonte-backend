# Configuração de CORS

Toda a configuração de CORS vive em **`src/config/cors.ts`** — não espalhes lógica de CORS por outros ficheiros.

## O que está definido

- **Rotas permitidas (whitelist)** — `CORS_ROUTES`: `/api/users`, `/api/blog`, `/api/products` (mount points reais em `src/app.ts`). Pedidos a rotas fora da whitelist não recebem headers CORS e são bloqueados pelo navegador.
- **Origens permitidas** — lidas da variável de ambiente `CORS_ORIGINS` (separadas por vírgula). Em desenvolvimento, `http://localhost:*` também é aceite; em produção, apenas os domínios configurados.
- **Métodos** — `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (sem `*`).
- **Headers** — `Content-Type`, `Authorization`, `Accept`, `x-tenant-slug`. O `x-tenant-slug` está na whitelist porque o frontend o envia em **todas** as requisições para identificar a loja/tenant ativa (multi-tenant); sem ele, o preflight devolve `Access-Control-Allow-Headers` sem esse header e o navegador bloqueia o pedido real.
- **Credentials** — `false` (a API autentica via header `Authorization`/JWT, não cookies). Muda para `true` só se passares a usar cookies/sessão — e nesse caso **nunca** uses `origin: '*'`.
- **Preflight** — `OPTIONS` tratado pelo middleware `cors`, com `maxAge: 86400` (cache de 24h).

## Como adicionar/remover rotas permitidas

Edita o array `CORS_ROUTES` em `src/config/cors.ts` (documento — não condiciona o middleware):

```ts
export const CORS_ROUTES = [
  '/api/users',
  '/api/blog',
  '/api/products',
  '/api/novo-modulo', // ← documentação do mount point usado em app.ts
] as const;
```

> O middleware CORS corre globalmente (`app.use(corsMiddleware)`); o controlo de
> segurança é pela whitelist de origens (`CORS_ORIGINS`). Nunca uses `origin: '*'`

## Como configurar as origens por ambiente

No `.env` (ou nas variáveis de ambiente do deploy):

```bash
# Desenvolvimento (fallback: http://localhost:3000 se não definir nada)
CORS_ORIGINS=http://localhost:3000

# Produção
CORS_ORIGINS=https://app.exemplo.com,https://staging.exemplo.com
```

Origens desconhecidas são rejeitadas com `callback(null, false)` (não derrubam o servidor) e registadas no log: `CORS: origem não autorizada`.

## Integração (src/app.ts)

```ts
import { corsMiddleware } from './config/cors.js';
app.use(corsMiddleware); // ← antes das rotas
```
