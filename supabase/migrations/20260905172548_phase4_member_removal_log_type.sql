alter table public.moderation_log drop constraint if exists moderation_log_action_type_check;

alter table public.moderation_log add constraint moderation_log_action_type_check check (
  action_type = any(array[
    'report_resolved','report_dismissed','post_removed','comment_removed',
    'member_muted','member_unmuted','member_banned','member_unbanned','member_removed'
  ]::text[])
);
