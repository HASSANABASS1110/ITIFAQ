-- ============================================
-- اتفاق — إعداد قاعدة البيانات كاملة
-- انسخ الملف ده كله والصقه في Supabase ← SQL Editor ← New query ← Run
-- ============================================

create extension if not exists pgcrypto;

-- ١) الجداول
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text not null default '',
  buyer_name text not null default '',
  link_token uuid not null default gen_random_uuid() unique,
  status text not null default 'new' check (status in ('new', 'filling', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists public.briefs (
  client_id uuid primary key references public.clients (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  step int not null default 1,
  readiness int,
  agreement jsonb not null default '{"client": false, "buyer": false}'::jsonb,
  started_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  field text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ٢) حماية الصفوف: كل ميديا باير يشوف بياناته بس
alter table public.clients enable row level security;
alter table public.briefs enable row level security;
alter table public.notifications enable row level security;
alter table public.events enable row level security;
alter table public.comments enable row level security;

create policy "own clients" on public.clients
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own briefs" on public.briefs
  for all to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy "own notifications" on public.notifications
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own events" on public.events
  for all to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy "own comments" on public.comments
  for all to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- ٣) دوال العميل (من غير حساب، بسر اللينك بس)
-- اللينك فيه توكن عشوائي مستحيل يتخمّن، والدوال دي هي الطريقة الوحيدة اللي العميل يوصل بيها لبياناته

create or replace function public.get_brief_by_token(p_token uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_client public.clients;
  v_brief public.briefs;
  v_comments json;
begin
  select * into v_client from public.clients where link_token = p_token;
  if not found then return null; end if;

  select * into v_brief from public.briefs where client_id = v_client.id;

  select coalesce(json_agg(json_build_object('field', c.field, 'body', c.body) order by c.created_at), '[]'::json)
    into v_comments
    from public.comments c where c.client_id = v_client.id;

  return json_build_object(
    'client', json_build_object(
      'name', v_client.name,
      'brand', v_client.brand,
      'buyerName', v_client.buyer_name,
      'status', v_client.status
    ),
    'data', coalesce(v_brief.data, '{}'::jsonb),
    'step', coalesce(v_brief.step, 1),
    'submitted', v_brief.submitted_at is not null,
    'readiness', v_brief.readiness,
    'agreement', coalesce(v_brief.agreement, '{"client": false, "buyer": false}'::jsonb),
    'comments', v_comments
  );
end;
$$;

create or replace function public.save_brief_draft(p_token uuid, p_data jsonb, p_step int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_client public.clients;
begin
  select * into v_client from public.clients where link_token = p_token;
  if not found then return false; end if;

  insert into public.briefs (client_id, data, step, started_at, updated_at)
  values (v_client.id, coalesce(p_data, '{}'::jsonb), greatest(1, least(coalesce(p_step, 1), 5)), now(), now())
  on conflict (client_id) do update
    set data = excluded.data,
        step = excluded.step,
        updated_at = now()
    where public.briefs.submitted_at is null;

  if v_client.status = 'new' then
    update public.clients set status = 'filling' where id = v_client.id;
    insert into public.events (client_id, body) values (v_client.id, 'بدأ يملى البريف');
    insert into public.notifications (user_id, client_id, body)
      values (v_client.user_id, v_client.id, v_client.name || ' بدأ يملى البريف');
  end if;

  return true;
end;
$$;

create or replace function public.submit_brief(p_token uuid, p_data jsonb, p_readiness int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_client public.clients;
begin
  select * into v_client from public.clients where link_token = p_token;
  if not found then return false; end if;

  insert into public.briefs (client_id, data, step, readiness, started_at, submitted_at, updated_at)
  values (v_client.id, coalesce(p_data, '{}'::jsonb), 5, p_readiness, now(), now(), now())
  on conflict (client_id) do update
    set data = excluded.data,
        readiness = excluded.readiness,
        submitted_at = now(),
        updated_at = now();

  update public.clients set status = 'done' where id = v_client.id;

  insert into public.events (client_id, body) values (v_client.id, 'البريف اكتمل ✅');
  insert into public.notifications (user_id, client_id, body)
    values (v_client.user_id, v_client.id, v_client.name || ' خلّص البريف بتاعه ✅');

  return true;
end;
$$;

create or replace function public.confirm_agreement_client(p_token uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_client public.clients;
begin
  select * into v_client from public.clients where link_token = p_token;
  if not found then return false; end if;

  update public.briefs
    set agreement = jsonb_set(coalesce(agreement, '{}'::jsonb), '{client}', 'true'::jsonb),
        updated_at = now()
    where client_id = v_client.id;

  insert into public.events (client_id, body) values (v_client.id, 'العميل أكد نقاط الاتفاق 🤝');
  insert into public.notifications (user_id, client_id, body)
    values (v_client.user_id, v_client.id, v_client.name || ' أكد نقاط الاتفاق 🤝');

  return true;
end;
$$;

grant execute on function public.get_brief_by_token(uuid) to anon, authenticated;
grant execute on function public.save_brief_draft(uuid, jsonb, int) to anon, authenticated;
grant execute on function public.submit_brief(uuid, jsonb, int) to anon, authenticated;
grant execute on function public.confirm_agreement_client(uuid) to anon, authenticated;

-- ٤) تخزين الملفات (صور وفيديوهات المنتج) — Bucket خاص، مش عام
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

-- الرفع: العميل يرفع في فولدر اسمه توكن اللينك بتاعه بس
create policy "asset upload by link token" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'assets'
    and exists (
      select 1 from public.clients c
      where c.link_token::text = (storage.foldername(name))[1]
    )
  );

-- القراءة: اللي معاه توكن اللينك (العميل)، أو الميديا باير صاحب العميل بس
-- ولو العميل اتمسح، التوكن بيبطّل والوصول للملفات بيقف فوراً
create policy "asset read by token or owner" on storage.objects
  for select
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from public.clients c
      where c.link_token::text = (storage.foldername(name))[1]
        and (c.user_id = auth.uid() or auth.role() = 'anon')
    )
  );

create policy "owner deletes assets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from public.clients c
      where c.link_token::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  );

-- ٥) الإشعارات اللحظية للوحة التحكم
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
