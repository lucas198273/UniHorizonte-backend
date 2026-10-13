# Architecture — backend-cm1.0

Multi-tenant CMS backend (Blog, Products, Users) sobre **Node.js + Express 5 + TypeScript (ESM, strict)** + **Supabase** (Postgres, Auth, Storage), com validação **Joi** e testes **Vitest**.

## 1. Estrutura do projeto

```
src/
├── app.ts                    # composição do Express (middlewares + rotas)
├── index.ts                  # listen + shutdown gracioso
├── config/
│   ├── env.ts                # valida .env no boot, exporta tipado
│   └── supabase.ts           # cliente único (service-role)
├── shared/
│   ├── errors/               # AppError + subclasses (400/401/403/404/409)
│   ├── http/                 # ok()/fail() + ApiResponse<T>, PaginatedData<T>
│   ├── middleware/           # auth, tenant, resolveTenant, requireRole, validate, cors, errorHandler, notFound
│   ├── validation/           # schemas comuns (uuid, slug, pagination)
│   ├── logger.ts
│   ├── pagination/           # parsePagination, buildMeta
│   ├── storage/               # SupabaseStorageRepository + StorageService (upload de imagens)
│   ├── upload/                # constants (MIME/ext) + validateImage (magic bytes)
│   └── utils/                # slug, uuid
├── modules/
│   ├── users.*               # domínio Users (flat)
│   ├── blog/                 # posts.* + categories.* + postProducts.*
│   └── products/             # products.* + productCategories.*
└── types/express.d.ts        # req.user / req.tenantId / req.role
supabase/
├── migrations/0001_initial.sql
└── seed.sql
```

Cada domínio segue o mesmo padrão de arquivos: `types`, `dtos`, `validation` (Joi), `repository` (Supabase), `service` (regras), `routes` (endpoint+middlewares), `*.test.ts` (unitários do service).

## 2. Responsabilidade de cada camada

| Camada | Faz | Não faz |
|--------|-----|---------|
| Route | Endpoint, middlewares, controller | Lógica, banco |
| Middleware | Auth, tenant, role, validação, CORS, erros | Regra de domínio |
| Controller | Lê `req`, chama service, responde `ok()`/`fail()` | Regra, Supabase, try/catch |
| Service | Regras (slug, publicação, associação), lança `AppError` | HTTP, supabase direto |
| Repository | Supabase + filtro `tenant_id` | Regra de negócio |

## 3. Fluxo de uma requisição

```
HTTP → Route → [auth/tenant/role/validate] → Controller → Service → Repository → Supabase
```

Sucesso: `{ success: true, data, message }`. Erro: service lança `AppError` → Express 5 encaminha ao `errorHandler` (último middleware) → `{ success: false, data: null, message }`.

## 4. Multi-tenancy

- Toda entidade tem `tenant_id`; todo repository recebe `tenantId` por parâmetro e filtra.
- `tenantId` **nunca** vem do body/query: vem do JWT (`app_metadata.tenant_id`) em rotas autenticadas (`authMiddleware`), ou do header **`X-Tenant-Slug`** em rotas públicas (`resolveTenantBySlug` — resolve o slug em `tenants` e valida `status = active`).
- RLS é segunda camada (protege acesso client-side direto); o backend usa service-role e depende do filtro no repository.

## 5. Blog

**Categories** (`/api/blog/categories`): públicas listam/buscam por slug apenas `active`; admin CRUD (`admin|editor`). Slug único por tenant; `parent_id` do mesmo tenant e não pode auto-referenciar; delete bloqueado quando há posts com `category_id = id` no tenant (409) — `?force=true` contorna.

**Posts** (`/api/blog/posts`): públicas só `published` (list paginada com `category`/`tag`/`featured`, get por slug). Admin CRUD com:
- slug único por tenant (service gera de `title` se não vier);
- categoria do mesmo tenant;
- `published`: `draft→published` seta `published_at` (se vazio); voltar a draft/arquivado **mantém** `published_at`;
- tags normalizadas (lowercase, trim, sem duplicatas).

