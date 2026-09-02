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
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading post...</div>;
  }

  if (error || !data) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">This post could not be found.</div>;
  }

  return (
    <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {community ? (
            <Link to={`/community/${community.id}`} className="font-semibold text-emerald-700 hover:text-emerald-800">
              {community.name}
            </Link>
          ) : <span>Community</span>}
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-2">
            {data.avatar_url ? <img src={data.avatar_url} alt="Post author" className="h-6 w-6 rounded-full object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">M</span>}
            <span>Member</span>
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={data.created_at}>{new Date(data.created_at).toLocaleString()}</time>
        </div>

        <h1 className="mt-5 break-words text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">{data.title}</h1>
        <p className="mt-5 whitespace-pre-wrap break-words text-base leading-8 text-slate-700">{data.content}</p>
        {data.image_url && <img src={data.image_url} alt={data.title} loading="lazy" className="mt-6 max-h-[620px] w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" />}

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
          <LikeButton postId={postId} />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600"><span aria-hidden="true">💬</span>{commentCount}</span>
          <button type="button" onClick={() => void handleShare()} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800">Share</button>
          {shareState && <span role="status" className="text-sm font-medium text-emerald-700">{shareState}</span>}
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-5 sm:px-8">
        <CommentSection postId={postId} communityId={data.community_id} />
      </div>
    </article>
  );
};
