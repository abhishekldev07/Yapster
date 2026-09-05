create schema if not exists private;

alter function public.remove_community_member(bigint, uuid, text) set schema private;
revoke all on function private.remove_community_member(bigint, uuid, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.remove_community_member(bigint, uuid, text) to authenticated;

create or replace function public.remove_community_member(
  p_community_id bigint,
  p_user_id uuid,
  p_reason text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_community_member(p_community_id, p_user_id, p_reason);
$$;

revoke all on function public.remove_community_member(bigint, uuid, text) from public, anon;
grant execute on function public.remove_community_member(bigint, uuid, text) to authenticated;

create index if not exists direct_conversation_states_user_id_idx
  on public.direct_conversation_states(user_id);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks(blocked_id);
