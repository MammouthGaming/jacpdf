-- ============================================================
-- JacDoc Cloud — Supabase foundation
-- Tables :
--   jacdoc_folders  : dossiers Drive-like de JacDoc
--   jacdocs         : documents JacDoc sauvegardés en cloud
--   jacdoc_shares   : permissions de partage direct / lien
--
-- Objectif :
--   - garder JacDoc local-first côté IndexedDB
--   - ajouter un miroir cloud Supabase propre
--   - préparer les phases suivantes : partage, Classroom, Realtime/collab
-- ============================================================

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Dossiers JacDoc Cloud
-- ─────────────────────────────────────────────────────────────

create table if not exists public.jacdoc_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.jacdoc_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jacdoc_folders_user_parent_idx
  on public.jacdoc_folders(user_id, parent_id);

-- Un nom unique par parent pour un même user.
create unique index if not exists jacdoc_folders_unique_named_at_root
  on public.jacdoc_folders(user_id, lower(name))
  where parent_id is null;

create unique index if not exists jacdoc_folders_unique_named_in_parent
  on public.jacdoc_folders(user_id, parent_id, lower(name))
  where parent_id is not null;

-- ─────────────────────────────────────────────────────────────
-- Documents JacDoc Cloud
-- ─────────────────────────────────────────────────────────────

create table if not exists public.jacdocs (
  id uuid primary key default gen_random_uuid(),

  -- Propriétaire du document.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Métadonnées UI.
  title text not null default 'Sans titre',
  folder_id uuid references public.jacdoc_folders(id) on delete set null,

  -- Contenu ProseMirror/Tiptap.
  -- On stocke le JSON directement en DB pour JacDoc, contrairement à JacPDF
  -- qui met le PDF binaire dans Supabase Storage.
  doc jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,

  -- Préparation Classroom / ownership élargi.
  classroom_id uuid null,
  assignment_id uuid null,
  submission_id uuid null,

  -- Préparation collab.
  -- Phase Realtime simple : cette colonne peut être bumpée à chaque save.
  -- Phase CRDT plus tard : on pourra ajouter une table/y-store séparée.
  revision integer not null default 1,

  -- Stats/listing.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now()
);

create index if not exists jacdocs_user_updated_idx
  on public.jacdocs(user_id, updated_at desc);

create index if not exists jacdocs_user_folder_idx
  on public.jacdocs(user_id, folder_id);

create index if not exists jacdocs_classroom_idx
  on public.jacdocs(classroom_id);

-- ─────────────────────────────────────────────────────────────
-- Partages JacDoc
-- ─────────────────────────────────────────────────────────────

do $$ begin
  create type public.jacdoc_share_role as enum ('viewer', 'commenter', 'editor', 'owner');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.jacdoc_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.jacdocs(id) on delete cascade,

  -- user_id pour partage direct interne JacSuite.
  shared_with_user_id uuid references auth.users(id) on delete cascade,

  -- email pour invitation future / user pas encore inscrit.
  shared_with_email text,

  role public.jacdoc_share_role not null default 'viewer',

  -- Lien partageable optionnel.
  token text unique,
  token_enabled boolean not null default false,
  token_expires_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jacdoc_share_target_check check (
    shared_with_user_id is not null
    or shared_with_email is not null
    or token is not null
  )
);

create index if not exists jacdoc_shares_document_idx
  on public.jacdoc_shares(document_id);

create index if not exists jacdoc_shares_user_idx
  on public.jacdoc_shares(shared_with_user_id);

create index if not exists jacdoc_shares_email_idx
  on public.jacdoc_shares(lower(shared_with_email));

-- Anti-doublons : un même user/email ne reçoit pas 12 fois le même doc.
create unique index if not exists jacdoc_shares_unique_user_per_doc
  on public.jacdoc_shares(document_id, shared_with_user_id)
  where shared_with_user_id is not null;

create unique index if not exists jacdoc_shares_unique_email_per_doc
  on public.jacdoc_shares(document_id, lower(shared_with_email))
  where shared_with_email is not null;

-- ─────────────────────────────────────────────────────────────
-- Helpers RLS
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_jacdoc_owner(p_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jacdocs d
    where d.id = p_document_id
      and d.user_id = auth.uid()
  );
$$;

