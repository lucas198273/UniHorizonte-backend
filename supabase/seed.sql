-- seed.sql — tenant default. Ajuste o slug/name conforme necessário.
insert into tenants (slug, name, status)
values ('default', 'Default Tenant', 'active')
on conflict (slug) do nothing;
