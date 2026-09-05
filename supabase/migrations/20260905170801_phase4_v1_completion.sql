-- Final Phase 4 / v1 feature completion

alter table public.profiles
  add column if not exists username_changed_at timestamptz;

create or replace function public.enforce_username_change_cooldown()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '30 days' then
      raise exception 'Username can only be changed once every 30 days. Try again after %',
        old.username_changed_at + interval '30 days';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_cooldown on public.profiles;
create trigger profiles_username_cooldown
before update of username on public.profiles
for each row execute function public.enforce_username_change_cooldown();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images','profile-images',true,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media','community-media',true,8388608,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Users upload own profile images" on storage.objects;
create policy "Users upload own profile images" on storage.objects for insert to authenticated
with check (bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users update own profile images" on storage.objects;
create policy "Users update own profile images" on storage.objects for update to authenticated
using (bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users delete own profile images" on storage.objects;
create policy "Users delete own profile images" on storage.objects for delete to authenticated
using (bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "Users upload own community media" on storage.objects;
create policy "Users upload own community media" on storage.objects for insert to authenticated
with check (bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users update own community media" on storage.objects;
create policy "Users update own community media" on storage.objects for update to authenticated
using (bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users delete own community media" on storage.objects;
create policy "Users delete own community media" on storage.objects for delete to authenticated
using (bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

alter table public.communities
  add column if not exists category text not null default 'Other',
  add column if not exists icon_url text,
  add column if not exists banner_url text;

alter table public.communities drop constraint if exists communities_category_check;
alter table public.communities add constraint communities_category_check check (
  category=any(array['Gaming','Internet Culture & Memes','Q&A & Stories','Technology','Entertainment','Movies & TV','Music','Sports','News & Current Events','Science & Education','Art & Design','Food & Cooking','Health & Fitness','Lifestyle','Hobbies & Crafts','Travel & Places','Business & Finance','Relationships','Pets & Animals','Other']::text[])
);

drop policy if exists "Authenticated users can create communities" on public.communities;
create policy "Authenticated users can create communities" on public.communities for insert to authenticated
with check ((select auth.uid())=created_by);
drop policy if exists "Owners can update communities" on public.communities;
create policy "Owners can update communities" on public.communities for update to authenticated
using ((select auth.uid())=created_by) with check ((select auth.uid())=created_by);

create or replace function public.create_community_bundle(p_name text,p_description text,p_category text,p_icon_url text default null,p_banner_url text default null,p_rules jsonb default '[]'::jsonb,p_flairs jsonb default '[]'::jsonb)
returns bigint language plpgsql security invoker set search_path=public as $$
declare v_user uuid:=(select auth.uid()); v_community_id bigint; v_item jsonb; v_position int:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Community name is required'; end if;
  insert into public.communities(name,description,created_by,category,icon_url,banner_url)
  values(trim(p_name),coalesce(trim(p_description),''),v_user,p_category,nullif(trim(p_icon_url),''),nullif(trim(p_banner_url),'')) returning id into v_community_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) loop
    if nullif(trim(v_item->>'title'),'') is not null then
      insert into public.community_rules(community_id,title,description,position) values(v_community_id,trim(v_item->>'title'),coalesce(trim(v_item->>'description'),''),v_position); v_position:=v_position+1;
    end if;
  end loop;
  v_position:=0;
  for v_item in select value from jsonb_array_elements(coalesce(p_flairs,'[]'::jsonb)) loop
    if nullif(trim(v_item->>'name'),'') is not null then
      insert into public.post_flairs(community_id,name,color,position,is_active) values(v_community_id,trim(v_item->>'name'),coalesce(nullif(trim(v_item->>'color'),''),'#7c3aed'),v_position,true); v_position:=v_position+1;
    end if;
  end loop;
  return v_community_id;
end; $$;
revoke all on function public.create_community_bundle(text,text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.create_community_bundle(text,text,text,text,text,jsonb,jsonb) to authenticated;

create table if not exists public.user_blocks(
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  constraint user_blocks_not_self check(blocker_id<>blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "Users can view blocks involving them" on public.user_blocks;
create policy "Users can view blocks involving them" on public.user_blocks for select to authenticated using((select auth.uid())=blocker_id or (select auth.uid())=blocked_id);
drop policy if exists "Users can block people" on public.user_blocks;
create policy "Users can block people" on public.user_blocks for insert to authenticated with check((select auth.uid())=blocker_id and blocker_id<>blocked_id);
drop policy if exists "Users can unblock people" on public.user_blocks;
create policy "Users can unblock people" on public.user_blocks for delete to authenticated using((select auth.uid())=blocker_id);
revoke all on public.user_blocks from anon,authenticated;
grant select,insert,delete on public.user_blocks to authenticated;

create table if not exists public.direct_conversation_states(
  conversation_id bigint not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
alter table public.direct_conversation_states enable row level security;
drop policy if exists "Users manage own conversation state" on public.direct_conversation_states;
create policy "Users manage own conversation state" on public.direct_conversation_states for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
revoke all on public.direct_conversation_states from anon,authenticated;
grant select,insert,update,delete on public.direct_conversation_states to authenticated;

create or replace function public.cleanup_social_on_block() returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from public.user_follows where (follower_id=new.blocker_id and following_id=new.blocked_id) or (follower_id=new.blocked_id and following_id=new.blocker_id);
  insert into public.direct_conversation_states(conversation_id,user_id,hidden_at)
  select c.id,new.blocker_id,now() from public.direct_conversations c
  where (c.user_low=new.blocker_id and c.user_high=new.blocked_id) or (c.user_low=new.blocked_id and c.user_high=new.blocker_id)
  on conflict(conversation_id,user_id) do update set hidden_at=excluded.hidden_at;
  return new;
end; $$;
revoke all on function public.cleanup_social_on_block() from public,anon,authenticated;
drop trigger if exists user_block_cleanup on public.user_blocks;
create trigger user_block_cleanup after insert on public.user_blocks for each row execute function public.cleanup_social_on_block();

drop policy if exists "Users can follow people" on public.user_follows;
create policy "Users can follow people" on public.user_follows for insert to authenticated with check((select auth.uid())=follower_id and follower_id<>following_id and not exists(select 1 from public.user_blocks b where (b.blocker_id=follower_id and b.blocked_id=following_id) or (b.blocker_id=following_id and b.blocked_id=follower_id)));

drop policy if exists "Participants can create conversations" on public.direct_conversations;
create policy "Participants can create conversations" on public.direct_conversations for insert to authenticated with check((((select auth.uid())=user_low) or ((select auth.uid())=user_high)) and user_low<>user_high and user_low::text<user_high::text and not exists(select 1 from public.user_blocks b where (b.blocker_id=user_low and b.blocked_id=user_high) or (b.blocker_id=user_high and b.blocked_id=user_low)));

create or replace function public.get_or_create_direct_conversation(p_other_user uuid) returns bigint language plpgsql security invoker set search_path=public as $$
declare current_user_id uuid:=(select auth.uid()); low_user uuid; high_user uuid; conversation_id bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_other_user is null or p_other_user=current_user_id then raise exception 'Choose another Yapster member'; end if;
  if not exists(select 1 from public.profiles where id=p_other_user) then raise exception 'Profile not found'; end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=current_user_id and b.blocked_id=p_other_user) or (b.blocker_id=p_other_user and b.blocked_id=current_user_id)) then raise exception 'Messaging is unavailable between these users'; end if;
  if current_user_id::text<p_other_user::text then low_user:=current_user_id; high_user:=p_other_user; else low_user:=p_other_user; high_user:=current_user_id; end if;
  insert into public.direct_conversations(user_low,user_high) values(low_user,high_user) on conflict(user_low,user_high) do nothing;
  select id into conversation_id from public.direct_conversations where user_low=low_user and user_high=high_user;
  return conversation_id;
end; $$;

alter table public.direct_messages add column if not exists edited_at timestamptz, add column if not exists deleted_at timestamptz;

create or replace function public.guard_direct_message_update() returns trigger language plpgsql set search_path=public as $$
declare v_user uuid:=(select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if new.conversation_id is distinct from old.conversation_id or new.sender_id is distinct from old.sender_id or new.created_at is distinct from old.created_at then raise exception 'Message identity cannot be changed'; end if;
  if new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at then
    if old.sender_id<>v_user then raise exception 'You can only edit or delete your own messages'; end if;
    if old.deleted_at is not null then raise exception 'Deleted messages cannot be edited'; end if;
    if new.read_at is distinct from old.read_at then raise exception 'Sender cannot change read state'; end if;
    if new.deleted_at is not null then new.body:=''; new.edited_at:=coalesce(new.edited_at,now());
    else if nullif(trim(new.body),'') is null then raise exception 'Message cannot be empty'; end if; if char_length(new.body)>4000 then raise exception 'Message is too long'; end if; new.edited_at:=now(); end if;
  elsif new.read_at is distinct from old.read_at then
    if old.sender_id=v_user then raise exception 'Sender cannot mark their own message read'; end if;
    if new.read_at is null then raise exception 'Read state cannot be cleared'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists direct_message_update_guard on public.direct_messages;
create trigger direct_message_update_guard before update on public.direct_messages for each row execute function public.guard_direct_message_update();

drop policy if exists "Recipients can mark messages read" on public.direct_messages;
drop policy if exists "Participants can update messages" on public.direct_messages;
create policy "Participants can update messages" on public.direct_messages for update to authenticated using(exists(select 1 from public.direct_conversations c where c.id=direct_messages.conversation_id and ((select auth.uid())=c.user_low or (select auth.uid())=c.user_high))) with check(exists(select 1 from public.direct_conversations c where c.id=direct_messages.conversation_id and ((select auth.uid())=c.user_low or (select auth.uid())=c.user_high)));

drop policy if exists "Participants can send messages" on public.direct_messages;
create policy "Participants can send messages" on public.direct_messages for insert to authenticated with check(sender_id=(select auth.uid()) and exists(select 1 from public.direct_conversations c where c.id=direct_messages.conversation_id and ((select auth.uid())=c.user_low or (select auth.uid())=c.user_high) and not exists(select 1 from public.user_blocks b where (b.blocker_id=c.user_low and b.blocked_id=c.user_high) or (b.blocker_id=c.user_high and b.blocked_id=c.user_low))));
revoke update on public.direct_messages from authenticated;
grant update(body,read_at,edited_at,deleted_at) on public.direct_messages to authenticated;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type=any(array['post_comment','comment_reply','mention','community_moderation','moderator_promotion','user_follow','community_join','community_leave','community_removed']::text[]));

create or replace function public.create_comment_notification() returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient uuid; v_community_id bigint; v_actor_name text; v_preview text; v_type text;
begin
  select p.community_id into v_community_id from public.posts p where p.id=new.post_id;
  select coalesce(nullif(display_name,''),nullif(username,''),'Someone') into v_actor_name from public.profiles where id=new.user_id;
  v_preview:=left(regexp_replace(coalesce(new.content,''),'\s+',' ','g'),140);
  if new.parent_comment_id is not null then select c.user_id into v_recipient from public.comments c where c.id=new.parent_comment_id; v_type:='comment_reply';
  else select p.user_id into v_recipient from public.posts p where p.id=new.post_id; v_type:='post_comment'; end if;
  if v_recipient is null or v_recipient=new.user_id then return new; end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=v_recipient and b.blocked_id=new.user_id) or (b.blocker_id=new.user_id and b.blocked_id=v_recipient)) then return new; end if;
  insert into public.notifications(recipient_id,actor_id,type,post_id,comment_id,community_id,message)
  values(v_recipient,new.user_id,v_type,new.post_id,new.id,v_community_id,case when v_type='comment_reply' then v_actor_name||' replied to your comment: “'||v_preview||'”' else v_actor_name||' commented on your post: “'||v_preview||'”' end);
  return new;
end; $$;
revoke all on function public.create_comment_notification() from public,anon,authenticated;

create or replace function public.create_mention_notifications() returns trigger language plpgsql security definer set search_path=public as $$
declare source_text text; actor_user_id uuid; target_post_id bigint; target_comment_id bigint; target_community_id bigint; mentioned_username text; mentioned_profile record; actor_name text; preview_text text;
begin
  if tg_table_name='posts' then source_text:=coalesce(new.title,'')||' '||coalesce(new.content,''); actor_user_id:=new.user_id; target_post_id:=new.id; target_comment_id:=null; target_community_id:=new.community_id;
  elsif tg_table_name='comments' then source_text:=coalesce(new.content,''); actor_user_id:=new.user_id; target_post_id:=new.post_id; target_comment_id:=new.id; select community_id into target_community_id from public.posts where id=new.post_id;
  else return new; end if;
  if actor_user_id is null or position('@' in source_text)=0 then return new; end if;
  preview_text:=left(regexp_replace(source_text,'\s+',' ','g'),140);
  select coalesce(nullif(display_name,''),nullif(username,''),'Someone') into actor_name from public.profiles where id=actor_user_id;
  for mentioned_username in select distinct lower((matches)[2]) from regexp_matches(source_text,'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,30})','g') as matches loop
    for mentioned_profile in select id,username from public.profiles where lower(username)=mentioned_username and id<>actor_user_id loop
      if exists(select 1 from public.user_blocks b where (b.blocker_id=mentioned_profile.id and b.blocked_id=actor_user_id) or (b.blocker_id=actor_user_id and b.blocked_id=mentioned_profile.id)) then continue; end if;
      if not exists(select 1 from public.notifications n where n.recipient_id=mentioned_profile.id and n.actor_id=actor_user_id and n.type='mention' and n.post_id is not distinct from target_post_id and n.comment_id is not distinct from target_comment_id) then
        insert into public.notifications(recipient_id,actor_id,type,post_id,comment_id,community_id,message) values(mentioned_profile.id,actor_user_id,'mention',target_post_id,target_comment_id,target_community_id,actor_name||' mentioned you: “'||preview_text||'”');
      end if;
    end loop;
  end loop;
  return new;
end; $$;
revoke all on function public.create_mention_notifications() from public,anon,authenticated;

create or replace function public.create_follow_notification() returns trigger language plpgsql security definer set search_path=public as $$
declare actor_name text;
begin
  if exists(select 1 from public.user_blocks b where (b.blocker_id=new.following_id and b.blocked_id=new.follower_id) or (b.blocker_id=new.follower_id and b.blocked_id=new.following_id)) then return new; end if;
  select coalesce(nullif(display_name,''),nullif(username,''),'Someone') into actor_name from public.profiles where id=new.follower_id;
  insert into public.notifications(recipient_id,actor_id,type,message) values(new.following_id,new.follower_id,'user_follow',actor_name||' followed you.'); return new;
end; $$;
revoke all on function public.create_follow_notification() from public,anon,authenticated;

create or replace function public.notify_community_membership_activity() returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_community bigint; v_action text; v_actor_name text; v_community_name text; v_admin uuid;
begin
  if tg_op='INSERT' then v_user:=new.user_id; v_community:=new.community_id; v_action:='community_join';
  else v_user:=old.user_id; v_community:=old.community_id; if (select auth.uid()) is distinct from old.user_id then return old; end if; v_action:='community_leave'; end if;
  select coalesce(nullif(display_name,''),nullif(username,''),'Someone') into v_actor_name from public.profiles where id=v_user;
  select name into v_community_name from public.communities where id=v_community;
  for v_admin in select created_by from public.communities where id=v_community and created_by is not null union select user_id from public.community_members where community_id=v_community and role='moderator' and banned=false loop
    if v_admin is null or v_admin=v_user then continue; end if;
    insert into public.notifications(recipient_id,actor_id,type,community_id,message) values(v_admin,v_user,v_action,v_community,v_actor_name||case when v_action='community_join' then ' joined ' else ' left ' end||v_community_name||'.');
  end loop;
  if tg_op='INSERT' then return new; else return old; end if;
end; $$;
revoke all on function public.notify_community_membership_activity() from public,anon,authenticated;
drop trigger if exists community_members_join_notification on public.community_members;
create trigger community_members_join_notification after insert on public.community_members for each row execute function public.notify_community_membership_activity();
drop trigger if exists community_members_leave_notification on public.community_members;
create trigger community_members_leave_notification after delete on public.community_members for each row execute function public.notify_community_membership_activity();

create or replace function public.remove_community_member(p_community_id bigint,p_user_id uuid,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=(select auth.uid()); v_target_role text; v_community_name text; v_reason text:=left(coalesce(nullif(trim(p_reason),''),'No reason provided'),300); v_actor_is_owner boolean; v_actor_is_mod boolean;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select created_by=v_actor,name into v_actor_is_owner,v_community_name from public.communities where id=p_community_id;
  select exists(select 1 from public.community_members where community_id=p_community_id and user_id=v_actor and role='moderator' and banned=false) into v_actor_is_mod;
  if not coalesce(v_actor_is_owner,false) and not coalesce(v_actor_is_mod,false) then raise exception 'Moderator access required'; end if;
  if p_user_id=v_actor then raise exception 'You cannot remove yourself with this action'; end if;
  if exists(select 1 from public.communities where id=p_community_id and created_by=p_user_id) then raise exception 'The community owner cannot be removed'; end if;
  select role into v_target_role from public.community_members where community_id=p_community_id and user_id=p_user_id;
  if v_target_role is null then raise exception 'Member not found'; end if;
  if not v_actor_is_owner and v_target_role='moderator' then raise exception 'Moderators cannot remove other moderators'; end if;
  delete from public.community_members where community_id=p_community_id and user_id=p_user_id;
  insert into public.notifications(recipient_id,actor_id,type,community_id,message) values(p_user_id,v_actor,'community_removed',p_community_id,'You were removed from '||v_community_name||'. Reason: '||v_reason);
  insert into public.moderation_log(community_id,actor_id,action_type,target_type,target_user_id,note) values(p_community_id,v_actor,'member_removed','member',p_user_id,'Removed member. Reason: '||v_reason);
end; $$;
revoke all on function public.remove_community_member(bigint,uuid,text) from public,anon;
grant execute on function public.remove_community_member(bigint,uuid,text) to authenticated;
