create or replace function public.guard_direct_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_blocked boolean := false;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at
     or new.replied_to_message_id is distinct from old.replied_to_message_id then
    raise exception 'Message identity cannot be changed';
  end if;

  if new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at then
    select exists (
      select 1
      from public.direct_conversations c
      join public.user_blocks b
        on (b.blocker_id = c.user_low and b.blocked_id = c.user_high)
        or (b.blocker_id = c.user_high and b.blocked_id = c.user_low)
      where c.id = old.conversation_id
    ) into v_blocked;

    if v_blocked then raise exception 'Unblock to interact again'; end if;
    if old.sender_id <> v_user then raise exception 'You can only edit or delete your own messages'; end if;
    if old.deleted_at is not null then raise exception 'Deleted messages cannot be edited'; end if;
    if new.read_at is distinct from old.read_at then raise exception 'Sender cannot change read state'; end if;

    if new.deleted_at is not null then
      new.body := '';
      new.edited_at := coalesce(new.edited_at, now());
    else
      if nullif(trim(new.body), '') is null then raise exception 'Message cannot be empty'; end if;
      if char_length(new.body) > 4000 then raise exception 'Message is too long'; end if;
      new.edited_at := now();
    end if;
  elsif new.read_at is distinct from old.read_at then
    if old.sender_id = v_user then raise exception 'Sender cannot mark their own message read'; end if;
    if new.read_at is null then raise exception 'Read state cannot be cleared'; end if;
  end if;

  return new;
end;
$$;
revoke all on function public.guard_direct_message_update() from public, anon, authenticated;