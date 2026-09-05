-- Phase 3: prevent trigger-only SECURITY DEFINER functions from being exposed as RPC endpoints.

revoke all on function public.create_comment_notification() from public, anon, authenticated;
revoke all on function public.create_moderation_notification() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_membership_key_change() from public, anon, authenticated;
revoke all on function public.prevent_moderator_role_change() from public, anon, authenticated;

grant execute on function public.create_comment_notification() to service_role;
grant execute on function public.create_moderation_notification() to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.prevent_membership_key_change() to service_role;
grant execute on function public.prevent_moderator_role_change() to service_role;

-- These helpers are required by authenticated RLS policies, but anonymous clients
-- do not need direct RPC access to them.
revoke execute on function public.is_community_admin(bigint) from public, anon;
revoke execute on function public.is_community_banned(bigint) from public, anon;
revoke execute on function public.is_community_moderator(bigint) from public, anon;
revoke execute on function public.is_community_owner(bigint, uuid) from public, anon;

grant execute on function public.is_community_admin(bigint) to authenticated, service_role;
grant execute on function public.is_community_banned(bigint) to authenticated, service_role;
grant execute on function public.is_community_moderator(bigint) to authenticated, service_role;
grant execute on function public.is_community_owner(bigint, uuid) to authenticated, service_role;
