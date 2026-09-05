import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { getFriendlyErrorMessage } from "../lib/auth";

export type CommunityRole = "owner" | "moderator" | "member";
type CommunitySort = "trending" | "new" | "largest";

export interface Community {
  id: number;
  name: string;
  description: string;
  category?: string | null;
  created_at: string;
  created_by?: string | null;
  member_count?: number | null;
}

interface TrendStat {
  trend_score: number;
  recent_posts: number;
  recent_comments: number;
}

export const fetchCommunities = async (): Promise<Community[]> => {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as Community[];
};

const fetchCommunityTrendStats = async (): Promise<Record<number, TrendStat>> => {
  const { data, error } = await supabase
    .from("community_trending")
    .select("id, trend_score, recent_posts, recent_comments");

  if (error) throw new Error(error.message);
  const result: Record<number, TrendStat> = {};
  (data ?? []).forEach((row) => {
    result[Number(row.id)] = {
      trend_score: Number(row.trend_score ?? 0),
      recent_posts: Number(row.recent_posts ?? 0),
      recent_comments: Number(row.recent_comments ?? 0),
    };
  });
  return result;
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

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true">
    <circle cx="10.8" cy="10.8" r="6.5" />
    <path d="m16 16 4 4" strokeLinecap="round" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true">
    <path d="M5 12h14M14 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CommunityList = () => {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, signInWithGitHub } = useAuth();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CommunitySort>("trending");
  const [pendingCommunityId, setPendingCommunityId] = useState<number | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery<Community[], Error>({
    queryKey: ["communities"],
    queryFn: fetchCommunities,
  });

  const trendQuery = useQuery<Record<number, TrendStat>, Error>({
    queryKey: ["community-trend-stats"],
    queryFn: fetchCommunityTrendStats,
    staleTime: 60_000,
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
      queryClient.invalidateQueries({ queryKey: ["community-trend-stats"] });
      queryClient.invalidateQueries({ queryKey: ["trending-communities"] });
    },
    onError: (mutationError) => {
      setMembershipError(getFriendlyErrorMessage(mutationError, "We could not update your community membership."));
      setPendingCommunityId(null);
    },
  });

  const membershipSet = new Set(Object.keys(membershipQuery.data ?? {}).map(Number));

  const filteredCommunities = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    const visible = (data ?? []).filter((community) => {
      if (!searchText) return true;
      return (
        community.name.toLowerCase().includes(searchText) ||
        community.description.toLowerCase().includes(searchText) ||
        (community.category ?? "").toLowerCase().includes(searchText)
      );
    });

    return [...visible].sort((a, b) => {
      if (sort === "new") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "largest") return (memberCountsQuery.data?.[b.id] ?? 0) - (memberCountsQuery.data?.[a.id] ?? 0);
      return (trendQuery.data?.[b.id]?.trend_score ?? 0) - (trendQuery.data?.[a.id]?.trend_score ?? 0)
        || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data, memberCountsQuery.data, query, sort, trendQuery.data]);

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

  if (isLoading) {
    return (
      <div className="yapster-card p-6 text-sm text-slate-500">
        Loading communities...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        Unable to load communities. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {membershipError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {membershipError}
        </div>
      )}

      <div className="yapster-card flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block flex-1" htmlFor="community-search">
            <span className="sr-only">Search communities</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
            <input
              id="community-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search communities by name, category, or topic"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60"
            />
          </label>
          <div className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-400 sm:px-0">
            <span>{filteredCommunities.length}</span>
            <span>{filteredCommunities.length === 1 ? "community" : "communities"}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="mr-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Sort</span>
          {([
            ["trending", "Trending"],
            ["new", "Newest"],
            ["largest", "Largest"],
          ] as [CommunitySort, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              aria-pressed={sort === value}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${sort === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCommunities.map((community) => {
          const isOwner = isOwnerOfCommunity(community, user?.id ?? null);
          const isMember = !isOwner && membershipSet.has(community.id);
          const memberCount = memberCountsQuery.data?.[community.id] ?? 0;
          const trend = trendQuery.data?.[community.id];
          const recentActivity = (trend?.recent_posts ?? 0) + (trend?.recent_comments ?? 0);
          const isPending = pendingCommunityId === community.id && joinOrLeaveMembership.isPending;
          const cleanName = community.name.trim() || "Community";

          let buttonLabel = "Join";
          if (authLoading) buttonLabel = "Loading...";
          else if (isPending) buttonLabel = "Working...";
          else if (isOwner) buttonLabel = "Admin";
          else if (isMember) buttonLabel = "Joined";

          return (
            <article
              key={community.id}
              className="group relative overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_34px_rgba(15,15,25,0.08)]"
            >
              <div className="h-1 bg-gradient-to-r from-orange-400 via-pink-500 to-violet-600 opacity-80" />
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/community/${community.id}`} className="flex min-w-0 items-center gap-3">
                    <span className="yapster-community-initial grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-black text-violet-800 ring-1 ring-black/5">
                      {cleanName.slice(0, 1).toUpperCase() || "C"}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-base font-extrabold text-slate-950 transition group-hover:text-violet-700">
                        {cleanName}
                      </strong>
                      <span className="mt-0.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                        {community.category || "Community"}
                      </span>
                    </span>
                  </Link>

                  {!isOwner ? (
                    <button
                      type="button"
                      disabled={authLoading || isPending || joinOrLeaveMembership.isPending}
                      onClick={() => handleMembershipToggle(community.id, isMember)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                        isMember
                          ? "border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                          : "border border-violet-600 bg-violet-600 text-white hover:border-violet-700 hover:bg-violet-700"
                      } ${authLoading || isPending ? "cursor-not-allowed opacity-65" : ""}`}
                    >
                      {buttonLabel}
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-800">
                      Admin
                    </span>
                  )}
                </div>

                <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-600">
                  {community.description || "A place for thoughtful discussion, recommendations, questions, and shared interests."}
                </p>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <span className="font-semibold">
                    {sort === "trending" && recentActivity > 0
                      ? `${recentActivity} recent ${recentActivity === 1 ? "interaction" : "interactions"}`
                      : `${memberCount} ${memberCount === 1 ? "member" : "members"}`}
                  </span>
                  <Link
                    to={`/community/${community.id}`}
                    className="inline-flex items-center gap-1 font-extrabold text-violet-700 transition hover:text-violet-800"
                  >
                    Open
                    <ArrowIcon />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!filteredCommunities.length && (
        <div className="yapster-card p-9 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
            <SearchIcon />
          </div>
          <h3 className="mt-4 text-lg font-extrabold text-slate-950">No communities found</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Try another keyword, or create a new community if the conversation you want does not exist yet.
          </p>
          <Link to="/community/create" className="yapster-button yapster-button--primary mt-5">
            Create community
          </Link>
        </div>
      )}
    </div>
  );
};
