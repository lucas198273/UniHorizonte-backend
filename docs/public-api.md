# Public API — backend-cm1.0

Documento canônico das rotas GET públicas consumidas pelo frontend.
Todas as rotas exigem header `X-Tenant-Slug`. Nenhuma exige `Authorization`.

> **Estado da validação (runtime):** as rotas abaixo foram testadas com o servidor rodando.
> Todas retornaram `401 {"success":false,"data":null,"message":"Unknown or inactive tenant"}`
> porque a migration `0001_initial.sql` e o `seed.sql` ainda não foram executados no Supabase
> (o `.env` aponta para o projeto real, mas o banco está sem o tenant `default`).
> A cadeia de middlewares confirma que **nenhuma exige JWT** — o 401 vem apenas da
> resolução do tenant. Assim que a migration rodar, o retorno esperado é `200`.
> Os exemplos de resposta abaixo são o **contrato extraído do código** (tipos + envelope),
> não cópias de curl com dados reais.

## Convenções

- **Base URL (dev):** `http://localhost:10000`
- **Header obrigatório:** `X-Tenant-Slug: <slug-do-tenant>` (ex.: `default`)
- **Contrato de resposta:** `{ success: boolean, data: T | null, message: string }`
- **Paginação:** `data` = `{ items: T[], meta: { page, limit, total, totalPages }`
- **Erros:** mesmo envelope com `success: false`, `data: null`, `message` descritivo

---

## Blog

### GET /api/blog/posts

Lista posts **publicados** do tenant, paginados.

**Query params:**

| Nome | Tipo | Obrigatório | Default | Descrição |
|------|------|-------------|---------|-----------|
| page | number | não | 1 | Página (mín 1) |
| limit | number | não | 20 | Itens por página (máx 100) |
| category | uuid | não | — | Filtra por `category_id` (uuid, não slug) |
| tag | string | não | — | Tag exata (lowercase, comparada via array contains) |
| featured | boolean | não | — | Somente destaques |

**Resposta:** `ApiResponse<PaginatedData<BlogPost>>`

**Exemplo:**

```bash
curl -s "http://localhost:10000/api/blog/posts?page=1&limit=10" \
  -H "X-Tenant-Slug: default"
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "tenant_id": "uuid",
        "category_id": "uuid | null",
        "title": "string",
        "slug": "string",
        "excerpt": "string | null",
        "content": "string",
        "cover_image_url": "string | null",
        "status": "published",
        "featured": false,
        "tags": ["string"],
        "meta_title": "string | null",
        "meta_description": "string | null",
        "og_image_url": "string | null",
        "published_at": "ISO date",
        "created_by": "uuid | null",
        "updated_by": "uuid | null",
        "created_at": "ISO date",
        "updated_at": "ISO date"
      }
    ],
    "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
  },
  "message": "OK"
}
```

> **Divergência do plano:** o plano do frontend previa `GET /api/blog/posts/slug/:slug`.
> O backend implementa **`GET /api/blog/posts/:idOrSlug`** — um único endpoint que aceita
> **uuid ou slug** no mesmo param. Use o slug; o uuid também funciona.

---

### GET /api/blog/posts/:idOrSlug

Detalhe de um post **publicado** por slug **ou uuid** (mesmo param). Não-publicados retornam 404.

**Path params:**

| Nome | Tipo | Descrição |
|------|------|-----------|
| idOrSlug | string | Slug do post (`meu-post`) ou uuid do post |

**Resposta:** `ApiResponse<BlogPost>`

```bash
curl -s "http://localhost:10000/api/blog/posts/meu-post" \
  -H "X-Tenant-Slug: default"
```

---

### GET /api/blog/posts/:id/products

> Rota não prevista no plano inicial — incluída por existir no backend.

Lista os produtos associados a um post (N:N), ordenados por `display_order`.
**Nota:** o `id` aqui é o **uuid** do post (o middleware público não faz lookup por slug neste caso — se passar slug, o service retorna 404). Os produtos retornados são **todos os associados, independente de status** (inclui `draft`/`archived`).

**Path params:**

| Nome | Tipo | Descrição |
|------|------|-----------|
| id | uuid | Id do post |

**Resposta:** `ApiResponse<Product[]>`

```bash
curl -s "http://localhost:10000/api/blog/posts/11111-1111-1111-1111-111/products" \
  -H "X-Tenant-Slug: default"
```

---

### GET /api/blog/categories

Lista categorias de blog **ativas** do tenant (ordenadas por `display_order`, depois `nome`).

**Query params:** nenhum.

**Resposta:** `ApiResponse<BlogCategory[]>`

```bash
curl -s "http://localhost:10000/api/blog/categories" \
  -H "X-Tenant-Slug: default"
```

---

### GET /api/blog/categories/:slugOrId

> Rota não prevista no plano inicial — incluída por existir no backend.

Detalhe de uma categoria de blog por slug ou uuid.

**Path params:**

| Nome | Tipo | Descrição |
|------|------|-----------|
| slugOrId | string | Slug (`eletronicos`) ou uuid |

**Resposta:** `ApiResponse<BlogCategory>`

```bash
curl -s "http://localhost:10000/api/blog/categories/eletronicos" \
  -H "X-Tenant-Slug: default"
```

---

## Produtos

### GET /api/products

Lista produtos **ativos** do tenant, paginados, ordenados por `display_order` depois `nome`.

**Query params:**

| Nome | Tipo | Obrigatório | Default | Descrição |
|------|------|-------------|---------|-----------|
| page | number | não | 1 | Página (mín 1) |
| limit | number | não | 20 | Itens por página (máx 100) |
| category | uuid | não | — | Filtra por `category_id` (uuid, não slug) |
| commercialType | "PICKUP" \| "ECOMMERCE" | não | — | Tipo comercial |

