begin;

create table public.adrelay_daily_reports (
    user_id uuid not null default auth.uid() references public.adrelay_members(user_id),
    report_date date not null,
    offer text not null check (offer = lower(btrim(offer)) and char_length(offer) between 1 and 80),
    platform text not null check (platform in ('facebook', 'newsbreak')),
    spend numeric(12,2) not null check (spend >= 0 and spend <> 'NaN'::numeric),
    cpc numeric(12,4) check (cpc >= 0 and cpc <> 'NaN'::numeric),
    purchases integer not null check (purchases >= 0),
    revenue numeric(12,2) not null check (revenue >= 0 and revenue <> 'NaN'::numeric),
    primary key (user_id, report_date, offer, platform)
);

alter table public.adrelay_daily_reports enable row level security;
revoke all on table public.adrelay_daily_reports from public, anon, authenticated;
grant select on table public.adrelay_daily_reports to authenticated;
grant insert (report_date, offer, platform, spend, cpc, purchases, revenue),
    update (spend, cpc, purchases, revenue) on public.adrelay_daily_reports to authenticated;

create index adrelay_daily_reports_date_offer
    on public.adrelay_daily_reports (report_date desc, offer, platform, user_id);

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

create function public.adrelay_save_daily_report(
    entry_date date, entry_offer text, entry_platform text, entry_spend numeric,
    entry_cpc numeric, entry_purchases integer, entry_revenue numeric
)
returns void
language sql security invoker set search_path = ''
as $$
    insert into public.adrelay_daily_reports (report_date, offer, platform, spend, cpc, purchases, revenue)
    values (entry_date, lower(btrim(entry_offer)), entry_platform, entry_spend, entry_cpc, entry_purchases, entry_revenue)
    on conflict (user_id, report_date, offer, platform) do update
        set spend = excluded.spend, cpc = excluded.cpc, purchases = excluded.purchases, revenue = excluded.revenue;
$$;

create function adrelay_private.daily_report_totals(first_day date, last_day date, selected_offer text)
returns table (report_date date, spend numeric, purchases bigint, revenue numeric)
language sql stable security definer set search_path = ''
as $$
    select report.report_date, sum(report.spend), sum(report.purchases), sum(report.revenue)
    from public.adrelay_daily_reports as report
    where (select adrelay_private.active_member_role()) in ('admin', 'employee')
        and last_day - first_day between 0 and 365
        and report.report_date between first_day and last_day
        and (selected_offer is null or report.offer = lower(btrim(selected_offer)))
    group by report.report_date
    order by report.report_date desc;
$$;

create function public.adrelay_daily_report_totals(first_day date, last_day date, selected_offer text default null)
returns table (report_date date, spend numeric, purchases bigint, revenue numeric)
language sql stable security invoker set search_path = ''
as $$ select * from adrelay_private.daily_report_totals(first_day, last_day, selected_offer); $$;

revoke all on function public.adrelay_save_daily_report(date, text, text, numeric, numeric, integer, numeric) from public, anon;
revoke all on function adrelay_private.daily_report_totals(date, date, text) from public, anon;
revoke all on function public.adrelay_daily_report_totals(date, date, text) from public, anon;
grant execute on function public.adrelay_save_daily_report(date, text, text, numeric, numeric, integer, numeric) to authenticated;
grant execute on function adrelay_private.daily_report_totals(date, date, text), public.adrelay_daily_report_totals(date, date, text) to authenticated;

commit;
