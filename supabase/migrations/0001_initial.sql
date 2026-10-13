-- 0001_initial.sql — Fundação backend-cm1.0
-- Execute manualmente no Supabase (SQL Editor). Não rodar automaticamente.

-- ============================================================================
-- Extensões e helpers
-- ============================================================================
create extension if not exists "pgcrypto";

-- updated_at automático
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Tenant atual a partir do JWT (app_metadata.tenant_id) — usado pelas policies RLS
create or replace function current_tenant_id()
returns uuid as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id',
    ''
  )::uuid;
$$ language sql stable;

-- ============================================================================
-- tenants
-- ============================================================================
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text unique,
  niche text,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function set_updated_at();

-- ============================================================================
-- usuarios (perfil vinculado a auth.users)
-- ============================================================================
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'user' check (role in ('admin','editor','user')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index idx_usuarios_tenant on usuarios(tenant_id);
create index idx_usuarios_email on usuarios(email);

create trigger trg_usuarios_updated_at
  before update on usuarios
  for each row execute function set_updated_at();

-- ============================================================================
-- blog_categories
-- ============================================================================
create table blog_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null,
  slug text not null,
  descricao text,
  parent_id uuid references blog_categories(id) on delete set null,
  display_order integer not null default 0,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index idx_blog_categories_tenant on blog_categories(tenant_id, status);

create trigger trg_blog_categories_updated_at
  before update on blog_categories
  for each row execute function set_updated_at();

-- ============================================================================
-- blog_posts
-- ============================================================================
create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category_id uuid references blog_categories(id) on delete set null,
  title text not null,
  slug text not null,
  excerpt text,
  content text not null,
  cover_image_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  tags text[] not null default '{}',
  meta_title text,
  meta_description text,
  og_image_url text,
  published_at timestamptz,
  created_by uuid references usuarios(id) on delete set null,
  updated_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index idx_blog_posts_tenant_status_date on blog_posts(tenant_id, status, created_at desc);
create index idx_blog_posts_tenant_category on blog_posts(tenant_id, category_id, status);
create index idx_blog_posts_tags on blog_posts using gin(tags);
create index idx_blog_posts_featured on blog_posts(tenant_id) where featured = true;

create trigger trg_blog_posts_updated_at
  before update on blog_posts
  for each row execute function set_updated_at();

-- ============================================================================
-- product_categories
-- ============================================================================
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null,
  slug text not null,
  descricao text,
  parent_id uuid references product_categories(id) on delete set null,
  display_order integer not null default 0,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index idx_product_categories_tenant on product_categories(tenant_id, status);

create trigger trg_product_categories_updated_at
  before update on product_categories
  for each row execute function set_updated_at();

-- ============================================================================
-- products
-- ============================================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category_id uuid references product_categories(id) on delete set null,
  sku text,
  nome text not null,
  slug text not null,
  descricao text,
  preco numeric(12,2) check (preco is null or preco > 0),
  commercial_type text not null check (commercial_type in ('PICKUP','ECOMMERCE')),
  images jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  display_order integer not null default 0,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- SKU único por tenant apenas quando informado
create unique index idx_products_tenant_sku
  on products(tenant_id, sku) where sku is not null;

create index idx_products_tenant_status_type_order on products(tenant_id, status, commercial_type, display_order);
create index idx_products_tenant_category on products(tenant_id, category_id, status);

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ============================================================================
-- blog_post_products (N:N)
-- ============================================================================
create table blog_post_products (
  post_id uuid not null references blog_posts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  display_order integer not null default 0,
  primary key (post_id, product_id)
);

create index idx_bpp_product on blog_post_products(product_id);

-- ============================================================================
-- RLS — segunda camada (o backend usa service-role e filtra por tenant no repo;
-- as policies abaixo protegem acessos client-side diretos via anon/authenticated)
-- ============================================================================
alter table tenants enable row level security;
alter table usuarios enable row level security;
alter table blog_categories enable row level security;
alter table blog_posts enable row level security;
alter table product_categories enable row level security;
alter table products enable row level security;
alter table blog_post_products enable row level security;

-- Tenants: leitura pública de tenants ativos (necessário p/ resolver header)
create policy tenants_read_public on tenants
  for select using (status = 'active');

-- Perfis: usuário lê/edita o próprio perfil do seu tenant
create policy usuarios_select_own on usuarios
  for select using (tenant_id = current_tenant_id() and id = auth.uid());
create policy usuarios_update_own on usuarios
  for update using (tenant_id = current_tenant_id() and id = auth.uid());

-- Conteúdo tenant-scoped: leitura pública de publicado/ativo, escrita só authenticated
create policy blog_categories_read on blog_categories
  for select using (tenant_id = current_tenant_id() and status = 'active');
create policy blog_categories_write on blog_categories
  for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy blog_posts_read on blog_posts
  for select using (tenant_id = current_tenant_id() and status = 'published');
create policy blog_posts_write on blog_posts
  for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy product_categories_read on product_categories
  for select using (tenant_id = current_tenant_id() and status = 'active');
create policy product_categories_write on product_categories
  for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy products_read on products
  for select using (tenant_id = current_tenant_id() and status = 'active');
create policy products_write on products
  for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy bpp_read on blog_post_products
  for select using (
    exists (select 1 from blog_posts p where p.id = post_id and p.tenant_id = current_tenant_id())
  );
create policy bpp_write on blog_post_products
  for all using (
    exists (select 1 from blog_posts p where p.id = post_id and p.tenant_id = current_tenant_id())
  ) with check (
    exists (select 1 from blog_posts p where p.id = post_id and p.tenant_id = current_tenant_id())
  );

-- Buckets de storage (criados sem dados — upload funcional vem depois)
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true), ('product-images', 'product-images', true)
on conflict (id) do nothing;
