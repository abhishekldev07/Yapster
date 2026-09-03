import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { supabase } from "../supabase-client";
import { PostItem } from "./PostItem";

export interface Post {
  id: number;
  title: string;
  content: string;
  created_at: string;
  image_url: string;
  avatar_url?: string;
  community_id?: number;
  community_name?: string;
  community_avatar_url?: string;
  author_name?: string;
  author_username?: string;
  like_count?: number;
  comment_count?: number;
}

interface Props {
  mode?: "for_you" | "discover";
  userId?: string | null;
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
      .select("id, community_id, title, content, created_at, image_url, communities(id, name)")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_posts_with_counts"),
  ]);

  if (error) throw new Error(error.message);
  if (countError) throw new Error(countError.message);

  const communityByPostId = new Map(
    (data ?? []).map((row: any) => [Number(row.id), row])
  );

  return ((countData ?? []) as PostCount[]).map((rpcPost) => {
    const postMetadata = communityByPostId.get(Number(rpcPost.id));
    return {
    id: Number(rpcPost.id),
    title: rpcPost.title ?? "",
    content: rpcPost.content ?? "",
    created_at: rpcPost.created_at ?? new Date().toISOString(),
    image_url: rpcPost.image_url ?? "",
    avatar_url: rpcPost.user_avatar_url ?? undefined,
    community_id: postMetadata?.community_id != null ? Number(postMetadata.community_id) : undefined,
    community_name: postMetadata?.communities?.name ?? undefined,
    community_avatar_url: undefined,
    like_count: rpcPost.like_count ?? 0,
    comment_count: rpcPost.comment_count ?? 0,
    };
  });
};

const fetchJoinedCommunityIds = async (userId: string): Promise<Set<number>> => {
  const { data, error } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const joined = new Set<number>();
  (data ?? []).forEach((row) => {
    if (row.community_id !== null && row.community_id !== undefined) {
      joined.add(Number(row.community_id));
    }
  });

  return joined;
};

const fetchOwnedCommunityIds = async (userId: string): Promise<Set<number>> => {
  const { data, error } = await supabase
    .from("communities")
    .select("id")
    .eq("created_by", userId);

  if (error) throw new Error(error.message);

  const owned = new Set<number>();
  (data ?? []).forEach((row) => {
    if (row.id !== null && row.id !== undefined) {
      owned.add(Number(row.id));
    }
  });

  return owned;
};

export const PostList = ({ mode = "discover", userId }: Props) => {
  const { data, error, isLoading } = useQuery<Post[], Error>({
    queryKey: ["posts"],
    queryFn: fetchPosts,
  });

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

  const accessibleCommunityIds = new Set<number>();
  joinedIds.forEach((id) => accessibleCommunityIds.add(id));
  ownedIds.forEach((id) => accessibleCommunityIds.add(id));

  const filteredPosts = (data ?? []).filter((post) => {
    const communityId = post.community_id != null ? Number(post.community_id) : null;

    if (mode === "for_you") {
      if (!userId) return false;
      if (communityId == null) return false;
      return accessibleCommunityIds.has(communityId);
    }

    if (communityId == null) return true;
    if (!userId) return true;
    return !accessibleCommunityIds.has(communityId);
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading discussions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        Unable to load posts. Please try again.
      </div>
    );
  }

  if (!filteredPosts.length) {
    if (mode === "for_you") {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Your feed is quiet</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Join a few communities to start seeing posts here.
          </p>
          <Link
            to="/communities"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
          >
            Browse communities
          </Link>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Nothing to discover yet</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Check back soon or join a few communities to personalize this feed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredPosts.map((post) => (
        <PostItem post={post} key={post.id} />
      ))}
    </div>
  );
};