> **Divergência do plano:** o filtro é **`commercialType`** (camelCase), não `commercial_type`.

**Resposta:** `ApiResponse<PaginatedData<Product>>`

```bash
curl -s "http://localhost:10000/api/products?page=1&limit=10&commercialType=ECOMMERCE" \
  -H "X-Tenant-Slug: default"
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "tenant_id": "uuid",
        "category_id": "uuid | null",
        "sku": "string | null",
        "nome": "string",
        "slug": "string",
        "descricao": "string | null",
        "preco": 199.9,
        "commercial_type": "ECOMMERCE",
        "images": [{ "url": "https://...", "alt": "string?", "displayOrder": 0 }],
        "status": "active",
        "display_order": 0,
        "meta_title": "string | null",
        "meta_description": "string | null",
        "created_at": "ISO date",
        "updated_at": "ISO date"
      }
    ],
    "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
  },
  "message": "OK"
}
```

---

### GET /api/products/:idOrSlug

Detalhe de um produto **ativo** por slug **ou uuid**. Não-ativos retornam 404.

**Path params:**

| Nome | Tipo | Descrição |
|------|------|-----------|
| idOrSlug | string | Slug (`notebook-x`) ou uuid |

**Resposta:** `ApiResponse<Product>`

```bash
curl -s "http://localhost:10000/api/products/notebook-x" \
  -H "X-Tenant-Slug: default"
```

---

### GET /api/products/categories

Lista categorias de produtos **ativas** do tenant.

> **Divergência do plano:** o plano previa `/api/product-categories` (com hífen, na raiz).
> O backend monta em **`/api/products/categories`** (aninhada).

**Query params:** nenhum.

**Resposta:** `ApiResponse<ProductCategory[]>`

```bash
curl -s "http://localhost:10000/api/products/categories" \
  -H "X-Tenant-Slug: default"
```

---

### GET /api/products/categories/:slugOrId

> Rota não prevista no plano inicial — incluída por existir no backend.

Detalhe de uma categoria de produto por slug ou uuid.

**Resposta:** `ApiResponse<ProductCategory>`

```bash
curl -s "http://localhost:10000/api/products/categories/ferramentas" \
  -H "X-Tenant-Slug: default"
```

---

## Tipos compartilhados

Fonte: `src/modules/blog/posts.types.ts`, `src/modules/blog/categories.types.ts`,
`src/modules/products.types.ts`, `src/modules/products/productCategories.types.ts`,
`src/shared/http/HttpResponse.ts`, `src/shared/http/types.ts`, `src/shared/pagination/pagination.ts`.

```ts
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  meta: PaginatedMeta;
}

export interface BlogPost {
  id: string;
  tenant_id: string;
  category_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  status: 'draft' | 'published' | 'archived'; // público: sempre 'published'
  featured: boolean;
  tags: string[];
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogCategory {
  id: string;
  tenant_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  parent_id: string | null;
  display_order: number;
  status: 'active' | 'archived'; // público: sempre 'active'
  created_at: string;
  updated_at: string;
}

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
  commercial_type: 'PICKUP' | 'ECOMMERCE';
  images: ProductImage[];
  status: 'draft' | 'active' | 'archived'; // público: sempre 'active'
  display_order: number;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  tenant_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  parent_id: string | null;
  display_order: number;
  status: 'active' | 'archived'; // público: sempre 'active'
  created_at: string;
  updated_at: string;
}
```

---

## Checklist de verificação

- [x] Toda rota listada existe no código e foi testada em runtime (respondeu do servidor)
- [x] Nenhuma rota listada exige `Authorization` (cadeia confirmada no código; runtime devolveu 401 apenas por tenant não resolvido — banco sem migration/seed)
- [ ] **Pendente:** validação com `success: true` e dados reais — requer migration + seed executados e `.env` com chaves reais
- [x] Nenhuma rota de escrita listada
- [x] Tipos extraídos de `src/modules/**/*.types.ts` (não inventados)
- [ ] **Pendente:** exemplos de resposta com dados reais do curl (bloqueado pelo item acima)

## Problemas encontrados

- **Banco não inicializado:** todas as rotas públicas retornam `401 "Unknown or inactive tenant"` até `supabase/migrations/0001_initial.sql` + `seed.sql` serem executados. Não é bug de código.
- **`GET /api/blog/posts/:id/products` retorna produtos de qualquer status** (`draft`/`archived` incluídos) — o repositório não filtra por `status = 'active'` quando autenticado. Se o frontend público não deve ver rascunhos, este filtro precisa ser adicionado no `BlogPostProductsRepository.listByPost`.
- **RESOLVIDO: filtro `category` agora aceita UUID ou slug** — em posts (`/api/blog/posts?category=`) e produtos (`/api/products?category=`). Slug inexistente retorna lista vazia com `total: 0` (não 404). Retrocompatível com UUID.
- **RESOLVIDO: contagens por categoria** — `GET /api/blog/categories` retorna `post_count` (posts publicados) e `GET /api/products/categories` retorna `product_count` (produtos ativos) em cada item. Uma única query agrupada extra, sem N+1.
- **RESOLVIDO: `products[].images`** no endpoint de produtos do post — `listByPost` normaliza `images` não-array (ex.: string vazia, null) para `[]`.

## Rotas GET que NÃO são públicas (não listadas acima)

- `GET /api/products/admin/list` — exige `admin|editor` (ver todos os status).
- `GET /api/users`, `GET /api/users/:id` — exigem `admin`.
- `GET /api/users/me` — exige JWT (qualquer role).
- `GET /` — health check interno, fora de escopo.
