-- Phase 2 hardening: cover frequently used foreign keys and feed/discussion joins.

create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists comments_parent_comment_id_idx on public.comments (parent_comment_id);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists communities_created_by_idx on public.communities (created_by);
create index if not exists community_members_user_id_idx on public.community_members (user_id);
create index if not exists votes_user_id_idx on public.votes (user_id);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_post_id_idx on public.notifications (post_id);
create index if not exists notifications_comment_id_idx on public.notifications (comment_id);
create index if not exists notifications_community_id_idx on public.notifications (community_id);
create index if not exists poll_votes_option_post_idx on public.poll_votes (option_id, post_id);
