-- ============================================================================
-- 0002_expand_products_for_courses.sql
-- Expande products + product_categories pro domínio de curso.
-- Todos os campos novos são NULLABLE ou têm default — não quebra dados.
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. products — discriminação de tipo (product | course)
-- ----------------------------------------------------------------------------
alter table public.products
  add column if not exists kind text not null default 'course';

alter table public.products
  drop constraint if exists products_kind_check;

alter table public.products
  add constraint products_kind_check
  check (kind in ('product', 'course'));

-- ----------------------------------------------------------------------------
-- 2. products — campos específicos de curso
-- ----------------------------------------------------------------------------
alter table public.products
  add column if not exists modality text,
  add column if not exists workload_hours integer,
  add column if not exists duration_months integer,
  add column if not exists level text,
  add column if not exists certification boolean not null default false,
  add column if not exists certification_name text,
  add column if not exists start_date date,
  add column if not exists enrollment_deadline date,
  add column if not exists syllabus text,
  add column if not exists requirements text,
  add column if not exists coordinator_name text,
  add column if not exists coordinator_bio text,
  add column if not exists coordinator_photo_url text,
  add column if not exists video_url text,
  add column if not exists tags text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- 3. Check constraints (validação no banco)
-- ----------------------------------------------------------------------------
alter table public.products
  drop constraint if exists products_modality_check;
alter table public.products
  add constraint products_modality_check
  check (modality is null or modality in ('presencial', 'online', 'hibrido'));

alter table public.products
  drop constraint if exists products_level_check;
alter table public.products
  add constraint products_level_check
  check (level is null or level in ('iniciante', 'intermediario', 'avancado'));

alter table public.products
  drop constraint if exists products_workload_check;
alter table public.products
  add constraint products_workload_check
  check (workload_hours is null or workload_hours > 0);

alter table public.products
  drop constraint if exists products_duration_check;
alter table public.products
  add constraint products_duration_check
  check (duration_months is null or duration_months > 0);

-- ----------------------------------------------------------------------------
-- 4. Índices pros filtros mais comuns
-- ----------------------------------------------------------------------------
create index if not exists idx_products_tenant_kind
  on public.products (tenant_id, kind, status);

create index if not exists idx_products_tenant_modality
  on public.products (tenant_id, modality, status);

create index if not exists idx_products_tenant_level
  on public.products (tenant_id, level, status);

create index if not exists idx_products_tags
  on public.products using gin (tags);

-- ----------------------------------------------------------------------------
-- 5. product_categories — campos pra UI de categoria de curso
-- ----------------------------------------------------------------------------
alter table public.product_categories
  add column if not exists icon text,
  add column if not exists cover_image_url text,
  add column if not exists featured boolean not null default false;

create index if not exists idx_prod_cat_featured
  on public.product_categories (tenant_id)
  where featured = true;

-- ----------------------------------------------------------------------------
-- 6. Comentários (documentação viva no banco)
-- ----------------------------------------------------------------------------
comment on column public.products.kind is 'Tipo: product (físico) ou course (curso)';
comment on column public.products.modality is 'Modalidade: presencial, online ou hibrido';
comment on column public.products.workload_hours is 'Carga horária total em horas';
comment on column public.products.duration_months is 'Duração em meses';
comment on column public.products.level is 'Nível: iniciante, intermediario ou avancado';
comment on column public.products.certification is 'Se emite certificado';
comment on column public.products.certification_name is 'Nome/tipo do certificado';
comment on column public.products.start_date is 'Data prevista de início das aulas';
comment on column public.products.enrollment_deadline is 'Prazo final de matrícula';
comment on column public.products.syllabus is 'Ementa / conteúdo programático';
comment on column public.products.requirements is 'Pré-requisitos do curso';
comment on column public.products.coordinator_name is 'Nome do coordenador';
comment on column public.products.coordinator_bio is 'Mini bio do coordenador';
comment on column public.products.coordinator_photo_url is 'URL da foto do coordenador';
comment on column public.products.video_url is 'URL do vídeo de apresentação';
comment on column public.products.tags is 'Tags para busca e filtros';
comment on column public.product_categories.icon is 'Ícone representativo da categoria';
comment on column public.product_categories.cover_image_url is 'Imagem de capa da categoria';
comment on column public.product_categories.featured is 'Se a categoria aparece em destaque';

-- ============================================================================
-- Fim da migration 0002
-- ============================================================================
