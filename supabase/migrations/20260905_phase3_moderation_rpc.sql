-- Phase 3: atomic report review/removal helpers.
-- These security-invoker RPCs keep report updates and moderation-log writes in one transaction.

create or replace function public.review_report(
  p_report_id bigint,
  p_action text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  report_row public.reports%rowtype;
begin
  if p_action not in ('resolved', 'dismissed') then
    raise exception 'Invalid report action';
  end if;

  select *
  into report_row
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found or access denied';
  end if;

  if report_row.status not in ('open', 'reviewing') then
    raise exception 'This report has already been reviewed';
  end if;

  update public.reports
  set
    status = p_action,
    reviewed_at = now(),
    reviewed_by = (select auth.uid())
  where id = report_row.id;

  insert into public.moderation_log (
    community_id,
    actor_id,
    action_type,
    target_type,
    target_id,
    note
  ) values (
    report_row.community_id,
    (select auth.uid()),
    case when p_action = 'resolved' then 'report_resolved' else 'report_dismissed' end,
    'report',
    report_row.id,
    report_row.reason || ' · ' || report_row.target_type || ' #' || report_row.target_id
  );
end;
$$;

create or replace function public.remove_reported_content(
  p_report_id bigint
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  report_row public.reports%rowtype;
  affected_rows integer;
begin
  select *
  into report_row
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found or access denied';
  end if;

  if report_row.status not in ('open', 'reviewing') then
    raise exception 'This report has already been reviewed';
  end if;

  if report_row.target_type = 'post' then
    delete from public.posts
    where id = report_row.target_id
      and community_id = report_row.community_id;
    get diagnostics affected_rows = row_count;
  elsif report_row.target_type = 'comment' then
    delete from public.comments
    where id = report_row.target_id;
    get diagnostics affected_rows = row_count;
  else
    raise exception 'Unsupported report target';
  end if;

  if affected_rows = 0 then
    raise exception 'Reported content is no longer available or cannot be removed';
  end if;

  update public.reports
  set
    status = 'resolved',
    reviewed_at = now(),
    reviewed_by = (select auth.uid())
  where id = report_row.id;

  insert into public.moderation_log (
    community_id,
    actor_id,
    action_type,
    target_type,
    target_id,
    note
  ) values (
    report_row.community_id,
    (select auth.uid()),
    case when report_row.target_type = 'post' then 'post_removed' else 'comment_removed' end,
    report_row.target_type,
    report_row.target_id,
    'Removed after report #' || report_row.id || ': ' || report_row.reason
  );
end;
$$;

revoke all on function public.review_report(bigint, text) from public, anon;
revoke all on function public.remove_reported_content(bigint) from public, anon;
grant execute on function public.review_report(bigint, text) to authenticated;
grant execute on function public.remove_reported_content(bigint) to authenticated;
