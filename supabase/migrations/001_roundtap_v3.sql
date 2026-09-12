begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  mode text not null check (mode in ('rounds','fortime','amrap','emom')),
  goal integer not null check (goal between 1 and 999),
  duration_sec integer not null default 0 check (duration_sec between 0 and 86400),
  work_sec integer not null default 0 check (work_sec between 0 and 3600),
  rest_sec integer not null default 0 check (rest_sec between 0 and 1800),
  rounds integer not null check (rounds between 0 and 9999),
  partial_reps integer not null default 0 check (partial_reps between 0 and 99999),
  elapsed_ms bigint not null check (elapsed_ms between 0 and 86400000),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists workouts_user_completed_idx on public.workouts(user_id, completed_at desc);

alter table public.profiles enable row level security;
alter table public.workouts enable row level security;

revoke all on public.profiles from anon;
revoke all on public.workouts from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "workouts_select_own" on public.workouts;
create policy "workouts_select_own" on public.workouts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own" on public.workouts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "workouts_update_own" on public.workouts;
create policy "workouts_update_own" on public.workouts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "workouts_delete_own" on public.workouts;
create policy "workouts_delete_own" on public.workouts for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

insert into public.profiles (id, full_name)
select id, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

commit;
