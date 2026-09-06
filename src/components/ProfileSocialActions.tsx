import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { fetchFollowStats, fetchIsFollowing, followUser, getOrCreateConversation, unfollowUser } from "../lib/social";
import { supabase } from "../supabase-client";

interface Props {
  profileId: string;
  profileUsername: string;
  isOwnProfile: boolean;
}

interface BlockState {
  blockedByMe: boolean;
  blockedMe: boolean;
}

const BlockIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <circle cx="10" cy="10" r="6.5" />
    <path d="m5.5 5.5 9 9" strokeLinecap="round" />
  </svg>
);

const fetchBlockState = async (currentUserId: string, profileId: string): Promise<BlockState> => {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${profileId}),and(blocker_id.eq.${profileId},blocked_id.eq.${currentUserId})`);
  if (error) throw new Error(error.message);

  return {
    blockedByMe: (data ?? []).some((row) => row.blocker_id === currentUserId && row.blocked_id === profileId),
    blockedMe: (data ?? []).some((row) => row.blocker_id === profileId && row.blocked_id === currentUserId),
  };
};

export const ProfileSocialActions = ({ profileId, profileUsername, isOwnProfile }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ["profile-follow-stats", profileId],
    queryFn: () => fetchFollowStats(profileId),
    staleTime: 20_000,
  });

  const followingQuery = useQuery({
    queryKey: ["profile-is-following", user?.id, profileId],
    queryFn: () => user ? fetchIsFollowing(user.id, profileId) : false,
    enabled: !!user && !isOwnProfile,
    retry: false,
    staleTime: 15_000,
  });

  const blockQuery = useQuery<BlockState>({
    queryKey: ["profile-block-state", user?.id, profileId],
    queryFn: () => user ? fetchBlockState(user.id, profileId) : { blockedByMe: false, blockedMe: false },
    enabled: !!user && !isOwnProfile,
    retry: false,
    staleTime: 10_000,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to follow people.");
      if (blockQuery.data?.blockedByMe || blockQuery.data?.blockedMe) throw new Error("Following is unavailable between these users.");
      if (followingQuery.data) await unfollowUser(user.id, profileId);
      else await followUser(user.id, profileId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile-is-following", user?.id, profileId] }),
        queryClient.invalidateQueries({ queryKey: ["profile-follow-stats", profileId] }),
        queryClient.invalidateQueries({ queryKey: ["followed-user-ids", user?.id] }),
      ]);
    },
  });

  const messageMutation = useMutation({
    mutationFn: () => getOrCreateConversation(profileId),
    onSuccess: (conversationId) => navigate(`/messages/${conversationId}`),
  });

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to manage blocked users.");
      if (blockQuery.data?.blockedByMe) {
        const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", profileId);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: profileId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile-block-state", user?.id, profileId] }),
        queryClient.invalidateQueries({ queryKey: ["message-block-state", user?.id, profileId] }),
        queryClient.invalidateQueries({ queryKey: ["profile-is-following", user?.id, profileId] }),
        queryClient.invalidateQueries({ queryKey: ["profile-follow-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["followed-user-ids", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["message-inbox", user?.id] }),
      ]);
    },
  });

  const followers = statsQuery.data?.followers ?? 0;
  const following = statsQuery.data?.following ?? 0;
  const isFollowing = Boolean(followingQuery.data);
  const blockedByMe = Boolean(blockQuery.data?.blockedByMe);
  const interactionBlocked = blockedByMe || Boolean(blockQuery.data?.blockedMe);
  const actionError = followMutation.error || messageMutation.error || blockMutation.error || blockQuery.error;

  return (
    <div className="yapster-profile-social-actions flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-slate-500"><strong className="mr-1 text-sm font-black text-slate-900">{followers.toLocaleString()}</strong>{followers === 1 ? "follower" : "followers"}</span>
        <span className="text-slate-500"><strong className="mr-1 text-sm font-black text-slate-900">{following.toLocaleString()}</strong>following</span>
      </div>

      {!isOwnProfile && (
        <div className="yapster-profile-social-actions__buttons flex flex-wrap gap-2">
          <button
            type="button"
            disabled={followMutation.isPending || interactionBlocked}
            onClick={() => {
              if (!user) return navigate("/login");
              followMutation.mutate();
            }}
            className={isFollowing ? "yapster-button yapster-button--ghost" : "yapster-button yapster-button--primary"}
          >
            {followMutation.isPending ? "Updating..." : isFollowing ? "Unfollow" : "Follow"}
          </button>

          <button
            type="button"
            disabled={messageMutation.isPending || interactionBlocked}
            onClick={() => {
              if (!user) return navigate("/login");
              messageMutation.mutate();
            }}
            className="yapster-button yapster-button--ghost disabled:cursor-not-allowed disabled:opacity-45"
          >
            {messageMutation.isPending ? "Opening..." : "Message"}
          </button>

          <button
            type="button"
            disabled={blockMutation.isPending}
            onClick={() => {
              if (!user) return navigate("/login");
              blockMutation.mutate();
            }}
            className={blockedByMe
              ? "yapster-button inline-flex items-center gap-2 border-violet-200 bg-violet-50/70 text-violet-700 hover:border-violet-300 hover:bg-violet-100"
              : "yapster-button yapster-profile-block-button inline-flex items-center gap-2 border-red-200 bg-red-50/70 text-red-600 hover:border-red-300 hover:bg-red-100 hover:text-red-700"}
          >
            <BlockIcon />
            {blockMutation.isPending ? "Updating..." : blockedByMe ? "Unblock" : "Block"}
          </button>
        </div>
      )}

      {interactionBlocked && !blockedByMe && (
        <p className="w-full text-xs font-semibold text-slate-400">Follow and messaging are unavailable for this profile.</p>
      )}
      {blockedByMe && (
        <p className="w-full text-xs font-semibold text-slate-500">You blocked @{profileUsername}. Unblock them to follow or message again.</p>
      )}
      {actionError && <p className="w-full text-xs font-semibold text-red-600">{actionError.message || "Social action failed."}</p>}
    </div>
  );
};
