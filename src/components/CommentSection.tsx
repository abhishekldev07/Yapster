import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase-client";
import { CommentItem } from "./CommentItem";

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

export interface Comment {
  id: number;
  post_id: number;
  parent_comment_id: number | null;
  content: string;
  user_id: string;
  created_at: string;
  author: string;
}

const createComment = async (
  newComment: NewComment,
  postId: number,
  userId?: string,
  author?: string
) => {
  if (!userId || !author) {
    throw new Error("You must be logged in to comment.");
  }

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    content: newComment.content,
    parent_comment_id: newComment.parent_comment_id || null,
    user_id: userId,
    author: author,
  });

  if (error) throw new Error(error.message);
};

const fetchComments = async (postId: number): Promise<Comment[]> => {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data as Comment[];
};

const fetchUserMembershipStatus = async (communityId: number, userId: string): Promise<MembershipStatus | null> => {
  const { data, error } = await supabase
    .from("community_members")
    .select("role, muted, banned")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as MembershipStatus | null;
};

export const CommentSection = ({ postId, communityId }: Props) => {
  const [newCommentText, setNewCommentText] = useState<string>("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: comments,
    isLoading,
    error,
  } = useQuery<Comment[], Error>({
    queryKey: ["comments", postId],
    queryFn: () => fetchComments(postId),
    refetchInterval: 5000,
  });

  const { data: membershipStatus } = useQuery<MembershipStatus | null, Error>({
    queryKey: ["membership-status-comment", communityId, user?.id],
    queryFn: () => (user && communityId ? fetchUserMembershipStatus(communityId, user.id) : Promise.resolve(null)),
    enabled: !!user && !!communityId,
    retry: false,
  });

  const { mutate, isPending, isError } = useMutation({
    mutationFn: (newComment: NewComment) =>
      createComment(
        newComment,
        postId,
        user?.id,
        user?.user_metadata?.user_name
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText) return;
    mutate({ content: newCommentText, parent_comment_id: null });
    setNewCommentText("");
  };

  const isBanned = membershipStatus?.banned || false;
  const isMuted = membershipStatus?.muted || false;
  const canComment = !isBanned && !isMuted;

  /* Map of Comments - Organize Replies - Return Tree  */
  const buildCommentTree = (
    flatComments: Comment[]
  ): (Comment & { children?: Comment[] })[] => {
    const map = new Map<number, Comment & { children?: Comment[] }>();
    const roots: (Comment & { children?: Comment[] })[] = [];

    flatComments.forEach((comment) => {
      map.set(comment.id, { ...comment, children: [] });
    });

    flatComments.forEach((comment) => {
      if (comment.parent_comment_id) {
        const parent = map.get(comment.parent_comment_id);
        if (parent) {
          parent.children!.push(map.get(comment.id)!);
        }
      } else {
        roots.push(map.get(comment.id)!);
      }
    });

    return roots;
  };

  if (isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading comments...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Comments are unavailable right now.</div>;
  }

  const commentTree = comments ? buildCommentTree(comments) : [];

  return (
    <div className="mt-1">
      <h3 className="mb-4 text-xl font-semibold text-slate-900">Comments</h3>
      {/* Create Comment Section */}
      {user ? (
        <>
          {/* Banned/Muted Status Warning */}
          {communityId && (isBanned || isMuted) && (
            <div className={`rounded-xl border p-4 mb-4 ${
              isBanned
                ? "border-red-200 bg-red-50"
                : "border-yellow-200 bg-yellow-50"
            }`}>
              <p className={`text-sm font-medium ${
                isBanned
                  ? "text-red-800"
                  : "text-yellow-800"
              }`}>
                {isBanned
                  ? "❌ You are banned from this community. You cannot comment here."
                  : "⚠️ You are muted in this community. You cannot post or comment here."}
              </p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="mb-4">
            <textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              disabled={!canComment}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={canComment ? "Write a comment..." : "You cannot comment at this time"}
              rows={3}
            />
            <button
              type="submit"
              disabled={isPending || !canComment}
              className="mt-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Posting..." : "Post Comment"}
            </button>
            {isError && (
              <p className="text-red-500 mt-2">Error posting comment.</p>
            )}
          </form>
        </>
      ) : (
        <p className="mb-4 text-gray-600">
          You must be logged in to post a comment.
        </p>
      )}

      {/* Comments Display Section */}
      <div className="space-y-4">
        {commentTree.map((comment, key) => (
          <CommentItem key={key} comment={comment} postId={postId} />
        ))}
      </div>
    </div>
  );
};
