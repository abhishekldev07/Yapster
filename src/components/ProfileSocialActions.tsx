import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { fetchFollowStats, fetchIsFollowing, followUser, getOrCreateConversation, unfollowUser } from "../lib/social";

interface Props {
  profileId: string;
  profileUsername: string;
  isOwnProfile: boolean;
}

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

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to follow people.");
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

  const followers = statsQuery.data?.followers ?? 0;
  const following = statsQuery.data?.following ?? 0;
  const isFollowing = Boolean(followingQuery.data);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-slate-500"><strong className="mr-1 text-sm font-black text-slate-900">{followers.toLocaleString()}</strong>{followers === 1 ? "follower" : "followers"}</span>
        <span className="text-slate-500"><strong className="mr-1 text-sm font-black text-slate-900">{following.toLocaleString()}</strong>following</span>
      </div>

      {!isOwnProfile && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={followMutation.isPending}
            onClick={() => {
              if (!user) {
                navigate("/login");
                return;
              }
              followMutation.mutate();
            }}
            className={isFollowing ? "yapster-button yapster-button--ghost" : "yapster-button yapster-button--primary"}
          >
            {followMutation.isPending ? "Updating..." : isFollowing ? "Following" : `Follow @${profileUsername}`}
          </button>
          <button
            type="button"
            disabled={messageMutation.isPending}
            onClick={() => {
              if (!user) {
                navigate("/login");
                return;
              }
              messageMutation.mutate();
            }}
            className="yapster-button yapster-button--ghost"
          >
            {messageMutation.isPending ? "Opening..." : "Message"}
          </button>
        </div>
      )}

      {(followMutation.error || messageMutation.error) && (
        <p className="w-full text-xs font-semibold text-red-600">{(followMutation.error || messageMutation.error)?.message || "Social action failed."}</p>
      )}
    </div>
  );
};
