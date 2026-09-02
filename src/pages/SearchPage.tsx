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

  let memberCounts: Record<number, number> = {};
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
        <div key={item} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-3 h-6 w-2/3 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-full rounded bg-slate-200" />
          <div className="mt-2 h-4 w-5/6 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );

  const renderNeutralState = () => (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16L21 21" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">Search H4UP</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">Find communities, people, and discussions.</p>
    </div>
  );

  const renderEmptyState = () => (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Nothing found</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">Try a different search.</p>
    </div>
  );

  const renderPostResults = () => {
    if (!visibleResults.posts.length) return null;

    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Posts</h3>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{visibleResults.posts.length}</span>
        </div>

        <div className="space-y-4">
          {visibleResults.posts.map((post) => (
            <article key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <Link to={`/post/${post.id}`} className="block p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                  {post.community_name && (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold uppercase tracking-[0.08em] text-emerald-800">
                      {post.community_name}
                    </span>
                  )}
                  <span>•</span>
                  <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>

                <h4 className="mt-3 text-xl font-semibold text-slate-900 hover:text-emerald-800">{post.title}</h4>

                {post.content && (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {post.content.length > 220 ? `${post.content.slice(0, 220)}...` : post.content}
                  </p>
                )}

                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="mt-4 h-44 w-full rounded-xl border border-slate-200 object-cover"
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
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Communities</h3>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{visibleResults.communities.length}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleResults.communities.map((community) => {
            const isOwner = community.created_by === user?.id;
            const isMember = !isOwner && Boolean(memberships[community.id]);
            const memberCount = community.member_count ?? 0;

            let buttonLabel = "Join";
            if (isOwner) buttonLabel = "Admin";
            else if (isMember) buttonLabel = "Joined";

            return (
              <article key={community.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/community/${community.id}`} className="text-lg font-semibold text-slate-900 hover:text-emerald-800">
                    {community.name}
                  </Link>
                  {!isOwner && (
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        isMember ? "border border-slate-200 bg-slate-100 text-slate-700" : "bg-emerald-700 text-white"
                      }`}
                    >
                      {buttonLabel}
                    </button>
                  )}
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {community.description || "A community for new conversations and shared interests."}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{memberCount} members</span>
                  <Link to={`/community/${community.id}`} className="font-semibold text-emerald-700 hover:text-emerald-800">
                    View community
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const renderPeopleResults = () => {
    if (!visibleResults.people.length) return null;

    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">People</h3>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{visibleResults.people.length}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleResults.people.map((person) => {
            const username = person.username || "unknown";
            const displayName = person.display_name || username;

            return (
              <Link
                key={person.id}
                to={`/profile/${encodeURIComponent(username)}`}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-200"
              >
                {person.avatar_url ? (
                  <img src={person.avatar_url} alt={displayName} className="h-12 w-12 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700">
                    {(displayName || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-semibold text-slate-900">{displayName}</h4>
                  <p className="mt-1 text-sm text-slate-500">@{username}</p>
                  {person.bio && (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {person.bio.length > 150 ? `${person.bio.slice(0, 150)}...` : person.bio}
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
    <div className="pt-6 pb-12">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Search</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">SEARCH</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Find communities, people, and discussions.</p>
            </div>
          </div>

          <div className="relative mt-5">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="6" />
                <path d="M16 16L21 21" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search H4UP..."
              aria-label="Search H4UP"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-base text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
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
        </div>

        <div className="mt-6">
          {!hasSearchQuery && renderNeutralState()}
          {hasSearchQuery && isLoading && renderSkeleton()}
          {hasSearchQuery && !isLoading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
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
    </div>
  );
};
