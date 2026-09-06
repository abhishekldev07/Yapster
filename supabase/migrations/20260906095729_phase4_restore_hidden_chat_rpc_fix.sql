create or replace function public.get_or_create_direct_conversation(p_other_user uuid)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  low_user uuid;
  high_user uuid;
  v_conversation_id bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_other_user is null or p_other_user = current_user_id then raise exception 'Choose another Yapster member'; end if;
  if not exists(select 1 from public.profiles where id = p_other_user) then raise exception 'Profile not found'; end if;
  if exists(
    select 1 from public.user_blocks b
    where (b.blocker_id = current_user_id and b.blocked_id = p_other_user)
       or (b.blocker_id = p_other_user and b.blocked_id = current_user_id)
  ) then raise exception 'Messaging is unavailable between these users'; end if;

  if current_user_id::text < p_other_user::text then
    low_user := current_user_id;
    high_user := p_other_user;
  else
    low_user := p_other_user;
    high_user := current_user_id;
  end if;

  insert into public.direct_conversations(user_low, user_high)
  values(low_user, high_user)
  on conflict(user_low, user_high) do nothing;

  select c.id into v_conversation_id
  from public.direct_conversations c
  where c.user_low = low_user and c.user_high = high_user;

  insert into public.direct_conversation_states(conversation_id, user_id, hidden_at)
  values(v_conversation_id, current_user_id, null)
  on conflict(conversation_id, user_id)
  do update set hidden_at = null;

  return v_conversation_id;
end;
$$;