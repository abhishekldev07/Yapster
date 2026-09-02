import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunities } from "../components/CommunityList";
import { PostList } from "../components/PostList";
import { useAuth } from "../context/AuthContext";

const feedTabs = [
  { key: "for_you", label: "For You" },
  { key: "discover", label: "Discover" },
] as const;

export const Home = () => {
  const { user } = useAuth();
  const [feedMode, setFeedMode] = useState<(typeof feedTabs)[number]["key"]>("discover");
  const { data: communities, error: communitiesError } = useQuery({
    queryKey: ["communities"],
    queryFn: fetchCommunities,
  });

  return (
    <div className="pt-6 pb-12">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,760px)_300px] lg:gap-8 lg:items-start">
          <main className="w-full">
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    H4UP feed
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                    Your feed
                  </h1>
                </div>
              </div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Discover community discussions, recommendations, questions, and updates from the topics you care about most.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {feedTabs.map((tab) => {
                  const isActive = feedMode === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFeedMode(tab.key)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                      }`}
                      aria-pressed={isActive}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">For You</span> = communities you&apos;ve joined
                <span className="mx-2 text-slate-300">•</span>
                <span className="font-semibold text-slate-700">Discover</span> = communities you may want to explore
              </p>
            </div>

            <PostList mode={feedMode} userId={user?.id ?? null} />
          </main>

          <aside className="mt-6 lg:mt-0">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Popular communities
                </h2>
              </div>

              {communitiesError ? (
                <p className="mt-3 text-sm text-slate-500">
                  Communities are unavailable right now.
                </p>
              ) : communities?.length ? (
                <ul className="mt-4 space-y-3">
                  {communities.slice(0, 6).map((community) => (
                    <li key={community.id}>
                      <Link
                        to={`/community/${community.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:border-emerald-200 hover:bg-emerald-50 focus-visible:border-emerald-400 focus-visible:bg-emerald-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                            {community.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-700">
                            {community.name}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  No communities yet. Start one today.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
