-- Add moderation columns to community_members table
alter table public.community_members
  add column if not exists role text not null default 'member',
  add column if not exists muted boolean not null default false,
  add column if not exists banned boolean not null default false;

-- Add constraint to ensure valid roles
alter table public.community_members
  add constraint valid_role check (role in ('member', 'moderator'));

-- Create index for faster moderation queries
create index if not exists idx_community_members_role on public.community_members(community_id, role);
create index if not exists idx_community_members_muted on public.community_members(community_id, muted);
create index if not exists idx_community_members_banned on public.community_members(community_id, banned);

-- Update RLS policies for moderation actions
-- Drop existing policies
drop policy if exists "h4up_membership_update_moderator" on public.community_members;
drop policy if exists "h4up_membership_update_mute" on public.community_members;

-- Policy 1: Allow authenticated users to update their own muted/banned status (for admin/mod actions via trigger)
-- Policy 2: Allow community admins to update member roles
create policy "h4up_membership_update_admin_role"
on public.community_members
for update
to authenticated
using (
  -- User can only update members in communities they admin
  -- Admin is determined by communities.created_by = auth.uid()
  exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = auth.uid()
  )
  -- Cannot modify the community admin themselves (owner always stays admin)
  and not exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = community_members.user_id
  )
)
with check (
  exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = auth.uid()
  )
  and not exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = community_members.user_id
  )
);

-- Policy 3: Allow admins to mute/unmute members
create policy "h4up_membership_update_admin_mute"
on public.community_members
for update
to authenticated
using (
  exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = auth.uid()
  )
  and not exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = community_members.user_id
  )
)
with check (
  exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = auth.uid()
  )
  and not exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = community_members.user_id
  )
);

-- Policy 4: Allow admins to ban/unban members
create policy "h4up_membership_update_admin_ban"
on public.community_members
for update
to authenticated
using (
  exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = auth.uid()
  )
  and not exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = community_members.user_id
  )
)
with check (
  exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = auth.uid()
  )
  and not exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
    and communities.created_by = community_members.user_id
  )
);
