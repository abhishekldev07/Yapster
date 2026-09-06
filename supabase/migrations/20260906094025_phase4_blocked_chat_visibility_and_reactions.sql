create or replace function public.cleanup_social_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;
revoke all on function public.cleanup_social_on_block() from public, anon, authenticated;

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
  conversation_id bigint;
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
    low_user := current_user_id; high_user := p_other_user;
  else
    low_user := p_other_user; high_user := current_user_id;
  end if;

  insert into public.direct_conversations(user_low, user_high)
  values(low_user, high_user)
  on conflict(user_low, user_high) do nothing;

  select id into conversation_id
  from public.direct_conversations
  where user_low = low_user and user_high = high_user;

  insert into public.direct_conversation_states(conversation_id, user_id, hidden_at)
  values(conversation_id, current_user_id, null)
  on conflict(conversation_id, user_id)
  do update set hidden_at = null;

  return conversation_id;
end;
$$;

drop policy if exists "Users can react to visible conversation messages" on public.direct_message_reactions;
create policy "Users can react to visible conversation messages"
on public.direct_message_reactions for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = direct_message_reactions.message_id
      and ((select auth.uid()) = c.user_low or (select auth.uid()) = c.user_high)
      and m.deleted_at is null
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = c.user_low and b.blocked_id = c.user_high)
           or (b.blocker_id = c.user_high and b.blocked_id = c.user_low)
      )
  )
);

drop policy if exists "Users can change their own message reaction" on public.direct_message_reactions;
create policy "Users can change their own message reaction"
on public.direct_message_reactions for update to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = direct_message_reactions.message_id
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = c.user_low and b.blocked_id = c.user_high)
           or (b.blocker_id = c.user_high and b.blocked_id = c.user_low)
      )
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = direct_message_reactions.message_id
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = c.user_low and b.blocked_id = c.user_high)
           or (b.blocker_id = c.user_high and b.blocked_id = c.user_low)
      )
  )
);

drop policy if exists "Users can remove their own message reaction" on public.direct_message_reactions;
create policy "Users can remove their own message reaction"
on public.direct_message_reactions for delete to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = direct_message_reactions.message_id
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = c.user_low and b.blocked_id = c.user_high)
           or (b.blocker_id = c.user_high and b.blocked_id = c.user_low)
      )
  )
);

update public.direct_conversation_states s
set hidden_at = null
from public.direct_conversations c
join public.user_blocks b
  on (c.user_low = b.blocker_id and c.user_high = b.blocked_id)
  or (c.user_low = b.blocked_id and c.user_high = b.blocker_id)
where s.conversation_id = c.id
  and s.user_id = b.blocker_id
  and s.hidden_at is not null
  and s.hidden_at >= b.created_at - interval '5 seconds';