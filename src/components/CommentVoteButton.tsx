import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

interface Props {
  commentId: number;
  postId: number;
}

interface CommentVote {
  id: number;
  user_id: string;
  vote: number;
}

const fetchVotes = async (commentId: number): Promise<CommentVote[]> => {
  const { data, error } = await supabase
    .from("comment_votes")
    .select("id, user_id, vote")
    .eq("comment_id", commentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as CommentVote[];
};

const Arrow = ({ direction }: { direction: "up" | "down" }) => (
  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]" aria-hidden="true">
    {direction === "up" ? (
      <path d="m5 11 5-5 5 5M10 6v8" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="m5 9 5 5 5-5M10 14V6" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

export const CommentVoteButton = ({ commentId, postId }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: votes = [], isLoading } = useQuery<CommentVote[], Error>({
    queryKey: ["comment-votes", commentId],
    queryFn: () => fetchVotes(commentId),
    staleTime: 15_000,
  });

  const mutation = useMutation({
    mutationFn: async (voteValue: 1 | -1) => {
      if (!user) throw new Error("Sign in to vote.");
      const existing = votes.find((vote) => vote.user_id === user.id);
      if (existing?.vote === voteValue) {
        const { error } = await supabase.from("comment_votes").delete().eq("id", existing.id);
        if (error) throw new Error(error.message);
        return;
      }
      if (existing) {
        const { error } = await supabase.from("comment_votes").update({ vote: voteValue }).eq("id", existing.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("comment_votes").insert({ comment_id: commentId, user_id: user.id, vote: voteValue });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comment-votes", commentId] });
      queryClient.invalidateQueries({ queryKey: ["comment-vote-scores", postId] });
    },
  });

  const score = votes.reduce((sum, vote) => sum + vote.vote, 0);
  const userVote = votes.find((vote) => vote.user_id === user?.id)?.vote;

  return (
    <div className="inline-flex h-7 items-center overflow-hidden rounded-full border border-slate-200 bg-white">
      <button type="button" onClick={() => mutation.mutate(1)} disabled={!user || isLoading || mutation.isPending} aria-label="Upvote comment" aria-pressed={userVote === 1} className={`grid h-full w-7 place-items-center transition ${userVote === 1 ? "bg-orange-50 text-orange-600" : "text-slate-400 hover:bg-orange-50 hover:text-orange-600"}`}>
        <Arrow direction="up" />
      </button>
      <span className={`min-w-6 text-center text-[11px] font-extrabold ${score > 0 ? "text-orange-600" : score < 0 ? "text-violet-700" : "text-slate-500"}`}>{score}</span>
      <button type="button" onClick={() => mutation.mutate(-1)} disabled={!user || isLoading || mutation.isPending} aria-label="Downvote comment" aria-pressed={userVote === -1} className={`grid h-full w-7 place-items-center transition ${userVote === -1 ? "bg-violet-50 text-violet-700" : "text-slate-400 hover:bg-violet-50 hover:text-violet-700"}`}>
        <Arrow direction="down" />
      </button>
    </div>
  );
};
