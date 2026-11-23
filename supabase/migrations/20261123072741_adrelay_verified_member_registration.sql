begin;

create table adrelay_private.owner_settings (
    single_row boolean primary key default true check (single_row),
    email text not null check (email = lower(btrim(email)) and email <> '')
);
revoke all on table adrelay_private.owner_settings from public, anon, authenticated;

create unique index adrelay_single_admin
on public.adrelay_members (role) where role = 'admin';

drop policy adrelay_members_apply on public.adrelay_members;
revoke insert (display_name) on public.adrelay_members from authenticated;

create function adrelay_private.register_member(requested_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := (select auth.uid());
    confirmed_email text;
    is_owner boolean;
begin
    select lower(btrim(email)) into confirmed_email
    from auth.users
    where id = current_user_id and email_confirmed_at is not null;
    if confirmed_email is null then
        raise exception 'A confirmed email is required' using errcode = '42501';
    end if;

    select exists (
        select 1
        from adrelay_private.owner_settings
        where email = confirmed_email
    ) into is_owner;

    insert into public.adrelay_members (user_id, email, display_name, role, status)
    values (
        current_user_id, confirmed_email, btrim(requested_name),
        case when is_owner then 'admin' else 'employee' end,
        case when is_owner then 'active' else 'pending' end
    )
    on conflict (user_id) do nothing;
end;
$$;

revoke all on function adrelay_private.register_member(text) from public, anon;
grant execute on function adrelay_private.register_member(text) to authenticated;

create function public.adrelay_register_member(requested_name text)
returns void
language sql security invoker set search_path = ''
as $$ select adrelay_private.register_member(requested_name); $$;

revoke all on function public.adrelay_register_member(text) from public, anon;
grant execute on function public.adrelay_register_member(text) to authenticated;

commit;
