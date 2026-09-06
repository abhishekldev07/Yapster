import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { FeedMode, FeedSort, PostList, TopRange } from "../components/PostList";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

const feedTabs: { key: FeedMode; label: string }[] = [
  { key: "for_you", label: "My communities" },
  { key: "following", label: "Following" },
  { key: "discover", label: "Discover" },
];

const sortTabs: { key: FeedSort; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "new", label: "New" },
  { key: "top", label: "Top" },
];

const topRanges: { key: TopRange; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

interface TrendingCommunity {
  id: number;
  name: string;
  description: string | null;
  member_count: number;
  recent_posts: number;
  recent_comments: number;
  trend_score: number | string;
  icon_url?: string | null;
}

const fetchTrendingCommunities = async (): Promise<TrendingCommunity[]> => {
  const { data, error } = await supabase
    .from("community_trending")
    .select("id, name, description, member_count, recent_posts, recent_comments, trend_score")
    .order("trend_score", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as TrendingCommunity[];
  const ids = rows.map((row) => row.id);
  if (!ids.length) return rows;

  const { data: identities, error: identityError } = await supabase
    .from("communities")
    .select("id, icon_url")
    .in("id", ids);
  if (identityError) throw new Error(identityError.message);

  const icons = new Map((identities ?? []).map((item) => [Number(item.id), item.icon_url as string | null]));
  return rows.map((row) => ({ ...row, icon_url: icons.get(row.id) ?? null }));
};

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const Home = () => {
  const { user } = useAuth();
  const [feedMode, setFeedMode] = useState<FeedMode>(user ? "for_you" : "discover");
  const [feedSort, setFeedSort] = useState<FeedSort>("hot");
  const [topRange, setTopRange] = useState<TopRange>("week");
  const { data: trendingCommunities = [], error: communitiesError } = useQuery<TrendingCommunity[], Error>({
    queryKey: ["trending-communities"],
    queryFn: fetchTrendingCommunities,
    staleTime: 60_000,
  });

  const topRangeLabel = topRanges.find((range) => range.key === topRange)?.label ?? "This week";
  const sectionTitle = feedMode === "for_you" ? "From your communities" : feedMode === "following" ? "From people you follow" : "Worth discovering";

  return (
    <main className="yapster-home-page pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="yapster-home-shell mx-auto w-full max-w-[1240px] px-4 sm:px-6">
        <div className="yapster-home-grid grid items-start gap-7 lg:grid-cols-[minmax(0,760px)_300px] xl:gap-9">
          <section className="yapster-home-primary min-w-0">
            <div className="yapster-feed-hero p-5 sm:p-6">
              <div className="yapster-feed-hero__top relative z-10 flex items-start justify-between gap-6">
                <div className="yapster-feed-hero__copy max-w-[580px]">
                  <h1 className="max-w-xl text-2xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-[2rem]">{user ? "Your communities, people, and conversations in one place." : "Find your people. Join the conversation."}</h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 sm:text-[0.95rem]">{user ? "Catch up on communities you joined, people you follow, or jump outside your bubble and discover something new." : "Interest-driven communities where questions, opinions, recommendations, and ideas have room to breathe."}</p>
                </div>
                <div className="hidden shrink-0 sm:block"><Link to={user ? "/create" : "/signup"} className="yapster-hero-cta inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5">{user ? "Create post" : "Join Yapster"}<ArrowIcon /></Link></div>
              </div>

              <div className="yapster-feed-hero__tabs relative z-10 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-white/10 bg-white/[0.055] p-1">
                  {feedTabs.map((tab) => {
                    const isActive = feedMode === tab.key;
                    const requiresLogin = tab.key !== "discover" && !user;
                    return <button key={tab.key} type="button" onClick={() => !requiresLogin && setFeedMode(tab.key)} disabled={requiresLogin} className={`min-w-max rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${isActive ? "bg-[#2b2b36] text-white shadow-sm ring-1 ring-white/10" : requiresLogin ? "cursor-not-allowed text-white/25" : "text-white/55 hover:bg-white/[0.045] hover:text-white"}`} aria-pressed={isActive}>{tab.label}</button>;
                  })}
                </div>
                {!user && <span className="text-xs font-medium text-white/40">Sign in to build personalized feeds.</span>}
              </div>
            </div>

            <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{sectionTitle}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{feedSort === "hot" ? "Active conversations rising right now." : feedSort === "new" ? "The newest conversations first." : `Highest-scoring conversations · ${topRangeLabel.toLowerCase()}.`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Sort discussions">
                  {sortTabs.map((tab) => <button key={tab.key} type="button" onClick={() => setFeedSort(tab.key)} aria-pressed={feedSort === tab.key} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${feedSort === tab.key ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{tab.label}</button>)}
                </div>
                {feedSort === "top" && (
                  <select value={topRange} onChange={(event) => setTopRange(event.target.value as TopRange)} aria-label="Top posts time range" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm outline-none focus:border-violet-300">
                    {topRanges.map((range) => <option key={range.key} value={range.key}>{range.label}</option>)}
                  </select>
                )}
              </div>
            </div>

            <PostList mode={feedMode} userId={user?.id ?? null} sort={feedSort} topRange={topRange} />
          </section>

          <aside className="yapster-home-sidebar space-y-5 lg:sticky lg:top-[92px]">
            <section className="yapster-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-600">Discover</p><h2 className="mt-1 text-base font-bold text-slate-950">Trending communities</h2></div><Link to="/communities" className="text-xs font-medium text-slate-500 hover:text-slate-900">See all</Link></div>
              {communitiesError ? <p className="mt-4 text-sm leading-6 text-slate-500">Communities are unavailable right now.</p> : trendingCommunities.length ? (
                <div className="mt-4 space-y-1">
                  {trendingCommunities.map((community, index) => {
                    const cleanName = community.name.trim() || "Community";
                    const recentActivity = Number(community.recent_posts) + Number(community.recent_comments);
                    return (
                      <Link key={community.id} to={`/community/${community.id}`} className="group flex items-center gap-3 rounded-xl py-2.5 transition hover:bg-slate-50/70">
                        <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-300">{String(index + 1).padStart(2, "0")}</span>
                        <span className="yapster-community-initial grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-xs font-bold ring-1 ring-black/5">{community.icon_url ? <img src={community.icon_url} alt="" className="h-full w-full object-cover" /> : cleanName.slice(0, 1).toUpperCase() || "Y"}</span>
                        <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold text-slate-800 transition group-hover:text-violet-700">{cleanName}</strong><span className="mt-0.5 block truncate text-xs text-slate-400">{recentActivity > 0 ? `${recentActivity} recent ${recentActivity === 1 ? "activity" : "interactions"} · ${Number(community.member_count)} members` : community.description?.trim() || "Community discussions"}</span></span>
                      </Link>
                    );
                  })}
                </div>
              ) : <p className="mt-4 text-sm leading-6 text-slate-500">No communities yet. Be the first to start one.</p>}
            </section>

            <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
              <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
              <div className="p-5"><h2 className="text-base font-bold text-slate-950">Build your corner of Yapster</h2><p className="mt-2 text-sm leading-6 text-slate-500">Start a community around a topic, hobby, place, profession, or idea people can gather around.</p><Link to={user ? "/community/create" : "/signup"} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-800">{user ? "Create a community" : "Create an account"}<ArrowIcon /></Link></div>
            </section>
            <p className="px-1 text-[11px] leading-5 text-slate-400">Yapster · Communities worth talking about</p>
          </aside>
        </div>
      </div>
    </main>
  );
};