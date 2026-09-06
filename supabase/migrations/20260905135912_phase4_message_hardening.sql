-- Phase 4: conversation recency is maintained only by the message trigger.
-- Participants should not be able to spoof last_message_at from the client.

drop policy if exists "Participants can update conversation recency" on public.direct_conversations;
revoke update(last_message_at) on public.direct_conversations from authenticated;
