-- Phase 4: least-privilege Data API grants for social and messaging tables.

revoke all privileges on table public.user_follows from anon, authenticated;
grant select on table public.user_follows to anon, authenticated;
grant insert, delete on table public.user_follows to authenticated;

revoke all privileges on table public.direct_conversations from anon, authenticated;
grant select, insert on table public.direct_conversations to authenticated;

revoke all privileges on table public.direct_messages from anon, authenticated;
grant select, insert on table public.direct_messages to authenticated;
grant update(read_at) on table public.direct_messages to authenticated;