**Associação post↔products** (`/api/blog/posts/:id/products`): POST associa `product_ids[]` (validados no mesmo tenant, dedupe), GET lista, DELETE por produto. CASCADE no banco. Delete de post/produto com vínculo em `blog_post_products` é bloqueado (409) — `?force=true` contorna.

## 6. Products

**Categories** (`/api/products/categories`): idênticas às de blog, tabela separada.
**Products** (`/api/products`): públicas só `active` (paginado, `category`, `commercialType`); `GET /admin/list` para admin ver todos os status. Regras: slug único por tenant; SKU único por tenant (opcional, índice parcial); `preco > 0` se informado; `commercial_type ∈ {PICKUP, ECOMMERCE}`; `images` jsonb `[{url, alt?, displayOrder}]`; `featured` boolean (default `false`, índice parcial `tenant_id, featured where featured`). DELETE só `admin`, bloqueado quando o produto está associado a posts (409) — `?force=true` contorna.

**Upload de imagens** (`/api/blog/upload` e `/api/products/upload`): POST `multipart/form-data` campo `file` (máx `MAX_UPLOAD_SIZE_MB`, default 5 MB; formatos JPEG/PNG/WebP/AVIF/GIF validados por magic bytes) e DELETE por `path` no body. Buckets `blog-images` / `product-images` (env `BLOG_STORAGE_BUCKET` / `PRODUCT_STORAGE_BUCKET`). Path gerado: `{tenantId}/{ano}/{mês}/{uuid}.{ext}` (isolamento por tenant, cache imutável de 1 ano). Delete valida que o path pertence ao tenant. Admin/editor; `MulterError` traduzido no errorHandler.

**Bloqueio de exclusão com associações** (todas com `?force=true` para contornar, senão 409 `ConflictError`):
- Categoria de blog com posts no tenant (conta todos os posts com `category_id = id`).
- Categoria de produto com produtos no tenant (conta todos os produtos com `category_id = id`).
- Post com linhas em `blog_post_products` (`post_id = id`).
- Produto com linhas em `blog_post_products` (`product_id = id`).

## 7. Users (`/api/users`)

| Método | Rota | Role | Descrição |
|---|---|---|---|
| GET | `/me` | qualquer | perfil do logado |
| GET | `/` | admin | lista paginada |
| GET | `/:id` | admin | detalhe |
| POST | `/` | admin | cria em `auth.users` + `usuarios` (rollback manual se insert falhar) |
| PUT | `/:id` | admin | nome/role/ativo — bloqueia rebaixar/desativar o **último admin ativo** |
| DELETE | `/:id` | admin | **soft delete** (`ativo=false`); nunca apaga do auth.users |

## 8. Supabase

- **Migrations** em `supabase/migrations/` — rodar manualmente no SQL Editor (não são executadas pelo código).
- **Seed**: `supabase/seed.sql` cria tenant `default`.
- **RLS**: habilitado em todas as tabelas; policies leem `app_metadata.tenant_id` via `current_tenant_id()`. Leitura pública só de conteúdo publicado/ativo.
- **Buckets**: `blog-images` e `product-images` criados (públicos) na migration.
- **Auth**: login/signup ficam no cliente (Supabase SDK). O backend só valida o JWT (`supabase.auth.getUser(token)`). O `app_metadata` (tenant_id, role) é editado apenas por admins no Supabase — definir para o primeiro usuário admin manualmente.

## 9. Como criar um novo módulo

1. `modules/<domínio>/<entidade>.types.ts` (shape da linha do banco), `.dtos.ts` (entrada/saída), `.validation.ts` (Joi).
2. `repository`: recebe `SupabaseClient` no construtor; **toda** query com `.eq('tenant_id', tenantId)`.
3. `service`: injeta o(s) repository(s), lança erros de `shared/errors`, testa regras com mock.
4. `routes`: Router com middlewares na ordem `resolveTenantBySlug()` (públicas) ou `authMiddleware → tenantMiddleware → requireRole([...])` (admin) → `validateBody/Query` → controller inline chamando service e `ok()/fail()`.
5. Monte o Router em `app.ts` sob `/api/...`.
6. Adicione `*.test.ts` do service (mock do repository com `vi.fn()`).

## 10. Como executar e testar

