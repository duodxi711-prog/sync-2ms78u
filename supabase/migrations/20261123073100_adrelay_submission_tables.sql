begin;

create table public.adrelay_daily_reports (
    user_id uuid not null default auth.uid() references public.adrelay_members(user_id),
    report_date date not null,
    offer text not null check (offer = lower(btrim(offer)) and char_length(offer) between 1 and 80),
    platform text not null check (platform in ('facebook', 'newsbreak')),
    spend numeric(12,2) not null check (spend >= 0 and spend <> 'NaN'::numeric),
    clicks integer check (clicks >= 0),
    purchases integer not null check (purchases >= 0),
    revenue numeric(12,2) not null check (revenue >= 0 and revenue <> 'NaN'::numeric),
    primary key (user_id, report_date, offer, platform)
);

create table public.adrelay_ad_test_reports (
    user_id uuid not null default auth.uid() references public.adrelay_members(user_id),
    task_id bigint not null references public.tasks(id),
    report_date date not null,
    spend numeric(12,2) not null check (spend >= 0 and spend <> 'NaN'::numeric),
    cpc numeric(12,4) check (cpc >= 0 and cpc <> 'NaN'::numeric),
    purchases integer not null check (purchases >= 0),
    note text check (char_length(note) <= 1000),
    primary key (user_id, task_id, report_date)
);

alter table public.adrelay_daily_reports enable row level security;
alter table public.adrelay_ad_test_reports enable row level security;
revoke all on table public.adrelay_daily_reports, public.adrelay_ad_test_reports from public, anon, authenticated;
grant select on table public.adrelay_daily_reports, public.adrelay_ad_test_reports to authenticated;
grant insert (report_date, offer, platform, spend, clicks, purchases, revenue),
    update (spend, clicks, purchases, revenue) on public.adrelay_daily_reports to authenticated;
grant insert (task_id, report_date, spend, cpc, purchases, note),
    update (spend, cpc, purchases, note) on public.adrelay_ad_test_reports to authenticated;

create function adrelay_private.is_assigned_task(requested_task_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1
        from public.adrelay_members as member
        join public.tasks as task on task.claimed_by = member.member_code
        where member.user_id = (select auth.uid())
            and member.status = 'active'
            and task.id = requested_task_id
    );
$$;

revoke all on function adrelay_private.is_assigned_task(bigint) from public, anon;
grant execute on function adrelay_private.is_assigned_task(bigint) to authenticated;

create policy adrelay_daily_read on public.adrelay_daily_reports for select to authenticated
using (
    (select adrelay_private.active_member_role()) = 'admin'
    or (user_id = (select auth.uid()) and (select adrelay_private.active_member_role()) = 'employee')
);

create policy adrelay_daily_submit on public.adrelay_daily_reports for insert to authenticated
with check (user_id = (select auth.uid()) and (select adrelay_private.active_member_role()) is not null);

create policy adrelay_daily_edit on public.adrelay_daily_reports for update to authenticated
using (
    (select adrelay_private.active_member_role()) = 'admin'
    or (user_id = (select auth.uid()) and (select adrelay_private.active_member_role()) = 'employee')
)
with check (
    (select adrelay_private.active_member_role()) = 'admin'
    or (user_id = (select auth.uid()) and (select adrelay_private.active_member_role()) = 'employee')
);

create policy adrelay_ad_test_read on public.adrelay_ad_test_reports for select to authenticated
using (
    (select adrelay_private.active_member_role()) = 'admin'
    or (user_id = (select auth.uid()) and (select adrelay_private.active_member_role()) = 'employee')
);

create policy adrelay_ad_test_submit on public.adrelay_ad_test_reports for insert to authenticated
with check (user_id = (select auth.uid()) and adrelay_private.is_assigned_task(task_id));

create policy adrelay_ad_test_edit on public.adrelay_ad_test_reports for update to authenticated
using (
    (select adrelay_private.active_member_role()) = 'admin'
    or (user_id = (select auth.uid()) and adrelay_private.is_assigned_task(task_id))
)
with check (
    (select adrelay_private.active_member_role()) = 'admin'
    or (user_id = (select auth.uid()) and adrelay_private.is_assigned_task(task_id))
);

commit;
