import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

export type CommunityRole = "owner" | "moderator" | "member";

export interface Community {
  id: number;
  name: string;
  description: string;
  category?: string | null;
  created_at: string;
  created_by?: string | null;
  member_count?: number | null;
}

export const fetchCommunities = async (): Promise<Community[]> => {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as Community[];
};

const fetchUserMemberships = async (userId: string): Promise<Record<number, true>> => {
  const { data, error } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const result: Record<number, true> = {};
  (data ?? []).forEach((row) => {
    result[Number(row.community_id)] = true;
  });

  return result;
};

const isOwnerOfCommunity = (community: Community | null | undefined, userId: string | null | undefined) => {
  if (!community || !userId) return false;
  return community.created_by === userId;
};

const fetchCommunityMemberCounts = async (): Promise<Record<number, number>> => {
  const [{ data, error }, { data: communities, error: communitiesError }] = await Promise.all([
    supabase.from("community_members").select("community_id"),
    supabase.from("communities").select("id, created_by"),
  ]);

  if (error) throw new Error(error.message);
  if (communitiesError) throw new Error(communitiesError.message);

  const counts: Record<number, number> = {};
  (data ?? []).forEach((row) => {
    const communityId = Number(row.community_id);
    counts[communityId] = (counts[communityId] ?? 0) + 1;
  });
  (communities ?? []).forEach((community) => {
    if (community.created_by) counts[community.id] = (counts[community.id] ?? 0) + 1;
  });

  return counts;
};

export const CommunityList = () => {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, signInWithGitHub } = useAuth();
  const [query, setQuery] = useState("");
  const [pendingCommunityId, setPendingCommunityId] = useState<number | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery<Community[], Error>({
    queryKey: ["communities"],
    queryFn: fetchCommunities,
  });

  const memberCountsQuery = useQuery<Record<number, number>, Error>({
    queryKey: ["community-member-counts"],
    queryFn: fetchCommunityMemberCounts,
  });

  const membershipQuery = useQuery<Record<number, true>, Error>({
    queryKey: ["community-memberships", user?.id],
    queryFn: () => (user ? fetchUserMemberships(user.id) : {}),
    enabled: !authLoading && !!user,
    retry: false,
    throwOnError: false,
  });

  const joinOrLeaveMembership = useMutation({
    mutationFn: async ({ communityId, isJoined }: { communityId: number; isJoined: boolean }) => {
      if (!user) throw new Error("You must be signed in to join a community.");

      const community = data?.find((entry) => entry.id === communityId);
      if (isOwnerOfCommunity(community, user.id)) {
        return { communityId, joined: true, owner: true };
      }

      if (isJoined) {
        const { error } = await supabase
          .from("community_members")
          .delete()
          .eq("community_id", communityId)
          .eq("user_id", user.id);

        if (error && !String(error.message).toLowerCase().includes("not found")) {
          throw new Error(error.message);
        }
        return { communityId, joined: false };
      }

      const { error } = await supabase
        .from("community_members")
        .insert({ community_id: communityId, user_id: user.id });

      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes("duplicate") || message.includes("23505") || message.includes("already exists")) {
          return { communityId, joined: true, alreadyExists: true };
        }
        throw new Error(error.message);
      }

      return { communityId, joined: true, alreadyExists: false };
    },
    onSuccess: (_, variables) => {
      setMembershipError(null);
      setPendingCommunityId(null);
      queryClient.invalidateQueries({ queryKey: ["community-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["community-member-counts"] });
      queryClient.invalidateQueries({ queryKey: ["community-member-count", variables.communityId] });
      queryClient.invalidateQueries({ queryKey: ["community-membership", variables.communityId] });
    },
    onError: (error) => {
      setMembershipError(error.message);
      setPendingCommunityId(null);
    },
  });

  const membershipSet = new Set(Object.keys(membershipQuery.data ?? {}).map(Number));

  const filteredCommunities = (data ?? []).filter((community) => {
    const searchText = query.trim().toLowerCase();
    if (!searchText) return true;

    return (
      community.name.toLowerCase().includes(searchText) ||
      community.description.toLowerCase().includes(searchText) ||
      (community.category ?? "").toLowerCase().includes(searchText)
    );
  });

  const handleMembershipToggle = (communityId: number, isJoined: boolean) => {
    if (!user) {
      signInWithGitHub();
      return;
    }

    const community = data?.find((entry) => entry.id === communityId);
    if (isOwnerOfCommunity(community, user.id)) return;
    if (joinOrLeaveMembership.isPending) return;

    setPendingCommunityId(communityId);
    setMembershipError(null);
    joinOrLeaveMembership.mutate({ communityId, isJoined });
  };

  if (isLoading)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading communities...
      </div>
    );

  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        Error loading communities: {error.message}
      </div>
    );

  return (
    <div className="space-y-5">
      {membershipError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {membershipError}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <label className="sr-only" htmlFor="community-search">
          Search communities
        </label>
        <input
          id="community-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search communities"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCommunities.map((community) => {
          const isOwner = isOwnerOfCommunity(community, user?.id ?? null);
          const isMember = !isOwner && membershipSet.has(community.id);
          const memberCount = memberCountsQuery.data?.[community.id] ?? 0;
          const isPending = pendingCommunityId === community.id && joinOrLeaveMembership.isPending;

          let buttonLabel = "Join";
          if (authLoading) buttonLabel = "Loading...";
          else if (isPending) buttonLabel = "Processing...";
          else if (isOwner) buttonLabel = "Admin";
          else if (isMember) buttonLabel = "Joined";

          return (
            <article
              key={community.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                      {community.name?.slice(0, 1).toUpperCase() || "C"}
                    </div>
                    <div>
                      <Link
                        to={`/community/${community.id}`}
                        className="text-lg font-semibold text-slate-900 hover:text-emerald-800"
                      >
                        {community.name}
                      </Link>
                      {community.category && (
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                          {community.category}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isOwner ? (
                    <button
                      type="button"
                      disabled={authLoading || isPending || joinOrLeaveMembership.isPending}
                      onClick={() => handleMembershipToggle(community.id, isMember)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        isMember
                          ? "border border-slate-200 bg-slate-100 text-slate-700"
                          : "bg-emerald-700 text-white"
                      } ${
                        authLoading || isPending ? "cursor-not-allowed opacity-70" : ""
                      }`}
                    >
                      {buttonLabel}
                    </button>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                      Admin
                    </span>
                  )}
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {community.description || "A community for thoughtful discussion and recommendations."}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{memberCount} members</span>
                  <Link
                    to={`/community/${community.id}`}
                    className="font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    View community
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!filteredCommunities.length && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">No communities found</h3>
          <p className="mt-2 text-sm text-slate-600">
            Try a different keyword or create a new community for your topic.
          </p>
        </div>
      )}
    </div>
  );
};
