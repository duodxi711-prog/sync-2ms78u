begin;

create schema if not exists adrelay_private;
revoke all on schema adrelay_private from public, anon;
grant usage on schema adrelay_private to authenticated;

create table public.adrelay_members (
    user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
    email text not null default (auth.jwt() ->> 'email') check (btrim(email) <> ''),
    display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
    member_code text unique check (member_code ~ '^[A-Z0-9]{2,16}$'),
    role text not null default 'employee' check (role in ('admin', 'employee')),
    status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
    created_at timestamptz not null default now(),
    check (role <> 'employee' or status <> 'active' or member_code is not null)
);

alter table public.adrelay_members enable row level security;
revoke all on table public.adrelay_members from public, anon, authenticated;
grant select on table public.adrelay_members to authenticated;
grant insert (display_name) on table public.adrelay_members to authenticated;
grant update (status, member_code) on table public.adrelay_members to authenticated;

create function adrelay_private.active_member_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select member.role
    from public.adrelay_members as member
    where member.user_id = (select auth.uid()) and member.status = 'active';
$$;

revoke all on function adrelay_private.active_member_role() from public, anon;
grant execute on function adrelay_private.active_member_role() to authenticated;

create policy adrelay_members_read
on public.adrelay_members for select to authenticated
using (user_id = (select auth.uid()) or (select adrelay_private.active_member_role()) = 'admin');

create policy adrelay_members_apply
on public.adrelay_members for insert to authenticated
with check (
    user_id = (select auth.uid())
    and email = (select auth.jwt() ->> 'email')
    and role = 'employee'
    and status = 'pending'
    and member_code is null
);

create policy adrelay_members_admin_review
on public.adrelay_members for update to authenticated
using (role = 'employee' and (select adrelay_private.active_member_role()) = 'admin')
with check (role = 'employee' and (select adrelay_private.active_member_role()) = 'admin');

commit;
