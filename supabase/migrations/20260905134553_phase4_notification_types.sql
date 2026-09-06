-- Phase 4 notification type expansion.

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'post_comment'::text,
    'comment_reply'::text,
    'mention'::text,
    'community_moderation'::text,
    'moderator_promotion'::text,
    'user_follow'::text
  ])
);
