# Guia de Consumo da API — backend-cm1.0

## Sumário

- [1. Visão geral](#1-visão-geral)
- [2. Autenticação](#2-autenticação)
- [3. Header de tenant (rotas públicas)](#3-header-de-tenant-rotas-públicas)
- [4. Contrato de resposta (todas as rotas)](#4-contrato-de-resposta-todas-as-rotas)
- [5. Rotas públicas (frontend de leitura)](#5-rotas-públicas-frontend-de-leitura) — as rotas de detalhe (`:idOrSlug`) e as de categorias são *auth-aware*: ver 5.1 e 5.2
- [6. Rotas autenticadas (painel de gestão)](#6-rotas-autenticadas-painel-de-gestão)
- [7. Modelos de dados (tipos)](#7-modelos-de-dados-tipos)
- [8. Padrões de consumo recomendados](#8-padrões-de-consumo-recomendados)
- [9. Erros comuns e como resolver](#9-erros-comuns-e-como-resolver)
- [10. Variáveis de ambiente necessárias no frontend](#10-variáveis-de-ambiente-necessárias-no-frontend)
- [11. Checklist de integração](#11-checklist-de-integração)
- [12. Divergências conhecidas](#12-divergências-conhecidas)
- [13. Changelog do guia](#13-changelog-do-guia)
- [14. Correções aplicadas (backend)](#14-correções-aplicadas-backend)

---

## 1. Visão geral

### 1.1 Base URL

- Dev: `http://localhost:10000`
- Prod: não há URL de produção configurada e verificável neste ambiente.

### 1.2 Dois perfis de consumo

| Perfil | Autenticação | Header de tenant | Exemplo |
|--------|--------------|------------------|---------|
| Público | nenhuma | `X-Tenant-Slug: <slug>` | site de leitura |
| Autenticado | Supabase JWT | nenhum — tenant vem do JWT | painel de gestão |

### 1.3 Stack assumida do cliente

- HTTP client: `fetch` nativo
- Auth: `@supabase/supabase-js`
- Estado: TanStack Query

---

## 2. Autenticação

### 2.1 Como funciona

- Auth é feita **inteiramente no cliente** via Supabase Auth.
- O backend **não tem rota de login**.
- O cliente obtém o JWT chamando `supabase.auth.signInWithPassword`.
- O JWT é enviado em toda request autenticada como `Authorization: Bearer <token>`.
- O backend valida o JWT via Supabase e extrai `tenant_id` e `role` de `app_metadata`.

### 2.2 Login (client-side)

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@exemplo.com',
  password: 'senha',
});

if (error) throw error;
const token = data.session?.access_token;
```

### 2.3 Anexar JWT em cada request

```ts
const { data } = await supabase.auth.getSession();
const token = data.session?.access_token;

const res = await fetch('http://localhost:10000/api/users/me', {
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});
```

### 2.4 Refresh de token

- Supabase client cuida automaticamente (`autoRefreshToken: true`).
- Não é preciso tratar refresh manualmente.
- Se uma request retornar **401**, chamar `supabase.auth.signOut()` e redirecionar para login.

### 2.5 Logout

```ts
await supabase.auth.signOut();
```

### 2.6 Claims do JWT (o que o backend lê)

| Claim | Onde | Tipo | Descrição |
|-------|------|------|-----------|
| `app_metadata.tenant_id` | user | uuid | Tenant do usuário |
| `app_metadata.role` | user | `'admin' \| 'editor' \| 'user'` | Papel |

### 2.7 Como obter no frontend

```ts
const { data: { session } } = await supabase.auth.getSession();
const role = session?.user.app_metadata?.role;
const tenantId = session?.user.app_metadata?.tenant_id;
```

---

## 3. Header de tenant (rotas públicas)

Rotas públicas **não usam JWT**. Elas exigem header:

```text
X-Tenant-Slug: <slug-do-tenant>
```

- `slug` é o campo `tenants.slug` (ex.: `default`).
- Sem esse header, o backend responde **401** `{ "success": false, "data": null, "message": "Missing tenant identification" }`.
- Slug ausente, desconhecido ou inativo resulta em **401** com mensagem `Unknown or inactive tenant` (quando o header foi enviado).
- Rotas autenticadas **não enviam** esse header — o tenant vem do JWT.

---

## 4. Contrato de resposta (todas as rotas)

### 4.1 Sucesso

```json
{ "success": true, "data": null, "message": "OK" }
```

O campo `data` contém o tipo específico da rota; pode ser `null` em recursos apagados/desativados conforme a operação.

### 4.2 Erro

```json
{ "success": false, "data": null, "message": "Descrição do erro" }
```

### 4.3 Status HTTP usados

| Status | Significado | Ação recomendada no frontend |
|--------|-------------|------------------------------|
| 200 | Sucesso | usar `data` |
| 201 | Criado | usar `data` |
| 400 | Validação | mostrar `message` ao usuário |
| 401 | Não autenticado / token inválido / tenant inválido | logout + redirect para login no perfil autenticado; corrigir slug no público |
| 403 | Sem permissão (role) | mostrar "sem permissão" |
| 404 | Recurso não encontrado | mostrar empty state |
| 409 | Conflito (slug/SKU duplicado) | mostrar `message` (dica: campo único) |
| 500 | Erro interno | mostrar erro genérico + logar |

### 4.4 Paginação (quando aplicável)

```json
{
  "success": true,
  "data": {
    "items": [],
    "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  },
  "message": "OK"
}
```

- `page` padrão: `1`.
- `limit` padrão: `20`; máximo: `100`.
- Listas paginadas: posts públicos, produtos públicos, produtos administrativos e usuários.

---

## 5. Rotas públicas (frontend de leitura)

Todas exigem `X-Tenant-Slug` e não usam `Authorization`. As respostas abaixo foram observadas no runtime: o tenant `default` está ausente/inativo no banco configurado, portanto as chamadas reais retornaram `401`. O formato de sucesso é o contrato HTTP documentado; ele não foi possível observar com dados reais nessa execução.

### 5.1 Blog

#### GET /api/blog/posts

- **Auth:** nenhuma
- **Header:** `X-Tenant-Slug: <slug>`
- **Query:** `page` (inteiro ≥ 1), `limit` (1–100), `category` (uuid), `tag` (string), `featured` (boolean)
- **Resposta:** `200 ApiResponse<PaginatedData<BlogPost>>`; somente `status = published`.

```bash
curl -s -i "http://localhost:10000/api/blog/posts?page=1&limit=10" -H "X-Tenant-Slug: default"
```

Retorno real observado:

```http
HTTP/1.1 401 Unauthorized
```
```json
{"success":false,"data":null,"message":"Unknown or inactive tenant"}
```

```ts
const res = await fetch(`${API_URL}/api/blog/posts?page=1&limit=10`, {
  headers: { 'X-Tenant-Slug': 'default' },
});
const payload = await res.json() as ApiResponse<PaginatedData<BlogPost>>;
if (!payload.success) throw new Error(payload.message);
console.log(payload.data?.items, payload.data?.meta);
```

#### GET /api/blog/posts/:idOrSlug

- **Auth:** `optionalAuth` — aceita `Authorization: Bearer` **opcionalmente**.
- **Header:** `X-Tenant-Slug` **apenas quando anônimo** (com Bearer válido, o tenant vem do JWT).
- **Path param:** `idOrSlug` — UUID ou slug.
- **Resposta:** `200 ApiResponse<BlogPost>`; **somente `published` sem Bearer; qualquer status (`draft`/`published`/`archived`) com Bearer válido**.
- Sem Bearer e post não publicado: **404** (`success: false`, `data: null`).

```bash
# público
curl -s -i "http://localhost:10000/api/blog/posts/meu-post" -H "X-Tenant-Slug: default"
# autenticado (retorna draft/archived)
curl -s -i "http://localhost:10000/api/blog/posts/meu-post" -H "Authorization: Bearer $TOKEN"
```
```ts
// público
const res = await fetch(`${API_URL}/api/blog/posts/meu-post`, { headers: { 'X-Tenant-Slug': 'default' } });
// painel de gestão: o mesmo client com Bearer anexado já retorna drafts
const post = await apiRequest<BlogPost>(`/api/blog/posts/${idOrSlug}`);
```

> Use **a mesma rota** no painel admin. Não é mais preciso buscar a listagem
> (`limit: 100`) e filtrar localmente para achar um item por id/slug.

#### GET /api/blog/posts/:id/products

- **Auth:** nenhuma; **Header:** `X-Tenant-Slug`.
- **Path param:** `id` — UUID do post (slug não é aceito nesta operação).
- **Resposta:** `200 ApiResponse<Product[]>`; associação N:N.
- **Atenção:** os produtos associados não são filtrados por `active` neste endpoint.

```bash
curl -s -i "http://localhost:10000/api/blog/posts/11111111-1111-1111-1111-111111111111/products" -H "X-Tenant-Slug: default"
```
```ts
const res = await fetch(`${API_URL}/api/blog/posts/${postId}/products`, { headers: { 'X-Tenant-Slug': 'default' } });
```

#### GET /api/blog/categories

- **Auth:** `optionalAuth` — aceita `Authorization: Bearer` **opcionalmente**.
- **Header:** `X-Tenant-Slug` **apenas quando anônimo** (com Bearer válido, o tenant vem do JWT).
- **Resposta:** `200 ApiResponse<BlogCategory[]>`; somente ativas.

```bash
# público
curl -s -i "http://localhost:10000/api/blog/categories" -H "X-Tenant-Slug: default"
# painel admin (sem X-Tenant-Slug)
curl -s -i "http://localhost:10000/api/blog/categories" -H "Authorization: Bearer $TOKEN"
```
```ts
// público
const res = await fetch(`${API_URL}/api/blog/categories`, { headers: { 'X-Tenant-Slug': 'default' } });
// painel de gestão — mesma rota, com Bearer anexado
const categories = await apiRequest<BlogCategory[]>('/api/blog/categories');
```

> Antes estas rotas exigiam `X-Tenant-Slug` e retornavam **401** quando o painel
> enviava apenas o Bearer. Agora o painel pode chamar exatamente a mesma rota.

#### GET /api/blog/categories/:slugOrId

- **Auth:** `optionalAuth` — aceita `Authorization: Bearer` **opcionalmente**.
- **Header:** `X-Tenant-Slug` **apenas quando anônimo**.
- **Path param:** slug ou UUID.
- **Resposta:** `200 ApiResponse<BlogCategory>`.

```bash
curl -s -i "http://localhost:10000/api/blog/categories/eletronicos" -H "X-Tenant-Slug: default"
curl -s -i "http://localhost:10000/api/blog/categories/eletronicos" -H "Authorization: Bearer $TOKEN"
```
```ts
const res = await fetch(`${API_URL}/api/blog/categories/${slugOrId}`, { headers: { 'X-Tenant-Slug': 'default' } });
```

### 5.2 Produtos

#### GET /api/products

- **Auth:** nenhuma; **Header:** `X-Tenant-Slug`.
- **Query:** `page`, `limit`, `category` (uuid), `commercialType` (`PICKUP` | `ECOMMERCE`).
- **Resposta:** `200 ApiResponse<PaginatedData<Product>>`; somente `active`.

```bash
curl -s -i "http://localhost:10000/api/products?page=1&limit=10&commercialType=ECOMMERCE" -H "X-Tenant-Slug: default"
```
```ts
const res = await fetch(`${API_URL}/api/products?page=1&limit=10`, { headers: { 'X-Tenant-Slug': 'default' } });
```

#### GET /api/products/:idOrSlug

- **Auth:** `optionalAuth` — aceita `Authorization: Bearer` **opcionalmente**.
- **Header:** `X-Tenant-Slug` **apenas quando anônimo** (com Bearer válido, o tenant vem do JWT).
- **Path param:** UUID ou slug.
- **Resposta:** `200 ApiResponse<Product>`; **somente `active` sem Bearer; qualquer status (`draft`/`active`/`archived`) com Bearer válido**.
- Sem Bearer e produto não ativo: **404** (`success: false`, `data: null`).

```bash
# público
curl -s -i "http://localhost:10000/api/products/notebook-x" -H "X-Tenant-Slug: default"
# autenticado (retorna draft/archived)
curl -s -i "http://localhost:10000/api/products/notebook-x" -H "Authorization: Bearer $TOKEN"
```
```ts
// público
const res = await fetch(`${API_URL}/api/products/${idOrSlug}`, { headers: { 'X-Tenant-Slug': 'default' } });
// painel de gestão: o mesmo client com Bearer anexado já retorna drafts
const product = await apiRequest<Product>(`/api/products/${idOrSlug}`);
```

> A rota autenticada direta de detalhe substitui a gambiarra de varrer
> `GET /api/products/admin/list?limit=100` para localizar um item por id/slug.

#### GET /api/products/categories

- **Auth:** `optionalAuth` — aceita `Authorization: Bearer` **opcionalmente**.
- **Header:** `X-Tenant-Slug` **apenas quando anônimo** (com Bearer válido, o tenant vem do JWT).
- **Resposta:** `200 ApiResponse<ProductCategory[]>`; somente ativas.

```bash
# público
curl -s -i "http://localhost:10000/api/products/categories" -H "X-Tenant-Slug: default"
# painel admin (sem X-Tenant-Slug)
curl -s -i "http://localhost:10000/api/products/categories" -H "Authorization: Bearer $TOKEN"
```
```ts
// público
const res = await fetch(`${API_URL}/api/products/categories`, { headers: { 'X-Tenant-Slug': 'default' } });
// painel de gestão — mesma rota, com Bearer anexado
const categories = await apiRequest<ProductCategory[]>('/api/products/categories');
```

#### GET /api/products/categories/:slugOrId

- **Auth:** `optionalAuth` — aceita `Authorization: Bearer` **opcionalmente**.
- **Header:** `X-Tenant-Slug` **apenas quando anônimo**.
- **Path param:** slug ou UUID.
- **Resposta:** `200 ApiResponse<ProductCategory>`.

```bash
curl -s -i "http://localhost:10000/api/products/categories/ferramentas" -H "X-Tenant-Slug: default"
curl -s -i "http://localhost:10000/api/products/categories/ferramentas" -H "Authorization: Bearer $TOKEN"
```
```ts
const res = await fetch(`${API_URL}/api/products/categories/${slugOrId}`, { headers: { 'X-Tenant-Slug': 'default' } });
```

### 5.3 Teste real do runtime público

A chamada abaixo foi executada no servidor disponível e retornou status 401, sem corpo legível no cliente PowerShell:

```bash
curl -s "http://localhost:10000/api/blog/posts?page=1&limit=10" -H "X-Tenant-Slug: default"
```
```http
STATUS=401
```

O mesmo header inválido/ausente no banco é a causa registrada pelo endpoint. Não há respostas 200 com dados para copiar nesta execução.

## 6. Rotas autenticadas (painel de gestão)

Todas exigem `Authorization: Bearer <JWT>` e não enviam `X-Tenant-Slug`. O token precisa conter `app_metadata.tenant_id`. Os testes autenticados com token válido não puderam ser executados porque não havia token administrativo disponível no ambiente; os retornos 401 observados são registrados como bloqueio de runtime, não como contrato de sucesso.

### 6.1 Usuário

#### GET /api/users/me

- **Auth:** Bearer; qualquer role autenticada.
- **Resposta:** `200 ApiResponse<AuthUser>`.

```bash
curl -s -i "http://localhost:10000/api/users/me" -H "Authorization: Bearer $TOKEN"
```
```ts
const res = await fetch(`${API_URL}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } });
```

#### GET /api/users

- **Auth:** Bearer + `admin`.
- **Query:** `page`, `limit`.
- **Resposta:** `200 ApiResponse<PaginatedData<AuthUser>>`.

```bash
curl -s -i "http://localhost:10000/api/users?page=1&limit=20" -H "Authorization: Bearer $TOKEN"
```
```ts
const res = await fetch(`${API_URL}/api/users?page=1&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
```

#### GET /api/users/:id

- **Auth:** Bearer + `admin`.
- **Path param:** `id` UUID.
- **Resposta:** `200 ApiResponse<AuthUser>`.

```bash
curl -s -i "http://localhost:10000/api/users/11111111-1111-1111-1111-111111111111" -H "Authorization: Bearer $TOKEN"
```
```ts
const res = await fetch(`${API_URL}/api/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
```

#### POST /api/users

- **Auth:** Bearer + `admin`; **Status:** `201`.
- **Body:**

```json
{ "nome": "string", "email": "email@exemplo.com", "role": "admin", "password": "mínimo-8" }
```

```bash
curl -s -i -X POST "http://localhost:10000/api/users" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nome\":\"João\",\"email\":\"joao@exemplo.com\",\"role\":\"user\",\"password\":\"senha123\"}"
```
```ts
const res = await fetch(`${API_URL}/api/users`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ nome, email, role, password }),
});
```

#### PUT /api/users/:id

- **Auth:** Bearer + `admin`.
- **Body:** ao menos um campo: `nome?`, `role?` (`admin|editor|user`), `ativo?` boolean.
- **Resposta:** `200 ApiResponse<AuthUser>`; mensagem `Updated`.

```bash
curl -s -i -X PUT "http://localhost:10000/api/users/$ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nome\":\"Novo nome\",\"ativo\":true}"
```
```ts
await fetch(`${API_URL}/api/users/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: false }) });
```

#### DELETE /api/users/:id

- **Auth:** Bearer + `admin`; **Resposta:** `200 { success:true, data:{id}, message:"Deactivated" }`; soft delete (`ativo=false`).

```bash
curl -s -i -X DELETE "http://localhost:10000/api/users/$ID" -H "Authorization: Bearer $TOKEN"
```
```ts
await fetch(`${API_URL}/api/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
```

### 6.2 Blog Posts

Não existe uma rota autenticada separada para listar ou detalhes de posts. `GET /api/blog/posts` e `GET /api/blog/posts/:idOrSlug` são as rotas usadas pelo painel: **sem Bearer** retornam somente `published`; **com Bearer** retornam todos os status e a listagem aceita o filtro `status`. Ou seja, o painel de edição deve consumir essas mesmas rotas anexando o JWT.

#### POST /api/blog/posts

- **Auth:** Bearer + `admin` ou `editor`; **Status:** `201`.

```json
{ "title": "string", "content": "string", "slug": "string opcional", "excerpt": "string ou null", "category_id": "uuid ou null", "cover_image_url": "url ou null", "status": "draft", "featured": false, "tags": ["string"], "meta_title": "string ou null", "meta_description": "string ou null", "og_image_url": "url ou null" }
```

Obrigatórios: `title` (1–200) e `content` (≥1). `slug`, `status`, `featured`, `tags`, `category_id`, imagens e metadados são opcionais; o backend gera o slug quando omitido.

```bash
curl -s -i -X POST "http://localhost:10000/api/blog/posts" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"title\":\"Título\",\"content\":\"Conteúdo\",\"status\":\"draft\"}"
```
```ts
const res = await fetch(`${API_URL}/api/blog/posts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, status: 'draft' }) });
```

#### PUT /api/blog/posts/:id

- **Auth:** Bearer + `admin` ou `editor`; **Path:** UUID.
- **Body:** os mesmos campos da criação, todos opcionais, mas ao menos um; retorna `200 ApiResponse<BlogPost>` e mensagem `Updated`.

```bash
curl -s -i -X PUT "http://localhost:10000/api/blog/posts/$ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"title\":\"Título atualizado\"}"
```
```ts
await fetch(`${API_URL}/api/blog/posts/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Título atualizado' }) });
```

#### DELETE /api/blog/posts/:id

- **Auth:** Bearer + `admin` ou `editor`; resposta `200 { data:{id}, message:"Deleted" }`.

```bash
curl -s -i -X DELETE "http://localhost:10000/api/blog/posts/$ID" -H "Authorization: Bearer $TOKEN"
```
```ts
await fetch(`${API_URL}/api/blog/posts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
```

#### POST /api/blog/posts/:id/products

- **Auth:** Bearer + `admin` ou `editor`; **Body:** `{"product_ids":["uuid"]}` (mínimo 1); resposta `200 { data:{post_id}, message:"Associated" }`.

```bash
curl -s -i -X POST "http://localhost:10000/api/blog/posts/$ID/products" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"product_ids\":[\"$PRODUCT_ID\"]}"
```
```ts
await fetch(`${API_URL}/api/blog/posts/${postId}/products`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product_ids: [productId] }) });
```

#### DELETE /api/blog/posts/:id/products/:productId

- **Auth:** Bearer + `admin` ou `editor`; resposta `200 { data:{post_id,product_id}, message:"Dissociated" }`.

```bash
curl -s -i -X DELETE "http://localhost:10000/api/blog/posts/$ID/products/$PRODUCT_ID" -H "Authorization: Bearer $TOKEN"
```
```ts
await fetch(`${API_URL}/api/blog/posts/${postId}/products/${productId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
```

### 6.3 Blog Categorias

#### POST /api/blog/categories

- **Auth:** Bearer + `admin` ou `editor`; **Status:** `201`.
- **Body:** `nome` obrigatório; `slug?`, `descricao?`, `parent_id?` (uuid/null), `display_order?` inteiro ≥0.
- **Resposta:** `201 ApiResponse<BlogCategory>`.

```bash
curl -s -i -X POST "http://localhost:10000/api/blog/categories" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nome\":\"Tecnologia\"}"
```
```ts
const res = await fetch(`${API_URL}/api/blog/categories`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Tecnologia' }) });
```

#### PUT /api/blog/categories/:id

- **Auth:** Bearer + `admin` ou `editor`; body parcial com `nome?`, `slug?`, `descricao?`, `parent_id?`, `display_order?`, `status?` (`active|archived`); resposta `200`, mensagem `Updated`.

```bash
curl -s -i -X PUT "http://localhost:10000/api/blog/categories/$ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"display_order\":1}"
```
```ts
await fetch(`${API_URL}/api/blog/categories/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ display_order: 1 }) });
```

#### DELETE /api/blog/categories/:id

- **Auth:** Bearer + `admin` ou `editor`; query `force=true` é aceita; resposta `200 { data:{id}, message:"Deleted" }`.

```bash
curl -s -i -X DELETE "http://localhost:10000/api/blog/categories/$ID?force=true" -H "Authorization: Bearer $TOKEN"
```
```ts
await fetch(`${API_URL}/api/blog/categories/${id}?force=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
```

### 6.4 Produtos

#### GET /api/products/admin/list

- **Auth:** Bearer + `admin` ou `editor`.
- **Query:** `page`, `limit`, `category` (uuid), `commercialType` (`PICKUP|ECOMMERCE`).
- **Resposta:** `200 ApiResponse<PaginatedData<Product>>`; inclui todos os status.

```bash
curl -s -i "http://localhost:10000/api/products/admin/list?page=1&limit=20" -H "Authorization: Bearer $TOKEN"
```
```ts
const res = await fetch(`${API_URL}/api/products/admin/list?page=1&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
```

#### POST /api/products

- **Auth:** Bearer + `admin` ou `editor`; **Status:** `201`.
- **Body:** `nome` e `commercial_type` (`PICKUP|ECOMMERCE`) obrigatórios; `slug?`, `sku?`, `descricao?`, `preco?` (>0), `category_id?`, `images?` (máx 20; `url` obrigatório, `alt?`, `displayOrder?`), `status?` (`draft|active|archived`), `display_order?`, `meta_title?`, `meta_description?`.
- **Resposta:** `201 ApiResponse<Product>`.

```bash
curl -s -i -X POST "http://localhost:10000/api/products" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nome\":\"Notebook\",\"commercial_type\":\"ECOMMERCE\",\"preco\":1999.90}"
```
```ts
const res = await fetch(`${API_URL}/api/products`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, commercial_type: 'ECOMMERCE', preco: 1999.9 }) });
```

#### PUT /api/products/:id

- **Auth:** Bearer + `admin` ou `editor`; body parcial com os campos da criação, ao menos um; resposta `200 ApiResponse<Product>`, mensagem `Updated`.

```bash
curl -s -i -X PUT "http://localhost:10000/api/products/$ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"preco\":1799.90}"
```
```ts
await fetch(`${API_URL}/api/products/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ preco: 1799.9 }) });
```

#### DELETE /api/products/:id

- **Auth:** Bearer + `admin` (não editor); resposta `200 { data:{id}, message:"Deleted" }`.

```bash
curl -s -i -X DELETE "http://localhost:10000/api/products/$ID" -H "Authorization: Bearer $TOKEN"
```
```ts
await fetch(`${API_URL}/api/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
```

### 6.5 Categorias de Produtos

#### POST /api/products/categories

- **Auth:** Bearer + `admin` ou `editor`; **Status:** `201`.
- **Body:** `nome` obrigatório; `slug?`, `descricao?`, `parent_id?`, `display_order?`; resposta `201 ApiResponse<ProductCategory>`.

```bash
curl -s -i -X POST "http://localhost:10000/api/products/categories" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nome\":\"Ferramentas\"}"
```
```ts
const res = await fetch(`${API_URL}/api/products/categories`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Ferramentas' }) });
```

#### PUT /api/products/categories/:id

- **Auth:** Bearer + `admin` ou `editor`; body parcial: `nome?`, `slug?`, `descricao?`, `parent_id?`, `display_order?`, `status?` (`active|archived`); resposta `200`, mensagem `Updated`.

```bash
curl -s -i -X PUT "http://localhost:10000/api/products/categories/$ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"display_order\":1}"
```
```ts
await fetch(`${API_URL}/api/products/categories/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ display_order: 1 }) });
```

#### DELETE /api/products/categories/:id

- **Auth:** Bearer + `admin` ou `editor`; query `force=true`; resposta `200 { data:{id}, message:"Deleted" }`.

```bash
curl -s -i -X DELETE "http://localhost:10000/api/products/categories/$ID?force=true" -H "Authorization: Bearer $TOKEN"
```
```ts
await fetch(`${API_URL}/api/products/categories/${id}?force=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
```

## 7. Modelos de dados (tipos)

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

export type PostStatus = 'draft' | 'published' | 'archived';
export interface BlogPost {
  id: string; tenant_id: string; category_id: string | null;
  title: string; slug: string; excerpt: string | null; content: string;
  cover_image_url: string | null; status: PostStatus; featured: boolean;
  tags: string[]; meta_title: string | null; meta_description: string | null;
  og_image_url: string | null; published_at: string | null;
  created_by: string | null; updated_by: string | null;
  created_at: string; updated_at: string;
}

export interface BlogCategory {
  id: string; tenant_id: string; nome: string; slug: string;
  descricao: string | null; parent_id: string | null; display_order: number;
  status: 'active' | 'archived'; created_at: string; updated_at: string;
}

export interface ProductImage { url: string; alt?: string; displayOrder: number; }
export type ProductStatus = 'draft' | 'active' | 'archived';
export type CommercialType = 'PICKUP' | 'ECOMMERCE';
export interface Product {
  id: string; tenant_id: string; category_id: string | null; sku: string | null;
  nome: string; slug: string; descricao: string | null; preco: number | null;
  commercial_type: CommercialType; images: ProductImage[]; status: ProductStatus;
  display_order: number; meta_title: string | null; meta_description: string | null;
  created_at: string; updated_at: string;
}

export interface ProductCategory {
  id: string; tenant_id: string; nome: string; slug: string;
  descricao: string | null; parent_id: string | null; display_order: number;
  status: 'active' | 'archived'; created_at: string; updated_at: string;
}

export type UserRole = 'admin' | 'editor' | 'user';
export interface AuthUser {
  id: string; tenant_id: string; nome: string; email: string;
  role: UserRole; ativo: boolean; created_at: string; updated_at: string;
}
```

> `tenant_id` aparece nos tipos internos, mas os DTOs de resposta de usuário o omitem. Para o frontend, `AuthUser` deve ser tratado com o shape efetivamente exposto: `{ id, nome, email, role, ativo, created_at, updated_at }`.

---

## 8. Padrões de consumo recomendados

### 8.1 Cliente HTTP único

```ts
class ApiError extends Error {
  constructor(public readonly message: string, public readonly status: number) { super(message); }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await res.json() as ApiResponse<T>;
  if (!payload.success) throw new ApiError(payload.message, res.status);
  return payload.data as T;
}
```

### 8.2 Hooks com TanStack Query

```ts
export function useBlogPosts(params: Record<string, string | number | boolean> = {}) {
  return useQuery({
    queryKey: ['blog', 'posts', params],
    queryFn: () => apiRequest<PaginatedData<BlogPost>>(`/api/blog/posts?${qs(params)}`),
    staleTime: 60_000,
  });
}
```

### 8.3 Mutations invalidam queries

```ts
export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/blog/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog', 'posts'] }),
  });
}
```

### 8.4 Tratamento de 401

```ts
if (res.status === 401) {
  await supabase.auth.signOut();
  window.location.href = '/login';
}
```

---

## 9. Erros comuns e como resolver

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| 401 `Missing tenant identification` | Falta `X-Tenant-Slug` | Enviar `X-Tenant-Slug: default` ou slug válido |
| 401 `Unknown or inactive tenant` | Slug desconhecido/inativo | Corrigir slug; o runtime atual não encontrou `default` |
| 401 `Missing bearer token` | Falta `Authorization` | Anexar `Bearer <JWT>` |
| 401 `Invalid or expired token` | JWT expirado ou inválido | Renovar sessão/login |
| 401 `Token has no tenant association` | Falta `app_metadata.tenant_id` | Corrigir metadata no Supabase |
| 403 `Acesso negado` | Role insuficiente | Verificar `app_metadata.role` |
| 404 `Route not found` | Nome de rota divergente | Conferir seções 5/6 |
| 409 de unicidade | Duplicidade | Ajustar payload/campo único |
| CORS error | Origem não liberada | Configurar `CORS_ORIGINS` no backend |
| `data: null` com `success: true` | Operação pode retornar null legitimamente | Tratar no frontend |

---

## 10. Variáveis de ambiente necessárias no frontend

```env
VITE_API_URL=http://localhost:10000
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend.

---

## 11. Checklist de integração

- [ ] Supabase client configurado
- [ ] Login funciona (`signInWithPassword`)
- [ ] JWT anexado em toda request autenticada
- [ ] `X-Tenant-Slug` enviado em rotas públicas
- [ ] 401 dispara logout automático
- [ ] Todas as rotas consumidas existem no backend
- [ ] Tipos espelham o backend
- [ ] Paginação lê `meta` corretamente

---

## 12. Divergências conhecidas

- O banco configurado não resolveu o tenant `default` durante os testes: rotas públicas retornaram `401 Unknown or inactive tenant`. Não foi possível capturar respostas 200 com dados reais.
- Não havia token JWT administrativo disponível; endpoints autenticados não puderam ser validados com sucesso no runtime.
- O prompt mencionava uma listagem administrativa de posts com query `status`, mas não existe rota autenticada separada para essa operação. O backend expõe a listagem pública em `/api/blog/posts` e as operações autenticadas de detalhe/criação/alteração.
- `GET /api/blog/posts/:id/products` é público, mas não filtra produtos associados por `active`; pode devolver `draft`/`archived`.
- `GET /api/products/categories` é o caminho real; não existe `/api/product-categories`.
- O filtro de produtos é `commercialType` (camelCase), não `commercial_type`.
- O detalhe público de post/produto aceita UUID ou slug, mas a associação de produtos exige o UUID do post.
- Desde 21/02/2026, `GET /api/blog/posts` e `GET /api/products` aceitam Bearer opcional: sem token mantêm o filtro público; com token válido listam todos os status e aceitam `status` como query.
- Desde 21/02/2026, `GET /api/blog/posts/:id/products` retorna apenas produtos `active` sem Bearer e todos os status com Bearer válido.
- Desde 27/09/2026, `GET /api/blog/posts/:idOrSlug` e `GET /api/products/:idOrSlug` são auth-aware: retornam 404 para itens não públicos quando anônimo, e qualquer status quando há Bearer válido.
- Desde 27/09/2026, as quatro rotas GET de categorias (`/api/blog/categories`, `/api/blog/categories/:slugOrId`, `/api/products/categories`, `/api/products/categories/:slugOrId`) aceitam Bearer opcional. Sem ele continuam exigindo `X-Tenant-Slug`; com ele o tenant vem do JWT. Isso elimina o 401 que o painel recebia por não ter o slug.

### 12.2 Rotas GET auth-aware — resumo (a partir de 27/09/2026)

Todas as rotas abaixo respondem a **visitantes** (com `X-Tenant-Slug`) e ao
**painel autenticado** (com `Bearer`) na **mesma URL**:

| Rota | Sem Bearer | Com Bearer |
|------|-----------|------------|
| `GET /api/blog/posts` | só `published` | todos os status + filtro `status` |
| `GET /api/blog/posts/:idOrSlug` | só `published` | qualquer status |
| `GET /api/blog/categories` | só ativas | só ativas |
| `GET /api/blog/categories/:slugOrId` | detalhe | detalhe |
| `GET /api/products` | só `active` | todos os status + filtro `status` |
| `GET /api/products/:idOrSlug` | só `active` | qualquer status |
| `GET /api/products/categories` | só ativas | só ativas |
| `GET /api/products/categories/:slugOrId` | detalhe | detalhe |

Nas categorias o Bearer **não amplia o conjunto retornado** — a mudança é
apenas de autenticação: a rota deixa de exigir `X-Tenant-Slug` quando há
sessão. Para listar categorias `archived` no painel, o contrato atual não
oferece rota dedicada.

### 12.1 Como o painel deve buscar o detalhe (a partir de 27/09/2026)

Antes, para editar um `draft`/`archived` o painel era obrigado a listar tudo
(`limit: 100`) e filtrar no cliente — o que quebrava acima de 100 itens.
Agora o detalhe é direto:

```ts
// ✅ correto: o apiRequest já anexa o Bearer quando há sessão
const post = await apiRequest<BlogPost>(`/api/blog/posts/${idOrSlug}`);
const product = await apiRequest<Product>(`/api/products/${idOrSlug}`);

// ❌ não fazer mais
const all = await apiRequest<PaginatedData<Product>>('/api/products/admin/list?limit=100');
const found = all.data.items.find(p => p.id === id);
```

---

## 13. Changelog do guia

| Data | Mudança |
|------|---------|
| 2026-02-21 | Versão inicial; rotas e contratos auditados, com bloqueios de runtime registrados |
| 2026-09-27 | Detalhe de post e produto passou a ser auth-aware (`optionalAuth` + `resolveTenantBySlugIfAnonymous`) |
| 2026-09-27 | Listagem e detalhe de categorias (blog e produtos) passaram a aceitar Bearer opcional |

## 14. Correções aplicadas (backend)

| Data | Correção | Status |
|------|----------|--------|
| 21/02/2026 | `GET /api/blog/posts` auth-aware: sem Bearer apenas `published`; com Bearer todos os status e filtro opcional `status` | ✅ |
| 21/02/2026 | `GET /api/products` auth-aware: sem Bearer apenas `active`; com Bearer todos os status e filtro opcional `status` | ✅ |
| 21/02/2026 | `GET /api/users/me` inclui `tenant_id` na projeção retornada | ✅ |
| 21/02/2026 | `GET /api/blog/posts/:id/products` filtra `active` sem Bearer e todos os status com Bearer | ✅ |
| 27/09/2026 | `GET /api/blog/posts/:idOrSlug` aceita `optionalAuth`; com Bearer retorna qualquer status | ✅ |
| 27/09/2026 | `GET /api/products/:idOrSlug` aceita `optionalAuth`; com Bearer retorna qualquer status | ✅ |
| 27/09/2026 | `GET /api/blog/categories` auth-aware | ✅ |
| 27/09/2026 | `GET /api/blog/categories/:slugOrId` auth-aware | ✅ |
| 27/09/2026 | `GET /api/products/categories` auth-aware | ✅ |
| 27/09/2026 | `GET /api/products/categories/:slugOrId` auth-aware | ✅ |

---

## 15. Upload de imagens

Upload real via backend (backend como proxy do Supabase Storage, service-role).

### POST /api/blog/upload
- **Auth:** Bearer + role `admin` ou `editor`
- **Content-Type:** `multipart/form-data`
- **Campo:** `file` (binário)
- **Limite:** 5 MB
- **Formatos aceitos:** JPEG, PNG, WebP, AVIF, GIF (validados por magic bytes — não confia no mimetype declarado pelo cliente)
- **Resposta 201:**
  ```json
  {
    "success": true,
    "data": {
      "url": "https://.../storage/v1/object/public/blog-images/{tenant}/{year}/{month}/{uuid}.jpg",
      "path": "{tenant}/{year}/{month}/{uuid}.jpg",
      "size": 12345,
      "mimetype": "image/jpeg"
    },
    "message": "Upload realizado"
  }
  ```

### DELETE /api/blog/upload
- **Auth:** Bearer + admin/editor
- **Body:** `{ "path": "{tenant}/{year}/{month}/{uuid}.jpg" }`
- Só remove paths do próprio tenant do token (senão 400).
- **Resposta 200:** `{ "success": true, "data": { "path": "..." }, "message": "Imagem removida" }`

### POST /api/products/upload
Idêntico, bucket `product-images`.

### DELETE /api/products/upload
Idêntico.

**Erros comuns (400):** arquivo > 5 MB; formato não suportado (magic bytes inválidos); sem campo `file`; campo com nome errado (`LIMIT_UNEXPECTED_FILE`). Sem token → 401. Sem role → 403.

```ts
// Exemplo de consumo no frontend
const form = new FormData();
form.append('file', fileInput.files[0]);
const res = await fetch(`${API_URL}/api/blog/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const { data } = await res.json(); // data.url → usar no cover_image_url / images[].url
```

---

## 16. Correções aplicadas (backend) — storage

| Data | Mudança | Status |
|------|---------|--------|
| 04/10/2026 | Upload de imagens: `POST/DELETE /api/blog/upload` e `/api/products/upload`; validação por magic bytes (JPEG/PNG/WebP/AVIF/GIF), limite 5 MB, path `tenantId/ano/mês/uuid.ext`, delete restrito ao tenant, `MulterError` traduzido no errorHandler | ✅ |
