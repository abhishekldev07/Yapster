import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

type SearchTab = "all" | "posts" | "communities" | "people";

interface SearchPost {
  id: number;
  title: string;
  content: string;
  created_at: string;
  image_url?: string | null;
  community_id?: number | null;
  community_name?: string | null;
}

interface SearchCommunity {
  id: number;
  name: string;
  description: string | null;
  created_by?: string | null;
  member_count?: number;
}

interface SearchProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface SearchResults {
  posts: SearchPost[];
  communities: SearchCommunity[];
  people: SearchProfile[];
  memberCounts: Record<number, number>;
}

const tabs: { key: SearchTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "communities", label: "Communities" },
  { key: "people", label: "People" },
];

const buildSearchClause = (field: string, searchTerm: string) => `${field}.ilike.${searchTerm}`;

const fetchSearchResults = async (searchTerm: string): Promise<SearchResults> => {
  const trimmedTerm = searchTerm.trim();
  if (!trimmedTerm) {
    return { posts: [], communities: [], people: [], memberCounts: {} };
  }

  const likeTerm = `%${trimmedTerm}%`;
  const [postsResponse, communitiesResponse, profilesResponse] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, content, created_at, image_url, community_id, communities(id, name)")
      .or(`${buildSearchClause("title", likeTerm)},${buildSearchClause("content", likeTerm)}`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("communities")
      .select("id, name, description, created_by")
      .or(`${buildSearchClause("name", likeTerm)},${buildSearchClause("description", likeTerm)}`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio")
      .or(`${buildSearchClause("username", likeTerm)},${buildSearchClause("display_name", likeTerm)}`)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (postsResponse.error) throw new Error(postsResponse.error.message);
  if (communitiesResponse.error) throw new Error(communitiesResponse.error.message);
  if (profilesResponse.error) throw new Error(profilesResponse.error.message);

  const communityIds = Array.from(
    new Set(
      ((communitiesResponse.data ?? []) as Array<{ id: number }>).map((community) => Number(community.id)).filter(Number.isFinite)
    )
  );

  const memberCounts: Record<number, number> = {};
  if (communityIds.length > 0) {
    const { data: membershipRows, error: memberError } = await supabase
      .from("community_members")
      .select("community_id")
      .in("community_id", communityIds);

    if (memberError) throw new Error(memberError.message);

    (membershipRows ?? []).forEach((row: { community_id: number | null }) => {
      const communityId = Number(row.community_id);
      if (!Number.isFinite(communityId)) return;
      memberCounts[communityId] = (memberCounts[communityId] ?? 0) + 1;
    });
  }

  const posts = ((postsResponse.data ?? []) as any[]).map((post) => ({
    id: Number(post.id),
    title: post.title ?? "",
    content: post.content ?? "",
    created_at: post.created_at ?? new Date().toISOString(),
    image_url: post.image_url ?? null,
    community_id: post.community_id != null ? Number(post.community_id) : null,
    community_name: post.communities?.name ?? null,
  }));

  const communities = ((communitiesResponse.data ?? []) as any[]).map((community) => ({
    id: Number(community.id),
    name: community.name ?? "",
    description: community.description ?? null,
    created_by: community.created_by ?? null,
    member_count: memberCounts[Number(community.id)] ?? 0,
  }));

  const people = ((profilesResponse.data ?? []) as any[]).map((profile) => ({
    id: profile.id,
    username: profile.username ?? null,
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
  }));

  return { posts, communities, people, memberCounts };
};

const SearchIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9">
    <circle cx="10.8" cy="10.8" r="6.5" />
    <path d="m16 16 4.2 4.2" strokeLinecap="round" />
  </svg>
);

export const SearchPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const { user } = useAuth();

  const trimmedQuery = searchTerm.trim();
  const hasSearchQuery = trimmedQuery.length > 0;

  const { data, isLoading, error } = useQuery<SearchResults, Error>({
    queryKey: ["search", trimmedQuery],
    queryFn: () => fetchSearchResults(trimmedQuery),
    enabled: hasSearchQuery,
    retry: false,
    staleTime: 30_000,
  });

  const { data: memberships = {} } = useQuery<Record<number, true>, Error>({
    queryKey: ["community-memberships", user?.id],
    queryFn: async () => {
      if (!user) return {};
      const { data, error } = await supabase.from("community_members").select("community_id").eq("user_id", user.id);
      if (error) throw new Error(error.message);

      const result: Record<number, true> = {};
      (data ?? []).forEach((row: { community_id: number | null }) => {
        const communityId = Number(row.community_id);
        if (Number.isFinite(communityId)) result[communityId] = true;
      });
      return result;
    },
    enabled: !!user,
    retry: false,
  });

  const visibleResults = useMemo(() => {
    if (!data) return { posts: [], communities: [], people: [] };

    const posts = activeTab === "all" || activeTab === "posts" ? data.posts : [];
    const communities = activeTab === "all" || activeTab === "communities" ? data.communities : [];
    const people = activeTab === "all" || activeTab === "people" ? data.people : [];

    return { posts, communities, people };
  }, [activeTab, data]);

  const totalResults = visibleResults.posts.length + visibleResults.communities.length + visibleResults.people.length;

  const renderSkeleton = () => (
    <div className="space-y-4">
      {[0, 1, 2].map((item) => (
        <div key={item} className="yapster-card animate-pulse p-5">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="mt-3 h-6 w-2/3 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );

  const renderNeutralState = () => (
    <div className="yapster-card p-9 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700">
        <SearchIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-2xl font-black tracking-[-0.035em] text-slate-950">Search all of Yapster</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        Find conversations, communities, and people without digging through separate pages.
      </p>
    </div>
  );

  const renderEmptyState = () => (
    <div className="yapster-card p-9 text-center sm:p-12">
      <h2 className="text-2xl font-black tracking-[-0.035em] text-slate-950">No results for “{trimmedQuery}”</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Try a broader term or a different spelling.</p>
    </div>
  );

  const renderPostResults = () => {
    if (!visibleResults.posts.length) return null;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-950">Posts</h3>
          <span className="text-xs font-extrabold text-slate-400">{visibleResults.posts.length}</span>
        </div>

        <div className="space-y-3">
          {visibleResults.posts.map((post) => (
            <article key={post.id} className="yapster-card overflow-hidden transition hover:border-slate-300">
              <Link to={`/post/${post.id}`} className="block p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                  {post.community_name && (
                    <span className="yapster-community-chip">{post.community_name}</span>
                  )}
                  <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>

                <h4 className="mt-3 text-lg font-extrabold leading-snug text-slate-950 transition hover:text-violet-800 sm:text-xl">{post.title}</h4>

                {post.content && (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {post.content.length > 220 ? `${post.content.slice(0, 220)}…` : post.content}
                  </p>
                )}

                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt=""
                    className="mt-4 h-44 w-full rounded-xl border border-slate-200 object-cover sm:h-52"
                    loading="lazy"
                  />
                )}
              </Link>
            </article>
          ))}
        </div>
      </section>
    );
  };

  const renderCommunityResults = () => {
    if (!visibleResults.communities.length) return null;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-950">Communities</h3>
          <span className="text-xs font-extrabold text-slate-400">{visibleResults.communities.length}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {visibleResults.communities.map((community) => {
            const isOwner = community.created_by === user?.id;
            const isMember = !isOwner && Boolean(memberships[community.id]);
            const memberCount = community.member_count ?? 0;

            return (
              <Link key={community.id} to={`/community/${community.id}`} className="yapster-card group block p-4 transition hover:border-slate-300">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-xs font-black text-violet-800 ring-1 ring-black/5">
                    {community.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-base font-extrabold text-slate-950 transition group-hover:text-violet-700">{community.name}</h4>
                      {(isOwner || isMember) && (
                        <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-violet-700">
                          {isOwner ? "Admin" : "Joined"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{memberCount} {memberCount === 1 ? "member" : "members"}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                  {community.description || "A community for new conversations and shared interests."}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  const renderPeopleResults = () => {
    if (!visibleResults.people.length) return null;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-950">People</h3>
          <span className="text-xs font-extrabold text-slate-400">{visibleResults.people.length}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {visibleResults.people.map((person) => {
            const username = person.username || "unknown";
            const displayName = person.display_name || username;

            return (
              <Link
                key={person.id}
                to={`/profile/${encodeURIComponent(username)}`}
                className="yapster-card flex items-start gap-3 p-4 transition hover:border-slate-300"
              >
                {person.avatar_url ? (
                  <img src={person.avatar_url} alt="" className="h-11 w-11 rounded-xl border border-slate-200 object-cover" />
                ) : (
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-sm font-black text-slate-600 ring-1 ring-slate-200">
                    {(displayName || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-base font-extrabold text-slate-950">{displayName}</h4>
                  <p className="mt-0.5 text-xs font-semibold text-violet-700">@{username}</p>
                  {person.bio && (
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500">
                      {person.bio}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1040px] px-4 sm:px-6">
        <section className="overflow-hidden rounded-[22px] border border-[#22222c] bg-[#0e0e15] shadow-sm">
          <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <img src="/yapster-mark.svg" alt="" className="h-9 w-9" />
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/40">Yapster search</p>
                <h1 className="mt-0.5 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">Find the conversation.</h1>
              </div>
            </div>

            <div className="relative mt-5">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-white/35">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search posts, communities, and people"
                aria-label="Search Yapster"
                autoFocus
                className="w-full rounded-2xl border border-white/10 bg-white/[0.075] py-3.5 pl-12 pr-4 text-base font-medium text-white placeholder:font-normal placeholder:text-white/30 outline-none transition focus:border-violet-400/60 focus:bg-white/10 focus:ring-4 focus:ring-violet-500/10"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                      isActive ? "bg-white text-slate-950" : "bg-white/[0.05] text-white/45 hover:bg-white/[0.08] hover:text-white/70"
                    }`}
                    aria-pressed={isActive}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="mt-6">
          {!hasSearchQuery && renderNeutralState()}
          {hasSearchQuery && isLoading && renderSkeleton()}
          {hasSearchQuery && !isLoading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700 shadow-sm">
              Unable to complete the search. Please try again.
            </div>
          )}
          {hasSearchQuery && !isLoading && !error && !totalResults && renderEmptyState()}
          {hasSearchQuery && !isLoading && !error && totalResults > 0 && (
            <div className="space-y-8">
              {renderPostResults()}
              {renderCommunityResults()}
              {renderPeopleResults()}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