create or replace function public.jacdoc_role_for_current_user(p_document_id uuid)
returns public.jacdoc_share_role
language sql
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.jacdocs d
      where d.id = p_document_id
        and d.user_id = auth.uid()
    ) then 'owner'::public.jacdoc_share_role
    else (
      select s.role
      from public.jacdoc_shares s
      left join auth.users u on u.id = auth.uid()
      where s.document_id = p_document_id
        and (
          s.shared_with_user_id = auth.uid()
          or (
            s.shared_with_email is not null
            and lower(s.shared_with_email) = lower(coalesce(u.email, ''))
          )
        )
      order by
        case s.role
          when 'owner' then 4
          when 'editor' then 3
          when 'commenter' then 2
          else 1
        end desc
      limit 1
    )
  end;
$$;

create or replace function public.can_read_jacdoc(p_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.jacdoc_role_for_current_user(p_document_id) is not null;
$$;

create or replace function public.can_edit_jacdoc(p_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.jacdoc_role_for_current_user(p_document_id) in ('owner', 'editor');
$$;

-- Match invitation par email avec l'utilisateur connecté.
-- Utile tant que l'auth globale JacSuite ne résout pas automatiquement les
-- emails vers shared_with_user_id.
create or replace function public.has_jacdoc_email_share(p_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jacdoc_shares s
    join auth.users u on u.id = auth.uid()
    where s.document_id = p_document_id
      and s.shared_with_email is not null
      and lower(s.shared_with_email) = lower(coalesce(u.email, ''))
  );
$$;

create or replace function public.can_read_jacdoc_with_email(p_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.can_read_jacdoc(p_document_id)
    or public.has_jacdoc_email_share(p_document_id);
$$;

-- Redemption d'un lien public JacDoc.
-- Le token reste multi-use : chaque user connecté peut le redeem une fois,
-- puis obtient une row user_id-based avec le rôle du lien.
create or replace function public.redeem_jacdoc_share_token(p_token text)
returns table(document_id uuid, role public.jacdoc_share_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.jacdoc_shares%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into token_row
  from public.jacdoc_shares s
  where s.token = p_token
    and s.token_enabled = true
    and (s.token_expires_at is null or s.token_expires_at > now())
  limit 1;

  if token_row.id is null then
    raise exception 'invalid_token';
  end if;

  insert into public.jacdoc_shares (
    document_id,
    shared_with_user_id,
    role,
    created_by
  )
  values (
    token_row.document_id,
    auth.uid(),
    token_row.role,
    token_row.created_by
  )
  on conflict do nothing;

  return query select token_row.document_id, token_row.role;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.jacdoc_folders enable row level security;
alter table public.jacdocs enable row level security;
alter table public.jacdoc_shares enable row level security;

drop policy if exists "jacdoc_folders_select_own" on public.jacdoc_folders;
create policy "jacdoc_folders_select_own"
on public.jacdoc_folders
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "jacdoc_folders_insert_own" on public.jacdoc_folders;
create policy "jacdoc_folders_insert_own"
on public.jacdoc_folders
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "jacdoc_folders_update_own" on public.jacdoc_folders;
create policy "jacdoc_folders_update_own"
on public.jacdoc_folders
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "jacdoc_folders_delete_own" on public.jacdoc_folders;
create policy "jacdoc_folders_delete_own"
on public.jacdoc_folders
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "jacdocs_select_owner_or_shared" on public.jacdocs;
create policy "jacdocs_select_owner_or_shared"
on public.jacdocs
for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_read_jacdoc_with_email(id)
);

drop policy if exists "jacdocs_insert_own" on public.jacdocs;
create policy "jacdocs_insert_own"
on public.jacdocs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "jacdocs_update_owner_or_editor" on public.jacdocs;
create policy "jacdocs_update_owner_or_editor"
on public.jacdocs
for update
to authenticated
using (
  user_id = auth.uid()
  or public.can_edit_jacdoc(id)
)
with check (
  user_id = auth.uid()
  or public.can_edit_jacdoc(id)
);

drop policy if exists "jacdocs_delete_owner" on public.jacdocs;
create policy "jacdocs_delete_owner"
on public.jacdocs
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "jacdoc_shares_select_involved" on public.jacdoc_shares;
create policy "jacdoc_shares_select_involved"
on public.jacdoc_shares
for select
to authenticated
using (
  shared_with_user_id = auth.uid()
  or public.has_jacdoc_email_share(document_id)
  or public.is_jacdoc_owner(document_id)
);

drop policy if exists "jacdoc_shares_manage_owner" on public.jacdoc_shares;
create policy "jacdoc_shares_manage_owner"
on public.jacdoc_shares
for all
to authenticated
using (public.is_jacdoc_owner(document_id))
with check (public.is_jacdoc_owner(document_id));

-- ─────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────

do $$
begin
  begin
    alter publication supabase_realtime add table public.jacdocs;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.jacdoc_shares;
  exception
    when duplicate_object then null;
  end;
end $$;