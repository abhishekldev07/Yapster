import { useState } from "react";
import { Link } from "react-router";
import { Comment } from "./CommentSection";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFriendlyErrorMessage } from "../lib/auth";

interface Props {
  comment: Comment & {
    children?: Comment[];
  };
  postId: number;
}

const createReply = async (
  replyContent: string,
  postId: number,
  parentCommentId: number,
  userId?: string,
  author?: string
) => {
  if (!userId || !author) {
    throw new Error("You must be logged in to reply.");
  }

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    content: replyContent,
    parent_comment_id: parentCommentId,
    user_id: userId,
    author,
  });

  if (error) throw new Error(error.message);
};

const ReplyIcon = () => (
  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <path d="M8 6 4 10l4 4M4.5 10H12c2.3 0 4 1.2 4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CommentItem = ({ comment, postId }: Props) => {
  const [showReply, setShowReply] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>("");
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { mutate, isPending, error: mutationError } = useMutation({
    mutationFn: (replyContent: string) =>
      createReply(replyContent, postId, comment.id, user?.id, user?.user_metadata?.user_name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["communityPost"] });
      queryClient.invalidateQueries({ queryKey: ["post-comment-count", postId] });
      setReplyText("");
      setShowReply(false);
    },
  });

  const handleReplySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!replyText.trim()) return;
    mutate(replyText.trim());
  };

  const replyCount = comment.children?.length ?? 0;
  const formattedDate = new Date(comment.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="relative border-l border-slate-200 pl-3 sm:pl-4">
      <div className="rounded-[15px] border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,15,25,0.025)] sm:p-4">
        <div className="flex items-start gap-3">
          <Link
            to={`/profile/${encodeURIComponent(comment.author)}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-[11px] font-black text-violet-800 ring-1 ring-black/5"
            aria-label={`Open ${comment.author}'s profile`}
          >
            {comment.author.slice(0, 1).toUpperCase()}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                to={`/profile/${encodeURIComponent(comment.author)}`}
                className="text-sm font-extrabold text-slate-900 transition hover:text-violet-700"
              >
                {comment.author}
              </Link>
              <span className="text-[11px] font-medium text-slate-400">{formattedDate}</span>
            </div>

            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-650">
              {comment.content}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              {user ? (
                <button
                  type="button"
                  onClick={() => setShowReply((previous) => !previous)}
                  className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-450 transition hover:text-violet-700"
                >
                  <ReplyIcon />
                  {showReply ? "Cancel reply" : "Reply"}
                </button>
              ) : (
                <Link to="/login" className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-450 transition hover:text-violet-700">
                  <ReplyIcon />
                  Sign in to reply
                </Link>
              )}

              {replyCount > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed((previous) => !previous)}
                  className="inline-flex items-center gap-1 text-xs font-extrabold text-violet-700 transition hover:text-violet-800"
                  aria-expanded={!isCollapsed}
                >
                  <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 fill-none stroke-current stroke-2 transition ${isCollapsed ? "rotate-0" : "rotate-180"}`} aria-hidden="true">
                    <path d="m5.5 7.5 4.5 4.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {isCollapsed ? `Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Hide replies"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showReply && user && (
        <form onSubmit={handleReplySubmit} className="mb-3 ml-3 mt-2 rounded-xl border border-violet-100 bg-violet-50/35 p-3 sm:ml-5">
          <textarea
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            className="min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white p-2.5 text-sm leading-6 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100/60"
            placeholder={`Reply to ${comment.author}...`}
            rows={2}
          />
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowReply(false);
                setReplyText("");
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-500 transition hover:bg-white hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !replyText.trim()}
              className="yapster-button yapster-button--primary min-h-8 px-3 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isPending ? "Posting..." : "Post reply"}
            </button>
          </div>
          {mutationError && (
            <p className="mt-2 text-xs font-semibold text-red-700">
              {getFriendlyErrorMessage(mutationError, "Join this community to reply.")}
            </p>
          )}
        </form>
      )}

      {comment.children && comment.children.length > 0 && !isCollapsed && (
        <div className="mt-3 space-y-3">
          {comment.children.map((child) => (
            <CommentItem key={child.id} comment={child} postId={postId} />
          ))}
        </div>
      )}
    </div>
  );
};
