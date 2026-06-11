-- Fase 2 / Marco 1b — credenciais FORA do alcance do anon (SEGURANCA.md §7; fecha a leitura do S2)
--
-- A Edge Function `login` valida bcrypt no servidor. Esta tabela tira os hashes do
-- blob anon-legível (relyon_users/relyon_instructors em app_state) e os guarda num
-- lugar que SÓ a service_role enxerga (sem policies + REVOKE = invisível pro anon).
--
-- ⚠️ NÃO aplicar isolado: aplicar JUNTO do deploy da função `login`. O passo de
-- REMOVER o campo `password` dos blobs anon (fim deste arquivo) só roda DEPOIS que o
-- login via Edge Function estiver provado — senão quebra o fallback local do auth.js.

create table if not exists public.relyon_credentials (
  username   text primary key,
  source     text not null check (source in ('user','instructor')),
  password   text not null,                 -- hash bcrypt ($2a$...)
  updated_at timestamptz not null default now()
);

alter table public.relyon_credentials enable row level security;
-- Sem nenhuma policy + REVOKE explícito → anon/authenticated não têm acesso.
-- A service_role (usada só pela Edge Function `login`) ignora RLS.
revoke all on public.relyon_credentials from anon, authenticated;

-- Semeia a partir dos blobs atuais (idempotente — pode rodar de novo sem duplicar).
insert into public.relyon_credentials (username, source, password)
select lower(u->>'username'), 'user', u->>'password'
from public.app_state, jsonb_array_elements(value) u
where key = 'relyon_users'
  and coalesce(u->>'username','') <> '' and coalesce(u->>'password','') <> ''
on conflict (username) do update set password = excluded.password, updated_at = now();

insert into public.relyon_credentials (username, source, password)
select lower(i->>'username'), 'instructor', i->>'password'
from public.app_state, jsonb_array_elements(value) i
where key = 'relyon_instructors'
  and coalesce(i->>'username','') <> '' and coalesce(i->>'password','') <> ''
on conflict (username) do update set password = excluded.password, updated_at = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO FINAL (rodar SÓ depois de provar o login via Edge Function p/ a frota toda):
-- remove o hash dos blobs anon-legíveis. Comentado de propósito — descomente e rode
-- como migration separada quando o auth.js já não depender do fallback local.
--
-- update public.app_state
--   set value = (select jsonb_agg(u - 'password') from jsonb_array_elements(value) u)
--   where key = 'relyon_users';
-- update public.app_state
--   set value = (select jsonb_agg(i - 'password') from jsonb_array_elements(value) i)
--   where key = 'relyon_instructors';
-- ─────────────────────────────────────────────────────────────────────────────
