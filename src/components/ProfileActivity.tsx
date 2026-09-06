import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { fetchPosts, Post } from "./PostList";
import { PostItem } from "./PostItem";
import { supabase } from "../supabase-client";
import { formatRelativeTime } from "../lib/notifications";

interface Props {
  profileId: string;
}

interface CommentActivity {
  id: number;
  post_id: number;
  content: string;
  created_at: string;
}

interface CommentPostSummary {
  id: number;
  title: string;
  community_id: number | null;
  community_name: string | null;
}

export const ProfileActivity = ({ profileId }: Props) => {
  const [tab, setTab] = useState<"posts" | "comments">("posts");

  const postsQuery = useQuery<Post[], Error>({
    queryKey: ["profile-posts", profileId],
    queryFn: async () => {
      const posts = await fetchPosts();
      return posts.filter((post) => post.user_id === profileId);
    },
    staleTime: 20_000,
  });

  const commentsQuery = useQuery<CommentActivity[], Error>({
    queryKey: ["profile-comments", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, post_id, content, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as CommentActivity[];
    },
    staleTime: 20_000,
  });

  const postIds = Array.from(new Set((commentsQuery.data ?? []).map((comment) => comment.post_id)));
  const commentPostsQuery = useQuery<Map<number, CommentPostSummary>, Error>({
    queryKey: ["profile-comment-posts", postIds.join(",")],
    queryFn: async () => {
      if (!postIds.length) return new Map();
      const { data, error } = await supabase
        .from("posts")
        .select("id, title, community_id, communities(name)")
        .in("id", postIds);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((post: any) => [Number(post.id), {
        id: Number(post.id),
        title: post.title || `Post #${post.id}`,
        community_id: post.community_id != null ? Number(post.community_id) : null,
        community_name: post.communities?.name ?? null,
      }]));
    },
    enabled: postIds.length > 0,
    staleTime: 30_000,
  });

  const posts = postsQuery.data ?? [];
  const comments = commentsQuery.data ?? [];
  const loading = tab === "posts" ? postsQuery.isLoading : commentsQuery.isLoading;
  const error = tab === "posts" ? postsQuery.error : commentsQuery.error;

  return (
    <section className="mt-5 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-violet-600">Activity</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Public contributions</h2>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button type="button" onClick={() => setTab("posts")} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${tab === "posts" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}>Posts · {posts.length}</button>
          <button type="button" onClick={() => setTab("comments")} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${tab === "comments" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}>Comments · {comments.length}</button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="space-y-3">{[0, 1].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">Activity could not be loaded.</div>
        ) : tab === "posts" ? (
          posts.length ? <div className="space-y-4">{posts.map((post) => <PostItem key={post.id} post={post} />)}</div> : <div className="py-10 text-center"><p className="font-extrabold text-slate-800">No posts yet</p><p className="mt-1 text-sm text-slate-400">Published posts will appear here.</p></div>
        ) : comments.length ? (
          <div className="space-y-3">
            {comments.map((comment) => {
              const post = commentPostsQuery.data?.get(comment.post_id);
              return (
                <article key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>{formatRelativeTime(comment.created_at)}</span>
                    {post?.community_name && <><span>·</span><span>{post.community_name}</span></>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</p>
                  <Link to={`/post/${comment.post_id}?comment=${comment.id}`} className="mt-3 inline-flex text-xs font-extrabold text-violet-700 hover:text-violet-800">{post?.title ? `View: ${post.title}` : "View discussion"} →</Link>
                </article>
              );
            })}
          </div>
        ) : <div className="py-10 text-center"><p className="font-extrabold text-slate-800">No comments yet</p><p className="mt-1 text-sm text-slate-400">Public comments will appear here.</p></div>}
      </div>
    </section>
  );
};
