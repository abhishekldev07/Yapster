-- Phase 3: automatically audit member mute/ban state changes.

alter table public.moderation_log
  add column if not exists target_user_id uuid references auth.users(id) on delete set null;

create index if not exists moderation_log_target_user_idx
  on public.moderation_log (target_user_id);

create or replace function public.log_membership_moderation_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.muted is distinct from new.muted then
    insert into public.moderation_log (
      community_id,
      actor_id,
      action_type,
      target_type,
      target_user_id,
      note
    ) values (
      new.community_id,
      (select auth.uid()),
      case when new.muted then 'member_muted' else 'member_unmuted' end,
      'member',
      new.user_id,
      case when new.muted then 'Muted a community member' else 'Unmuted a community member' end
    );
  end if;

  if old.banned is distinct from new.banned then
    insert into public.moderation_log (
      community_id,
      actor_id,
      action_type,
      target_type,
      target_user_id,
      note
    ) values (
      new.community_id,
      (select auth.uid()),
      case when new.banned then 'member_banned' else 'member_unbanned' end,
      'member',
      new.user_id,
      case when new.banned then 'Banned a community member' else 'Unbanned a community member' end
    );
  end if;

  return new;
end;
$$;

revoke all on function public.log_membership_moderation_change() from public, anon, authenticated;

drop trigger if exists community_members_moderation_log_trigger on public.community_members;
create trigger community_members_moderation_log_trigger
after update of muted, banned on public.community_members
for each row
when (
  old.muted is distinct from new.muted
  or old.banned is distinct from new.banned
)
execute function public.log_membership_moderation_change();
