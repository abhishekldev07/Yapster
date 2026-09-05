import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Post } from "./PostList";
import { supabase } from "../supabase-client";
import { LikeButton } from "./LikeButton";
import { CommentSection } from "./CommentSection";

interface Props {
  postId: number;
}

interface PostWithCommunity extends Post {
  community_id?: number;
}

interface CommunitySummary {
  id: number;
  name: string;
}

const fetchPostById = async (id: number): Promise<PostWithCommunity> => {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as PostWithCommunity;
};

const CommentIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <path d="M20 11.5a7.7 7.7 0 0 1-8 7.5 8.8 8.8 0 0 1-3-.5L4 20l1.4-4A7.3 7.3 0 0 1 4 11.5 7.7 7.7 0 0 1 12 4a7.7 7.7 0 0 1 8 7.5Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <path d="M8 12 16.5 5M12.5 5h4v4M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PostDetail = ({ postId }: Props) => {
  const [shareState, setShareState] = useState<string | null>(null);
  const { data, error, isLoading } = useQuery<PostWithCommunity, Error>({
    queryKey: ["post", postId],
    queryFn: () => fetchPostById(postId),
  });

  const { data: community } = useQuery<CommunitySummary | null, Error>({
    queryKey: ["post-community", data?.community_id],
    enabled: !!data?.community_id,
    queryFn: async () => {
      const { data: communityData, error: communityError } = await supabase
        .from("communities")
        .select("id, name")
        .eq("id", data!.community_id!)
        .maybeSingle();
      if (communityError) throw new Error(communityError.message);
      return communityData as CommunitySummary | null;
    },
  });

  const { data: commentCount = 0 } = useQuery<number, Error>({
    queryKey: ["post-comment-count", postId],
    queryFn: async () => {
      const { count, error: commentsError } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (commentsError) throw new Error(commentsError.message);
      return count ?? 0;
    },
  });

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShareState("Link copied");
      window.setTimeout(() => setShareState(null), 2200);
    } catch {
      setShareState(null);
    }
  };

  if (isLoading) {
    return (
      <div className="yapster-card animate-pulse p-6 sm:p-8">
        <div className="h-3 w-40 rounded bg-slate-100" />
        <div className="mt-5 h-9 w-4/5 rounded bg-slate-100" />
        <div className="mt-5 h-3 w-full rounded bg-slate-100" />
        <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
        <div className="mt-6 h-64 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="yapster-card p-9 text-center">
        <img src="/yapster-mark.svg" alt="" className="mx-auto h-11 w-11" />
        <h1 className="mt-4 text-xl font-black text-slate-950">Post unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">This post could not be found or is no longer available.</p>
        <Link to="/" className="yapster-button yapster-button--primary mt-5">Back to feed</Link>
      </div>
    );
  }

  const formattedDate = new Date(data.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />

      <div className="p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to={community ? `/community/${community.id}` : "/communities"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-black text-violet-800 ring-1 ring-black/5"
            >
              {(community?.name || "C").slice(0, 1).toUpperCase()}
            </Link>
            <div className="min-w-0">
              {community ? (
                <Link to={`/community/${community.id}`} className="block truncate text-sm font-extrabold text-slate-900 transition hover:text-violet-700">
                  {community.name}
                </Link>
              ) : (
                <span className="block text-sm font-extrabold text-slate-900">Community</span>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                <span>Posted by a member</span>
                <span aria-hidden="true">•</span>
                <time dateTime={data.created_at}>{formattedDate}</time>
              </div>
            </div>
          </div>

          <button type="button" aria-label="More post options" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            ⋯
          </button>
        </div>

        <h1 className="mt-6 break-words text-3xl font-black leading-[1.16] tracking-[-0.045em] text-slate-950 sm:text-4xl">
          {data.title}
        </h1>

        <p className="mt-5 whitespace-pre-wrap break-words text-[0.98rem] leading-8 text-slate-650 sm:text-base">
          {data.content}
        </p>

        {data.image_url && (
          <div className="mt-6 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
            <img
              src={data.image_url}
              alt={data.title}
              loading="lazy"
              className="max-h-[680px] w-full object-contain"
            />
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <LikeButton postId={postId} />
          <span className="yapster-post-action">
            <CommentIcon />
            <span>{commentCount}</span>
            <span className="hidden sm:inline">comments</span>
          </span>
          <button type="button" onClick={() => void handleShare()} className="yapster-post-action">
            <ShareIcon />
            Share
          </button>
          {shareState && (
            <span role="status" className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-extrabold text-violet-700">
              {shareState}
            </span>
          )}
        </div>
      </div>

      <section className="border-t border-slate-100 bg-slate-50/60 px-4 py-5 sm:px-8 sm:py-7" aria-label="Post comments">
        <CommentSection postId={postId} communityId={data.community_id} />
      </section>
    </article>
  );
};
