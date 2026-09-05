import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { supabase } from "../supabase-client";
import { CommentItem } from "./CommentItem";
import { getFriendlyErrorMessage } from "../lib/auth";

interface Props {
  postId: number;
  communityId?: number | null;
}

interface NewComment {
  content: string;
  parent_comment_id?: number | null;
}

interface MembershipStatus {
  role: string;
  muted: boolean;
  banned: boolean;
}

interface CommentAccess {
  ownerId: string | null;
  membership: MembershipStatus | null;
}

interface CommentVoteRow {
  comment_id: number;
  vote: number;
}

export interface Comment {
  id: number;
  post_id: number;
  parent_comment_id: number | null;
  content: string;
  user_id: string;
  created_at: string;
  author: string;
}

type TreeComment = Comment & { children: TreeComment[] };
type CommentSort = "best" | "top" | "new";

const createComment = async (newComment: NewComment, postId: number, userId?: string, author?: string) => {
  if (!userId || !author) throw new Error("You must be logged in to comment.");
  const { error } = await supabase.from("comments").insert({ post_id: postId, content: newComment.content, parent_comment_id: newComment.parent_comment_id || null, user_id: userId, author });
  if (error) throw new Error(error.message);
};

const fetchComments = async (postId: number): Promise<Comment[]> => {
  const { data, error } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as Comment[];
};

const fetchCommentAccess = async (communityId: number, userId: string): Promise<CommentAccess> => {
  const [{ data: community, error: communityError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("communities").select("created_by").eq("id", communityId).maybeSingle(),
    supabase.from("community_members").select("role, muted, banned").eq("community_id", communityId).eq("user_id", userId).maybeSingle(),
  ]);
  if (communityError) throw new Error(communityError.message);
  if (membershipError) throw new Error(membershipError.message);
  return { ownerId: community?.created_by ?? null, membership: membership as MembershipStatus | null };
};

const fetchCommentVoteScores = async (commentIds: number[]): Promise<Map<number, number>> => {
  if (!commentIds.length) return new Map();
  const { data, error } = await supabase.from("comment_votes").select("comment_id, vote").in("comment_id", commentIds);
  if (error) throw new Error(error.message);
  const scores = new Map<number, number>();
  ((data ?? []) as CommentVoteRow[]).forEach((row) => scores.set(Number(row.comment_id), (scores.get(Number(row.comment_id)) ?? 0) + row.vote));
  return scores;
};

const buildCommentTree = (flatComments: Comment[]): TreeComment[] => {
  const map = new Map<number, TreeComment>();
  const roots: TreeComment[] = [];
  flatComments.forEach((comment) => map.set(comment.id, { ...comment, children: [] }));
  flatComments.forEach((comment) => {
    const current = map.get(comment.id)!;
    if (comment.parent_comment_id) {
      const parent = map.get(comment.parent_comment_id);
      if (parent) parent.children.push(current);
      else roots.push(current);
    } else roots.push(current);
  });
  return roots;
};

const sortCommentTree = (comments: TreeComment[], sort: CommentSort, scores: Map<number, number>): TreeComment[] => {
  const now = Date.now();
  const rank = (comment: TreeComment) => {
    const score = scores.get(comment.id) ?? 0;
    if (sort === "new") return new Date(comment.created_at).getTime();
    if (sort === "top") return score * 1_000_000 + new Date(comment.created_at).getTime() / 1e10;
    const ageHours = Math.max(0, (now - new Date(comment.created_at).getTime()) / 3_600_000);
    return (score * 2 + comment.children.length * 0.35 + 1) / Math.pow(ageHours + 2, 0.55);
  };
  return [...comments]
    .sort((a, b) => rank(b) - rank(a))
    .map((comment) => ({ ...comment, children: sortCommentTree(comment.children, sort, scores) }));
};

const DiscussionIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <path d="M20 11.5a7.7 7.7 0 0 1-8 7.5 8.8 8.8 0 0 1-3-.5L4 20l1.4-4A7.3 7.3 0 0 1 4 11.5 7.7 7.7 0 0 1 12 4a7.7 7.7 0 0 1 8 7.5Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CommentSection = ({ postId, communityId }: Props) => {
  const [newCommentText, setNewCommentText] = useState("");
  const [commentSort, setCommentSort] = useState<CommentSort>("best");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: comments, isLoading, error } = useQuery<Comment[], Error>({ queryKey: ["comments", postId], queryFn: () => fetchComments(postId), refetchInterval: 5000 });
  const commentIds = (comments ?? []).map((comment) => comment.id);
  const { data: voteScores = new Map<number, number>() } = useQuery<Map<number, number>, Error>({
    queryKey: ["comment-vote-scores", postId, commentIds.join(",")],
    queryFn: () => fetchCommentVoteScores(commentIds),
    enabled: commentIds.length > 0,
    staleTime: 10_000,
  });

  const { data: commentAccess } = useQuery<CommentAccess | null, Error>({
    queryKey: ["membership-status-comment", communityId, user?.id],
    queryFn: () => (user && communityId ? fetchCommentAccess(communityId, user.id) : Promise.resolve(null)),
    enabled: !!user && !!communityId,
    retry: false,
  });

  const membershipStatus = commentAccess?.membership;
  const isOwner = Boolean(user && commentAccess?.ownerId === user.id);
  const { mutate, isPending, error: mutationError } = useMutation({
    mutationFn: (newComment: NewComment) => createComment(newComment, postId, user?.id, user?.user_metadata?.user_name || user?.email?.split("@")[0]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["communityPost"] });
      queryClient.invalidateQueries({ queryKey: ["post-comment-count", postId] });
      setNewCommentText("");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCommentText.trim()) return;
    mutate({ content: newCommentText.trim(), parent_comment_id: null });
  };

  const isBanned = membershipStatus?.banned || false;
  const isMuted = membershipStatus?.muted || false;
  const canComment = isOwner || (Boolean(membershipStatus) && !isBanned && !isMuted);
  const commentError = mutationError ? isBanned ? "You're banned from this community and cannot comment." : isMuted ? "You're muted in this community and cannot comment right now." : getFriendlyErrorMessage(mutationError, "Join this community to comment.") : null;

  if (isLoading) {
    return <div className="space-y-3" aria-label="Loading comments">{[0, 1].map((item) => <div key={item} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4"><div className="flex gap-3"><div className="h-8 w-8 rounded-xl bg-slate-100" /><div className="flex-1"><div className="h-3 w-28 rounded bg-slate-100" /><div className="mt-3 h-3 w-full rounded bg-slate-100" /><div className="mt-2 h-3 w-3/4 rounded bg-slate-100" /></div></div></div>)}</div>;
  }

  if (error) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-500">Comments are unavailable right now.</div>;

  const commentTree = sortCommentTree(buildCommentTree(comments ?? []), commentSort, voteScores);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-700"><DiscussionIcon /></span>
          <div><h3 className="text-lg font-black text-slate-950">Discussion</h3><p className="text-xs font-medium text-slate-400">{comments?.length ?? 0} {(comments?.length ?? 0) === 1 ? "comment" : "comments"}</p></div>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {(["best", "top", "new"] as CommentSort[]).map((sort) => (
            <button key={sort} type="button" onClick={() => setCommentSort(sort)} aria-pressed={commentSort === sort} className={`rounded-lg px-2.5 py-1.5 text-xs font-extrabold capitalize transition ${commentSort === sort ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{sort}</button>
          ))}
        </div>
      </div>

      {user ? (
        <>
          {communityId && (isBanned || isMuted) && <div className={`mb-4 rounded-xl border p-4 ${isBanned ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><p className={`text-sm font-semibold ${isBanned ? "text-red-800" : "text-amber-800"}`}>{isBanned ? "You are banned from this community and cannot comment here." : "You are muted in this community and cannot post or comment here."}</p></div>}
          <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <textarea value={newCommentText} onChange={(event) => setNewCommentText(event.target.value)} disabled={!canComment} className="min-h-24 w-full resize-y rounded-xl border-0 bg-transparent px-1 py-1 text-sm leading-6 text-slate-800 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed disabled:opacity-50" placeholder={canComment ? "Add to the discussion..." : "Join this community to comment"} rows={3} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><p className="text-[11px] font-medium text-slate-400">Keep it relevant and constructive.</p><button type="submit" disabled={isPending || !canComment || !newCommentText.trim()} className="yapster-button yapster-button--primary min-h-9 px-3.5 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-45">{isPending ? "Posting..." : "Comment"}</button></div>
            {commentError && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-red-700"><span>{commentError}</span>{!isOwner && communityId && <Link to={`/community/${communityId}`} className="text-violet-700 hover:text-violet-800">Open community</Link>}</div>}
          </form>
        </>
      ) : (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-extrabold text-slate-800">Want to join the discussion?</p><p className="mt-1 text-xs text-slate-400">Sign in to comment, vote, and reply.</p></div><Link to="/login" className="yapster-button yapster-button--primary w-fit">Sign in</Link></div>
      )}

      {commentTree.length ? <div className="space-y-3">{commentTree.map((comment) => <CommentItem key={comment.id} comment={comment} postId={postId} />)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-7 text-center"><p className="text-sm font-extrabold text-slate-700">No comments yet</p><p className="mt-1 text-xs text-slate-400">Be the first person to move this conversation forward.</p></div>}
    </div>
  );
};
