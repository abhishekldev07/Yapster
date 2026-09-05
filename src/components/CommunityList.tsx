import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { COMMUNITY_CATEGORIES } from "../lib/communityCategories";
import { getFriendlyErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

export type CommunityRole = "owner" | "moderator" | "member";
type CommunitySort = "trending" | "new" | "largest";

export interface Community {
  id: number;
  name: string;
  description: string;
  category?: string | null;
  icon_url?: string | null;
  banner_url?: string | null;
  created_at: string;
  created_by?: string | null;
  member_count?: number | null;
}

interface TrendStat { trend_score: number; recent_posts: number; recent_comments: number; }

export const fetchCommunities = async (): Promise<Community[]> => {
  const { data, error } = await supabase.from("communities").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Community[];
};

const fetchCommunityTrendStats = async (): Promise<Record<number, TrendStat>> => {
  const { data, error } = await supabase.from("community_trending").select("id, trend_score, recent_posts, recent_comments");
  if (error) throw new Error(error.message);
  const result: Record<number, TrendStat> = {};
  (data ?? []).forEach((row) => { result[Number(row.id)] = { trend_score: Number(row.trend_score ?? 0), recent_posts: Number(row.recent_posts ?? 0), recent_comments: Number(row.recent_comments ?? 0) }; });
  return result;
};

const fetchUserMemberships = async (userId: string): Promise<Record<number, true>> => {
  const { data, error } = await supabase.from("community_members").select("community_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const result: Record<number, true> = {};
  (data ?? []).forEach((row) => { result[Number(row.community_id)] = true; });
  return result;
};

const fetchCommunityMemberCounts = async (): Promise<Record<number, number>> => {
  const [{ data, error }, { data: communities, error: communitiesError }] = await Promise.all([
    supabase.from("community_members").select("community_id"),
    supabase.from("communities").select("id, created_by"),
  ]);
  if (error) throw new Error(error.message);
  if (communitiesError) throw new Error(communitiesError.message);
  const counts: Record<number, number> = {};
  (data ?? []).forEach((row) => { const id = Number(row.community_id); counts[id] = (counts[id] ?? 0) + 1; });
  (communities ?? []).forEach((community) => { if (community.created_by) counts[community.id] = (counts[community.id] ?? 0) + 1; });
  return counts;
};

const SearchIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4 4" strokeLinecap="round" /></svg>;
const ArrowIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export const CommunityList = () => {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, signInWithGitHub } = useAuth();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CommunitySort>("trending");
  const [category, setCategory] = useState("All categories");
  const [pendingCommunityId, setPendingCommunityId] = useState<number | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery<Community[], Error>({ queryKey: ["communities"], queryFn: fetchCommunities });
  const trendQuery = useQuery<Record<number, TrendStat>, Error>({ queryKey: ["community-trend-stats"], queryFn: fetchCommunityTrendStats, staleTime: 60_000 });
  const memberCountsQuery = useQuery<Record<number, number>, Error>({ queryKey: ["community-member-counts"], queryFn: fetchCommunityMemberCounts });
  const membershipQuery = useQuery<Record<number, true>, Error>({ queryKey: ["community-memberships", user?.id], queryFn: () => user ? fetchUserMemberships(user.id) : {}, enabled: !authLoading && !!user, retry: false });

  const joinOrLeaveMembership = useMutation({
    mutationFn: async ({ communityId, isJoined }: { communityId: number; isJoined: boolean }) => {
      if (!user) throw new Error("You must be signed in to join a community.");
      const community = data?.find((entry) => entry.id === communityId);
      if (community?.created_by === user.id) return;
      if (isJoined) {
        const { error } = await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", user.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("community_members").insert({ community_id: communityId, user_id: user.id });
        if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
      }
    },
    onSuccess: async (_, variables) => {
      setPendingCommunityId(null);
      setMembershipError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["community-memberships"] }),
        queryClient.invalidateQueries({ queryKey: ["community-member-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["community-member-count", variables.communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-membership", variables.communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-trend-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] }),
      ]);
    },
    onError: (mutationError) => { setPendingCommunityId(null); setMembershipError(getFriendlyErrorMessage(mutationError, "We could not update your community membership.")); },
  });

  const membershipSet = new Set(Object.keys(membershipQuery.data ?? {}).map(Number));
  const filteredCommunities = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    const visible = (data ?? []).filter((community) => {
      const matchesCategory = category === "All categories" || (community.category || "Other") === category;
      if (!matchesCategory) return false;
      if (!searchText) return true;
      return community.name.toLowerCase().includes(searchText) || community.description.toLowerCase().includes(searchText) || (community.category ?? "").toLowerCase().includes(searchText);
    });
    return [...visible].sort((a, b) => {
      if (sort === "new") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "largest") return (memberCountsQuery.data?.[b.id] ?? 0) - (memberCountsQuery.data?.[a.id] ?? 0);
      return (trendQuery.data?.[b.id]?.trend_score ?? 0) - (trendQuery.data?.[a.id]?.trend_score ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [category, data, memberCountsQuery.data, query, sort, trendQuery.data]);

  if (isLoading) return <div className="yapster-card p-6 text-sm text-slate-500">Loading communities...</div>;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Unable to load communities. Please try again.</div>;

  return (
    <div className="space-y-5">
      {membershipError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{membershipError}</div>}
      <div className="yapster-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block flex-1" htmlFor="community-search"><span className="sr-only">Search communities</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span><input id="community-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search communities by name, category, or topic" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-normal text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60" /></label>
          <label className="min-w-[220px] text-xs font-semibold text-slate-500"><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-violet-300 focus:bg-white"><option>All categories</option>{COMMUNITY_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <span className="px-1 text-xs font-medium text-slate-400">{filteredCommunities.length} {filteredCommunities.length === 1 ? "community" : "communities"}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Sort</span>{([["trending","Trending"],["new","Newest"],["largest","Largest"]] as [CommunitySort,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setSort(value)} aria-pressed={sort === value} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${sort === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{label}</button>)}</div>
      </div>

      {filteredCommunities.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredCommunities.map((community) => {
        const isOwner = Boolean(user && community.created_by === user.id);
        const isMember = !isOwner && membershipSet.has(community.id);
        const memberCount = memberCountsQuery.data?.[community.id] ?? 0;
        const recentActivity = (trendQuery.data?.[community.id]?.recent_posts ?? 0) + (trendQuery.data?.[community.id]?.recent_comments ?? 0);
        const isPending = pendingCommunityId === community.id && joinOrLeaveMembership.isPending;
        const cleanName = community.name.trim() || "Community";
        return <article key={community.id} className="group relative overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_34px_rgba(15,15,25,0.08)]">
          <div className="h-1 bg-gradient-to-r from-orange-400 via-pink-500 to-violet-600 opacity-80" />
          <div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><Link to={`/community/${community.id}`} className="flex min-w-0 items-center gap-3"><span className="yapster-community-initial grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[13px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-semibold text-violet-800 ring-1 ring-black/5">{community.icon_url ? <img src={community.icon_url} alt="" className="h-full w-full object-cover" /> : cleanName.slice(0,1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-base font-semibold text-slate-950 transition group-hover:text-violet-700">{cleanName}</strong><span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-600">{community.category || "Other"}</span></span></Link>
          {isOwner ? <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-500">Admin</span> : <button type="button" disabled={authLoading || isPending || joinOrLeaveMembership.isPending} onClick={() => { if (!user) return void signInWithGitHub(); setPendingCommunityId(community.id); joinOrLeaveMembership.mutate({ communityId: community.id, isJoined: isMember }); }} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isMember ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-violet-600 text-white hover:bg-violet-700"} disabled:opacity-60`}>{isPending ? "Working..." : isMember ? "Joined" : "Join"}</button>}</div>
          <p className="mt-4 min-h-10 line-clamp-2 text-sm leading-5 text-slate-500">{community.description || "A Yapster community."}</p><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400"><span>{memberCount} {memberCount === 1 ? "member" : "members"}</span><span>{recentActivity > 0 ? `${recentActivity} recent activities` : "Open community"}</span></div><Link to={`/community/${community.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-700">Open <ArrowIcon /></Link></div>
        </article>;
      })}</div> : <div className="yapster-card p-9 text-center"><h3 className="text-lg font-bold text-slate-950">No communities match</h3><p className="mt-2 text-sm text-slate-500">Try another category or search term.</p></div>}
    </div>
  );
};
