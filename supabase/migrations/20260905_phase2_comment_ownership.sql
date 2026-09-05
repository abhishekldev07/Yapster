-- Phase 2: allow signed-in users to manage only their own comments.
-- This migration mirrors the policies already applied to the Yapster project.

drop policy if exists "Users can update their own comments" on public.comments;
create policy "Users can update their own comments"
on public.comments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
on public.comments
for delete
to authenticated
using ((select auth.uid()) = user_id);
