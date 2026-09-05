import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { getFriendlyErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";
import { Comment } from "./CommentSection";
import { CommentVoteButton } from "./CommentVoteButton";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReportDialog } from "./ReportDialog";

interface Props {
  comment: Comment & { children?: Comment[] };
  postId: number;
  communityId?: number | null;
  targetCommentId?: number | null;
}

const createReply = async (content: string, postId: number, parentCommentId: number, userId?: string, author?: string) => {
  if (!userId || !author) throw new Error("You must be logged in to reply.");
  const { error } = await supabase.from("comments").insert({ post_id: postId, content, parent_comment_id: parentCommentId, user_id: userId, author });
  if (error) throw new Error(error.message);
};

const ReplyIcon = () => <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M8 6 4 10l4 4M4.5 10H12c2.3 0 4 1.2 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const EditIcon = () => <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="m4 14.5-.5 2 2-.5L15 6.5 13.5 5 4 14.5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const DeleteIcon = () => <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M5.5 6.5h9M8 4.5h4M7 6.5l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const FlagIcon = () => <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M5.5 17V4m0 1h7.8l-1.2 2.5L13.3 10H5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export const CommentItem = ({ comment, postId, communityId, targetCommentId }: Props) => {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwnComment = Boolean(user && user.id === comment.user_id);
  const isTarget = targetCommentId === comment.id;

  const { data: postCommunityId = null } = useQuery<number | null, Error>({
    queryKey: ["comment-post-community", postId],
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select("community_id").eq("id", postId).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.community_id != null ? Number(data.community_id) : null;
    },
    enabled: !communityId,
    staleTime: 5 * 60 * 1000,
  });
  const resolvedCommunityId = communityId ?? postCommunityId;

  const invalidateCommentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["comments", postId] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["communityPost"] });
    queryClient.invalidateQueries({ queryKey: ["post-comment-count", postId] });
  };

  const replyMutation = useMutation({
    mutationFn: (content: string) => createReply(content, postId, comment.id, user?.id, user?.user_metadata?.user_name || user?.email?.split("@")[0]),
    onSuccess: () => { invalidateCommentQueries(); setReplyText(""); setShowReply(false); },
  });

  const editMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error("You must be logged in to edit a comment.");
      const { error } = await supabase.from("comments").update({ content }).eq("id", comment.id).eq("user_id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setIsEditing(false); invalidateCommentQueries(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You must be logged in to delete a comment.");
      const { error } = await supabase.from("comments").delete().eq("id", comment.id).eq("user_id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setDeleteDialogOpen(false); invalidateCommentQueries(); },
  });

  const replyCount = comment.children?.length ?? 0;
  const formattedDate = new Date(comment.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const actionError = replyMutation.error || editMutation.error || deleteMutation.error;
  const deleteDescription = replyCount > 0
    ? `This will delete your comment and its ${replyCount} ${replyCount === 1 ? "reply" : "replies"}. This cannot be undone.`
    : "This comment will be permanently removed. This cannot be undone.";

  return (
    <>
      <div id={`comment-${comment.id}`} className={`relative scroll-mt-28 border-l pl-3 transition sm:pl-4 ${isTarget ? "border-violet-400" : "border-slate-200"}`}>
        <div className={`rounded-[15px] border bg-white p-3.5 shadow-[0_1px_2px_rgba(15,15,25,0.025)] transition sm:p-4 ${isTarget ? "border-violet-400 ring-4 ring-violet-100/70" : "border-slate-200"}`}>
          {isTarget && <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-violet-600">Opened from notification</p>}
          <div className="flex items-start gap-3">
            <Link to={`/profile/${encodeURIComponent(comment.author)}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-[11px] font-black text-violet-800 ring-1 ring-black/5" aria-label={`Open ${comment.author}'s profile`}>
              {comment.author.slice(0, 1).toUpperCase()}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link to={`/profile/${encodeURIComponent(comment.author)}`} className="text-sm font-extrabold text-slate-900 transition hover:text-violet-700">{comment.author}</Link>
                <span className="text-[11px] font-medium text-slate-400">{formattedDate}</span>
                {isOwnComment && <span className="text-[10px] font-extrabold uppercase tracking-wide text-violet-500">You</span>}
              </div>

              {isEditing ? (
                <form onSubmit={(event) => { event.preventDefault(); const next = editText.trim(); if (!next || next === comment.content) { if (next === comment.content) setIsEditing(false); return; } editMutation.mutate(next); }} className="mt-3">
                  <textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={3} autoFocus className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal leading-6 text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60" />
                  <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => { setEditText(comment.content); setIsEditing(false); }} className="rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-500 hover:bg-slate-100">Cancel</button><button type="submit" disabled={editMutation.isPending || !editText.trim()} className="yapster-button yapster-button--primary min-h-8 px-3 py-0 text-xs disabled:opacity-45">{editMutation.isPending ? "Saving..." : "Save edit"}</button></div>
                </form>
              ) : <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-650">{comment.content}</p>}

              {!isEditing && <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <CommentVoteButton commentId={comment.id} postId={postId} />
                {user ? <button type="button" onClick={() => setShowReply((previous) => !previous)} className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-450 hover:text-violet-700"><ReplyIcon />{showReply ? "Cancel reply" : "Reply"}</button> : <Link to="/login" className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-450 hover:text-violet-700"><ReplyIcon />Sign in to reply</Link>}
                {isOwnComment ? <><button type="button" onClick={() => { setShowReply(false); setEditText(comment.content); setIsEditing(true); }} className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-450 hover:text-violet-700"><EditIcon />Edit</button><button type="button" onClick={() => setDeleteDialogOpen(true)} disabled={deleteMutation.isPending} className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-450 hover:text-red-600 disabled:opacity-50"><DeleteIcon />Delete</button></> : user && resolvedCommunityId ? <button type="button" onClick={() => setReportDialogOpen(true)} className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-450 hover:text-red-600"><FlagIcon />Report</button> : null}
                {replyCount > 0 && <button type="button" onClick={() => setIsCollapsed((previous) => !previous)} className="inline-flex items-center gap-1 text-xs font-extrabold text-violet-700 hover:text-violet-800" aria-expanded={!isCollapsed}><span>{isCollapsed ? "▾" : "▴"}</span>{isCollapsed ? `Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Hide replies"}</button>}
              </div>}
              {actionError && <p className="mt-2 text-xs font-semibold text-red-700">{getFriendlyErrorMessage(actionError, "We could not update this comment. Please try again.")}</p>}
            </div>
          </div>
        </div>

        {showReply && user && !isEditing && <form onSubmit={(event) => { event.preventDefault(); if (replyText.trim()) replyMutation.mutate(replyText.trim()); }} className="mb-3 ml-3 mt-2 rounded-xl border border-violet-100 bg-violet-50/35 p-3 sm:ml-5"><textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} className="min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100/60" placeholder={`Reply to ${comment.author}...`} rows={2} /><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] font-medium text-slate-400">Use @username to mention someone.</span><div className="flex gap-2"><button type="button" onClick={() => { setShowReply(false); setReplyText(""); }} className="rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-500">Cancel</button><button type="submit" disabled={replyMutation.isPending || !replyText.trim()} className="yapster-button yapster-button--primary min-h-8 px-3 py-0 text-xs disabled:opacity-45">{replyMutation.isPending ? "Posting..." : "Post reply"}</button></div></div></form>}

        {comment.children && comment.children.length > 0 && !isCollapsed && <div className="mt-3 space-y-3">{comment.children.map((child) => <CommentItem key={child.id} comment={child} postId={postId} communityId={resolvedCommunityId} targetCommentId={targetCommentId} />)}</div>}
      </div>

      <ConfirmDialog open={deleteDialogOpen} title="Delete comment?" description={deleteDescription} confirmLabel={replyCount > 0 ? "Delete comment & replies" : "Delete comment"} isPending={deleteMutation.isPending} onCancel={() => setDeleteDialogOpen(false)} onConfirm={() => deleteMutation.mutate()} />
      {resolvedCommunityId && <ReportDialog open={reportDialogOpen} communityId={resolvedCommunityId} targetType="comment" targetId={comment.id} onClose={() => setReportDialogOpen(false)} />}
    </>
  );
};
