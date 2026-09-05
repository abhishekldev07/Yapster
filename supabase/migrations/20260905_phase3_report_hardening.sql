-- Phase 3 hardening: reporters can only create open reports; moderators can only update review fields.

revoke update on public.reports from authenticated;
grant update (status, reviewed_at, reviewed_by, resolution_note) on public.reports to authenticated;

drop policy if exists "Users can submit reports" on public.reports;
create policy "Users can submit reports"
on public.reports for insert
to authenticated
with check (
  (select auth.uid()) = reporter_id
  and status = 'open'
  and reviewed_at is null
  and reviewed_by is null
  and resolution_note = ''
  and (
    (
      target_type = 'post'
      and exists (
        select 1 from public.posts p
        where p.id = target_id
          and p.community_id = reports.community_id
      )
    )
    or
    (
      target_type = 'comment'
      and exists (
        select 1
        from public.comments c
        join public.posts p on p.id = c.post_id
        where c.id = target_id
          and p.community_id = reports.community_id
      )
    )
  )
);