```bash
cp .env.example .env    # preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev             # tsx watch
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
npm test                # vitest run
npm run build && npm start
```

## 11. Próximos passos (Etapa 11 — quando necessário)

- Revisar índices com queries reais; cache seletivo (node-cache); rate limiting; upload funcional em `shared/storage` (interface e buckets já prontos).

## 11.1 Correções aplicadas

- **2026-10-04** — Campo `featured` em produtos (types/DTOs/validation + coluna `products.featured` com índice parcial em `tenant_id, featured`); bloqueio de exclusão com associações nas 4 entidades (categorias de blog/produto, posts, produtos) via `ConflictError` 409, contornável com `?force=true`; contadores adicionados nos repositories (`countPostsByCategory`, `countProductsByCategory`, `countByPost`, `countByProduct`).
- **2026-10-04** — Upload de imagens: `shared/storage/SupabaseStorageRepository` (wrapper do Supabase Storage) + `shared/storage/StorageService` (uploadImage/deleteImage) + `shared/upload/` (constants, validateImage com magic bytes JPEG/PNG/WebP/AVIF/GIF). Rotas `POST/DELETE /api/blog/upload` e `/api/products/upload` (multer memoryStorage, admin/editor). Env: `BLOG_STORAGE_BUCKET`, `PRODUCT_STORAGE_BUCKET`, `MAX_UPLOAD_SIZE_MB`. `MulterError` traduzido no errorHandler. 11 testes em `StorageService.test.ts`.

## 12. Padrão de middlewares por tipo de rota

### Rotas públicas (leitura)

`optionalAuth` → `resolveTenantBySlugIfAnonymous()` → `validateQuery` → handler

- `optionalAuth`: tenta validar Bearer; credencial inválida/ausente segue como anônimo (não bloqueia).
- `resolveTenantBySlugIfAnonymous()`: se `req.user`/`req.tenantId` ainda vazios, resolve tenant pelo header `X-Tenant-Slug`; se o Bearer já resolveu, pula.
- Sem `tenantMiddleware`/`requireRole` — é a leitura pública, com filtro published/active no service.

### Rotas autenticadas (escrita/admin)

`authMiddleware` → `tenantMiddleware` → `requireRole([...])` → `validateBody`/`validateQuery` → handler

OU, quando a rota também pode herdar tenant do header (fallback por slug):

`optionalAuth` → `resolveTenantBySlugIfAnonymous()` → `tenantMiddleware` → `requireRole([...])` → `validateBody`/`validateQuery` → handler

Regras:

- Toda rota autenticada DEVE ter auth — via `authMiddleware` estrito OU via `optionalAuth` + `requireRole` (é o `requireRole` quem protege de verdade: sem `req.user`, responde 401 `Authentication required`).
- Toda rota autenticada DEVE ter `tenantMiddleware` imediatamente após o auth — simétrico em todos os módulos.
- `tenantMiddleware` garante `req.tenantId` populado; se não estiver, responde 401 `Tenant not resolved`.
- `authMiddleware` estrito exige `app_metadata.tenant_id` no JWT (401 `Token has no tenant association` caso contrário). A variante `optionalAuth → resolveTenantBySlugIfAnonymous → tenantMiddleware → requireRole` admite token sem tenant desde que o header `X-Tenant-Slug` resolva o tenant — a validação de role continua em `requireRole`.
- Não misture os dois padrões dentro do mesmo módulo sem motivo documentado; ao criar rota nova, copie o padrão de rota equivalente no mesmo arquivo.

### Estado atual (auditado)

- `blog/posts` e `products`: públicas com `optionalAuth → resolveTenantBySlugIfAnonymous`, admin com `authMiddleware → tenantMiddleware → requireRole`; `GET /api/products/admin/list` usa a variante com fallback por slug (`optionalAuth → resolveTenantBySlugIfAnonymous → tenantMiddleware → requireRole`).
- `blog/categories` e `products/categories`: públicas idênticas; admin com `authMiddleware → tenantMiddleware → requireRole`.
- `users`: todas autenticadas com `authMiddleware → tenantMiddleware` (`/me` sem `requireRole` — qualquer role autenticada; demais exigem `admin`).
