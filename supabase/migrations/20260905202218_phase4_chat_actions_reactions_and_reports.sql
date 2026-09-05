alter table public.direct_conversation_states
  alter column hidden_at drop not null,
  alter column hidden_at drop default,
  add column if not exists pinned_at timestamptz,
  add column if not exists manually_unread boolean not null default false,
  add column if not exists cleared_at timestamptz;

alter table public.direct_messages
  add column if not exists replied_to_message_id bigint references public.direct_messages(id) on delete set null;

create index if not exists direct_messages_replied_to_idx on public.direct_messages(replied_to_message_id) where replied_to_message_id is not null;

create or replace function public.validate_direct_message_reply()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.replied_to_message_id is not null and not exists (
    select 1 from public.direct_messages parent
    where parent.id = new.replied_to_message_id
      and parent.conversation_id = new.conversation_id
  ) then
    raise exception 'Reply target must be a message in the same conversation';
  end if;
  return new;
end;
$$;

drop trigger if exists direct_message_reply_guard on public.direct_messages;
create trigger direct_message_reply_guard
before insert or update of replied_to_message_id on public.direct_messages
for each row execute function public.validate_direct_message_reply();

create or replace function public.guard_direct_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at
     or new.replied_to_message_id is distinct from old.replied_to_message_id then
    raise exception 'Message identity cannot be changed';
  end if;

  if new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at then
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

create table if not exists public.direct_message_reactions (
  message_id bigint not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint direct_message_reactions_emoji_check check (char_length(btrim(emoji)) between 1 and 16)
);
alter table public.direct_message_reactions enable row level security;

create policy "Conversation participants can view message reactions"
on public.direct_message_reactions for select to authenticated
using (
  exists (
    select 1
    from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = direct_message_reactions.message_id
      and ((select auth.uid()) = c.user_low or (select auth.uid()) = c.user_high)
  )
);

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
  )
);

create policy "Users can change their own message reaction"
on public.direct_message_reactions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can remove their own message reaction"
on public.direct_message_reactions for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.direct_message_reactions from anon, authenticated;
grant select, insert, update, delete on public.direct_message_reactions to authenticated;
create index if not exists direct_message_reactions_user_idx on public.direct_message_reactions(user_id);

create table if not exists public.direct_message_hidden_messages (
  message_id bigint not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.direct_message_hidden_messages enable row level security;

create policy "Users can view their own hidden messages"
on public.direct_message_hidden_messages for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can hide messages in their conversations"
on public.direct_message_hidden_messages for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = direct_message_hidden_messages.message_id
      and ((select auth.uid()) = c.user_low or (select auth.uid()) = c.user_high)
  )
);

create policy "Users can unhide their own hidden messages"
on public.direct_message_hidden_messages for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.direct_message_hidden_messages from anon, authenticated;
grant select, insert, delete on public.direct_message_hidden_messages to authenticated;
create index if not exists direct_message_hidden_messages_user_idx on public.direct_message_hidden_messages(user_id);

create table if not exists public.direct_message_reports (
  id bigint generated by default as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id bigint not null references public.direct_messages(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint direct_message_reports_reason_check check (reason = any(array['spam','harassment','hate','threat','scam','sexual','other']::text[])),
  constraint direct_message_reports_status_check check (status = any(array['open','reviewing','resolved','dismissed']::text[])),
  constraint direct_message_reports_details_length check (char_length(details) <= 1200),
  unique (reporter_id, message_id)
);
alter table public.direct_message_reports enable row level security;

create policy "Users can view their own message reports"
on public.direct_message_reports for select to authenticated
using ((select auth.uid()) = reporter_id);

create policy "Users can report messages received in their conversations"
on public.direct_message_reports for insert to authenticated
with check (
  (select auth.uid()) = reporter_id
  and status = 'open'
  and exists (
    select 1 from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = direct_message_reports.message_id
      and m.sender_id <> (select auth.uid())
      and ((select auth.uid()) = c.user_low or (select auth.uid()) = c.user_high)
  )
);

revoke all on public.direct_message_reports from anon, authenticated;
grant select, insert on public.direct_message_reports to authenticated;
create index if not exists direct_message_reports_message_idx on public.direct_message_reports(message_id);
create index if not exists direct_message_reports_status_created_idx on public.direct_message_reports(status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_message_reactions'
  ) then
    alter publication supabase_realtime add table public.direct_message_reactions;
  end if;
end $$;
