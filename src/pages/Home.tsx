import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunities } from "../components/CommunityList";
import { FeedSort, PostList, TopRange } from "../components/PostList";
import { useAuth } from "../context/AuthContext";

const feedTabs = [
  { key: "for_you", label: "My communities" },
  { key: "discover", label: "Discover" },
] as const;

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

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const Home = () => {
  const { user } = useAuth();
  const [feedMode, setFeedMode] = useState<(typeof feedTabs)[number]["key"]>(user ? "for_you" : "discover");
  const [feedSort, setFeedSort] = useState<FeedSort>("hot");
  const [topRange, setTopRange] = useState<TopRange>("week");
  const { data: communities, error: communitiesError } = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });

  const topRangeLabel = topRanges.find((range) => range.key === topRange)?.label ?? "This week";

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6">
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,760px)_300px] xl:gap-9">
          <section className="min-w-0">
            <div className="yapster-feed-hero p-5 sm:p-6">
              <div className="relative z-10 flex items-start justify-between gap-6">
                <div className="max-w-[580px]">
                  <h1 className="max-w-xl text-2xl font-extrabold leading-tight tracking-[-0.045em] text-white sm:text-[2rem]">{user ? "Your communities, one conversation at a time." : "Find your people. Join the conversation."}</h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 sm:text-[0.95rem]">{user ? "Catch up on discussions from the communities you joined, or jump outside your bubble and discover something new." : "Interest-driven communities where questions, opinions, recommendations, and ideas have room to breathe."}</p>
                </div>
                <div className="hidden shrink-0 sm:block"><Link to={user ? "/create" : "/signup"} className="yapster-hero-cta inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition hover:-translate-y-0.5">{user ? "Create post" : "Join Yapster"}<ArrowIcon /></Link></div>
              </div>

              <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.055] p-1">
                  {feedTabs.map((tab) => {
                    const isActive = feedMode === tab.key;
                    const requiresLogin = tab.key === "for_you" && !user;
                    return <button key={tab.key} type="button" onClick={() => !requiresLogin && setFeedMode(tab.key)} disabled={requiresLogin} className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${isActive ? "bg-[#2b2b36] text-white shadow-sm ring-1 ring-white/10" : requiresLogin ? "cursor-not-allowed text-white/25" : "text-white/55 hover:bg-white/[0.045] hover:text-white"}`} aria-pressed={isActive}>{tab.label}</button>;
                  })}
                </div>
                {!user && <span className="text-xs font-medium text-white/40">Sign in to build a personalized community feed.</span>}
              </div>
            </div>

            <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{feedMode === "for_you" ? "From your communities" : "Worth discovering"}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{feedSort === "hot" ? "Active conversations rising right now." : feedSort === "new" ? "The newest conversations first." : `Highest-scoring conversations · ${topRangeLabel.toLowerCase()}.`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Sort discussions">
                  {sortTabs.map((tab) => <button key={tab.key} type="button" onClick={() => setFeedSort(tab.key)} aria-pressed={feedSort === tab.key} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${feedSort === tab.key ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{tab.label}</button>)}
                </div>
                {feedSort === "top" && (
                  <select value={topRange} onChange={(event) => setTopRange(event.target.value as TopRange)} aria-label="Top posts time range" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 shadow-sm outline-none focus:border-violet-300">
                    {topRanges.map((range) => <option key={range.key} value={range.key}>{range.label}</option>)}
                  </select>
                )}
                <Link to="/communities" className="hidden text-xs font-bold text-violet-700 hover:text-violet-800 sm:inline">Communities</Link>
              </div>
            </div>

            <PostList mode={feedMode} userId={user?.id ?? null} sort={feedSort} topRange={topRange} />
          </section>

          <aside className="space-y-5 lg:sticky lg:top-[92px]">
            <section className="yapster-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-violet-600">Discover</p><h2 className="mt-1 text-base font-extrabold text-slate-950">Popular communities</h2></div><Link to="/communities" className="text-xs font-bold text-slate-500 hover:text-slate-900">See all</Link></div>
              {communitiesError ? <p className="mt-4 text-sm leading-6 text-slate-500">Communities are unavailable right now.</p> : communities?.length ? (
                <div className="mt-4 divide-y divide-slate-100">
                  {communities.slice(0, 5).map((community, index) => (
                    <Link key={community.id} to={`/community/${community.id}`} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="w-5 shrink-0 text-center text-xs font-extrabold text-slate-300">{String(index + 1).padStart(2, "0")}</span>
                      <span className="yapster-community-initial grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-xs font-black ring-1 ring-black/5">{community.name.trim().slice(0, 1).toUpperCase() || "Y"}</span>
                      <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-bold text-slate-800 transition group-hover:text-violet-700">{community.name}</strong><span className="mt-0.5 block truncate text-xs text-slate-400">{community.description?.trim() || "Community discussions"}</span></span>
                    </Link>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm leading-6 text-slate-500">No communities yet. Be the first to start one.</p>}
            </section>

            <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
              <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
              <div className="p-5"><h2 className="text-base font-extrabold text-slate-950">Build your corner of Yapster</h2><p className="mt-2 text-sm leading-6 text-slate-500">Start a community around a topic, hobby, place, profession, or idea people can gather around.</p><Link to={user ? "/community/create" : "/signup"} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-violet-700 hover:text-violet-800">{user ? "Create a community" : "Create an account"}<ArrowIcon /></Link></div>
            </section>
            <p className="px-1 text-[11px] leading-5 text-slate-400">Yapster · Communities worth talking about</p>
          </aside>
        </div>
      </div>
    </main>
  );
};
