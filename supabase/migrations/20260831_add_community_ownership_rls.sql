alter table public.communities
  add column if not exists created_by uuid references auth.users(id);

alter table public.community_members enable row level security;

drop policy if exists "h4up_membership_select" on public.community_members;
create policy "h4up_membership_select"
on public.community_members
for select
to public
using (true);

drop policy if exists "h4up_membership_insert_own" on public.community_members;
create policy "h4up_membership_insert_own"
on public.community_members
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "h4up_membership_delete_own" on public.community_members;
create policy "h4up_membership_delete_own"
on public.community_members
for delete
to authenticated
using (auth.uid() = user_id);
