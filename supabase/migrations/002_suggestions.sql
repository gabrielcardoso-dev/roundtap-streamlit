begin;

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  category text not null check (category in ('melhoria','erro','novo_recurso','outro')),
  title text not null check (char_length(title) between 3 and 100),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'nova' check (status in ('nova','em_analise','planejada','concluida','recusada')),
  priority text not null default 'normal' check (priority in ('baixa','normal','alta')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suggestions_user_created_idx
  on public.suggestions(user_id, created_at desc);
create index if not exists suggestions_admin_queue_idx
  on public.suggestions(status, priority, created_at desc);

alter table public.suggestions enable row level security;
revoke all on public.suggestions from anon;
grant select, insert, update on public.suggestions to authenticated;

drop policy if exists "suggestions_insert_own" on public.suggestions;
create policy "suggestions_insert_own" on public.suggestions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and lower(user_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and status = 'nova'
    and priority = 'normal'
    and admin_notes is null
  );

drop policy if exists "suggestions_select_own_or_admin" on public.suggestions;
create policy "suggestions_select_own_or_admin" on public.suggestions
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'sgabrielcardosoc7@gmail.com'
  );

drop policy if exists "suggestions_update_admin" on public.suggestions;
create policy "suggestions_update_admin" on public.suggestions
  for update to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'sgabrielcardosoc7@gmail.com')
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'sgabrielcardosoc7@gmail.com');

commit;
