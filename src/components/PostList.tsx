import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { supabase } from "../supabase-client";
import { PostItem } from "./PostItem";

export type FeedSort = "hot" | "new" | "top";
export type TopRange = "day" | "week" | "month" | "year" | "all";

export interface Post {
  id: number;
  title: string;
  content: string;
  created_at: string;
  image_url?: string;
  avatar_url?: string;
  user_id?: string;
  community_id?: number;
  community_name?: string;
  community_avatar_url?: string;
  author_name?: string;
  author_username?: string;
  like_count?: number;
  comment_count?: number;
  post_type?: "text" | "image" | "link" | "poll";
  link_url?: string;
  flair_id?: number;
  flair_name?: string;
  flair_color?: string;
}

interface Props {
  mode?: "for_you" | "discover";
  userId?: string | null;
  sort?: FeedSort;
  topRange?: TopRange;
}

interface PostCount {
  id: number;
  title: string;
  content: string;
  created_at: string;
  image_url: string | null;
  like_count: number | null;
  comment_count: number | null;
  user_avatar_url: string | null;
}

export const fetchPosts = async (): Promise<Post[]> => {
  const [{ data, error }, { data: countData, error: countError }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, user_id, community_id, title, content, created_at, image_url, post_type, link_url, flair_id, communities(id, name), post_flairs(id, name, color)")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_posts_with_counts"),
  ]);

  if (error) throw new Error(error.message);
  if (countError) throw new Error(countError.message);

  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((row: any) => row.user_id).filter(Boolean)));
  const profileById = new Map<string, any>();

  if (userIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    if (profileError) throw new Error(profileError.message);
    (profiles ?? []).forEach((profile: any) => profileById.set(profile.id, profile));
  }

  const metadataByPostId = new Map(rows.map((row: any) => [Number(row.id), row]));

  return ((countData ?? []) as PostCount[]).map((rpcPost) => {
    const metadata: any = metadataByPostId.get(Number(rpcPost.id));
    const profile = metadata?.user_id ? profileById.get(metadata.user_id) : null;
    return {
      id: Number(rpcPost.id),
      title: rpcPost.title ?? "",
      content: rpcPost.content ?? "",
      created_at: rpcPost.created_at ?? new Date().toISOString(),
      image_url: rpcPost.image_url ?? undefined,
      avatar_url: profile?.avatar_url ?? rpcPost.user_avatar_url ?? undefined,
      user_id: metadata?.user_id ?? undefined,
      community_id: metadata?.community_id != null ? Number(metadata.community_id) : undefined,
      community_name: metadata?.communities?.name ?? undefined,
      community_avatar_url: undefined,
      author_name: profile?.display_name ?? undefined,
      author_username: profile?.username ?? undefined,
      like_count: rpcPost.like_count ?? 0,
      comment_count: rpcPost.comment_count ?? 0,
      post_type: metadata?.post_type ?? "text",
      link_url: metadata?.link_url ?? undefined,
      flair_id: metadata?.flair_id != null ? Number(metadata.flair_id) : undefined,
      flair_name: metadata?.post_flairs?.name ?? undefined,
      flair_color: metadata?.post_flairs?.color ?? undefined,
    };
  });
};

const fetchJoinedCommunityIds = async (userId: string): Promise<Set<number>> => {
  const { data, error } = await supabase.from("community_members").select("community_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => Number(row.community_id)).filter(Number.isFinite));
};

const fetchOwnedCommunityIds = async (userId: string): Promise<Set<number>> => {
  const { data, error } = await supabase.from("communities").select("id").eq("created_by", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => Number(row.id)).filter(Number.isFinite));
};

const filterTopRange = (posts: Post[], range: TopRange) => {
  if (range === "all") return posts;
  const milliseconds = range === "day" ? 86_400_000 : range === "week" ? 604_800_000 : range === "month" ? 2_592_000_000 : 31_536_000_000;
  const cutoff = Date.now() - milliseconds;
  return posts.filter((post) => new Date(post.created_at).getTime() >= cutoff);
};

const sortPosts = (posts: Post[], sort: FeedSort, topRange: TopRange) => {
  const copy = sort === "top" ? filterTopRange([...posts], topRange) : [...posts];
  if (sort === "new") {
    return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  if (sort === "top") {
    return copy.sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0) || (b.comment_count ?? 0) - (a.comment_count ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const now = Date.now();
  const hotScore = (post: Post) => {
    const ageHours = Math.max(0, (now - new Date(post.created_at).getTime()) / 3_600_000);
    const engagement = Math.max(-4, post.like_count ?? 0) * 2 + (post.comment_count ?? 0) * 0.6 + 1;
    return engagement / Math.pow(ageHours + 2, 1.32);
  };
  return copy.sort((a, b) => hotScore(b) - hotScore(a));
};

const EmptyIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <path d="M5 6.5h14M5 11.5h10M5 16.5h7" strokeLinecap="round" />
  </svg>
);

export const PostList = ({ mode = "discover", userId, sort = "hot", topRange = "all" }: Props) => {
  const { data, error, isLoading } = useQuery<Post[], Error>({ queryKey: ["posts"], queryFn: fetchPosts });
  const { data: joinedIds = new Set<number>() } = useQuery<Set<number>, Error>({
    queryKey: ["community-joined-ids", userId],
    queryFn: () => (userId ? fetchJoinedCommunityIds(userId) : Promise.resolve(new Set<number>())),
    enabled: !!userId,
    retry: false,
  });
  const { data: ownedIds = new Set<number>() } = useQuery<Set<number>, Error>({
    queryKey: ["community-owned-ids", userId],
    queryFn: () => (userId ? fetchOwnedCommunityIds(userId) : Promise.resolve(new Set<number>())),
    enabled: !!userId,
    retry: false,
  });

  const accessibleCommunityIds = new Set<number>([...joinedIds, ...ownedIds]);
  const filteredPosts = sortPosts((data ?? []).filter((post) => {
    const communityId = post.community_id != null ? Number(post.community_id) : null;
    if (mode === "for_you") {
      if (!userId || communityId == null) return false;
      return accessibleCommunityIds.has(communityId);
    }
    if (communityId == null || !userId) return true;
    return !accessibleCommunityIds.has(communityId);
  }), sort, topRange);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading discussions">
        {[0, 1].map((item) => (
          <div key={item} className="yapster-card animate-pulse p-5">
            <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-slate-100" /><div className="space-y-2"><div className="h-3 w-32 rounded bg-slate-100" /><div className="h-2.5 w-20 rounded bg-slate-100" /></div></div>
            <div className="mt-5 h-5 w-4/5 rounded bg-slate-100" /><div className="mt-3 h-3 w-full rounded bg-slate-100" /><div className="mt-2 h-3 w-3/4 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700 shadow-sm">Unable to load discussions right now. Please try again.</div>;

  if (!filteredPosts.length) {
    const forYou = mode === "for_you";
    return (
      <div className="yapster-card p-9 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><EmptyIcon /></div>
        <h3 className="mt-4 text-xl font-extrabold text-slate-950">{forYou ? "Your feed is quiet" : sort === "top" ? "No top posts in this range" : "Nothing to discover yet"}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{forYou ? "Join a few communities and their discussions will show up here." : sort === "top" ? "Try a wider time range to see more highly rated discussions." : "New discussions will appear here as people start posting around Yapster."}</p>
        {forYou && <Link to="/communities" className="yapster-button yapster-button--primary mt-5">Browse communities</Link>}
      </div>
    );
  }

  return <div className="space-y-4">{filteredPosts.map((post) => <PostItem post={post} key={post.id} />)}</div>;
};
