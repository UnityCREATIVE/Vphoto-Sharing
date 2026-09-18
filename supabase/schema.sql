-- Run once in Supabase SQL Editor, then run seed.sql.
create table public.projects (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 description text not null default '',
 instructions text not null default '',
 password_hash text,
 password_version uuid not null default gen_random_uuid(),
 created timestamptz not null default now()
);
create table public.albums (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 section text not null default 'Galleries',
 number text not null default '',
 title text not null,
 teacher text not null default '',
 url text not null default '',
 sort integer not null default 0,
 complete integer not null default 0 check(complete in (0,1)),
 reviewer text not null default '',
 updated timestamptz,
 version integer not null default 0
);
create index albums_project_sort on public.albums(project_id,sort);
create table public.login_attempts (
 key text primary key,
 started timestamptz not null,
 attempts integer not null
);
alter table public.projects enable row level security;
alter table public.albums enable row level security;
alter table public.login_attempts enable row level security;
-- All access goes through authenticated Next.js server routes.
-- The browser never receives a service key or project password hash.
revoke all on public.projects,public.albums,public.login_attempts from anon,authenticated;
grant all on public.projects,public.albums,public.login_attempts to service_role;
create or replace function public.consume_login_attempt(bucket_key text)
returns boolean language plpgsql security definer set search_path=public as $$
declare count_now integer;
begin
 delete from public.login_attempts where started < now() - interval '1 day';
 insert into public.login_attempts(key,started,attempts) values(bucket_key,now(),1)
 on conflict(key) do update set
 attempts=case when login_attempts.started < now()-interval '15 minutes' then 1 else login_attempts.attempts+1 end,
 started=case when login_attempts.started < now()-interval '15 minutes' then now() else login_attempts.started end
 returning attempts into count_now;
 return count_now<=30;
end;
$$;
revoke all on function public.consume_login_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_login_attempt(text) to service_role;
