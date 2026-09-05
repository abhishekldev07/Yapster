import { supabase } from "../supabase-client";

export interface FollowStats {
  followers: number;
  following: number;
}

export const fetchFollowStats = async (profileId: string): Promise<FollowStats> => {
  const [{ count: followers, error: followersError }, { count: following, error: followingError }] = await Promise.all([
    supabase.from("user_follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profileId),
    supabase.from("user_follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profileId),
  ]);
  if (followersError) throw new Error(followersError.message);
  if (followingError) throw new Error(followingError.message);
  return { followers: followers ?? 0, following: following ?? 0 };
};

export const fetchIsFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  const { data, error } = await supabase.from("user_follows").select("follower_id").eq("follower_id", followerId).eq("following_id", followingId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
};

export const followUser = async (followerId: string, followingId: string) => {
  const { error } = await supabase.from("user_follows").insert({ follower_id: followerId, following_id: followingId });
  if (error) throw new Error(error.message);
};

export const unfollowUser = async (followerId: string, followingId: string) => {
  const { error } = await supabase.from("user_follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
  if (error) throw new Error(error.message);
};

export const getOrCreateConversation = async (otherUserId: string): Promise<number> => {
  const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { p_other_user: otherUserId });
  if (error) throw new Error(error.message);
  const id = Number(data);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Could not open this conversation.");
  return id;
};

export const fetchUnreadMessageCount = async (userId: string): Promise<number> => {
  const [{ data: unread, error }, { data: hidden, error: hiddenError }] = await Promise.all([
    supabase
      .from("direct_messages")
      .select("id, conversation_id, created_at")
      .neq("sender_id", userId)
      .is("read_at", null),
    supabase
      .from("direct_conversation_states")
      .select("conversation_id, hidden_at")
      .eq("user_id", userId),
  ]);
  if (error) throw new Error(error.message);
  if (hiddenError) throw new Error(hiddenError.message);

  const hiddenAt = new Map<number, number>((hidden ?? []).map((row) => [Number(row.conversation_id), new Date(row.hidden_at).getTime()]));
  return (unread ?? []).filter((message) => {
    const cutoff = hiddenAt.get(Number(message.conversation_id));
    return cutoff == null || new Date(message.created_at).getTime() > cutoff;
  }).length;
};
