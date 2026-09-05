import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase-client";
import { useAuth } from "../context/AuthContext";

interface Props {
  postId: number;
}

interface Vote {
  id: number;
  post_id: number;
  user_id: string;
  vote: number;
}

const vote = async (voteValue: number, postId: number, userId: string) => {
  const { data: existingVote } = await supabase
    .from("votes")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingVote) {
    if (existingVote.vote === voteValue) {
      const { error } = await supabase
        .from("votes")
        .delete()
        .eq("id", existingVote.id);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("votes")
        .update({ vote: voteValue })
        .eq("id", existingVote.id);

      if (error) throw new Error(error.message);
    }
  } else {
    const { error } = await supabase
      .from("votes")
      .insert({ post_id: postId, user_id: userId, vote: voteValue });
    if (error) throw new Error(error.message);
  }
};

const fetchVotes = async (postId: number): Promise<Vote[]> => {
  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("post_id", postId);

  if (error) throw new Error(error.message);
  return data as Vote[];
};

const Arrow = ({ direction }: { direction: "up" | "down" }) => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[2]" aria-hidden="true">
    {direction === "up" ? (
      <path d="m4.5 11 5.5-5.5 5.5 5.5M10 5.5v9" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="m4.5 9 5.5 5.5L15.5 9M10 14.5v-9" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

export const LikeButton = ({ postId }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: votes, isLoading, error } = useQuery<Vote[], Error>({
    queryKey: ["votes", postId],
    queryFn: () => fetchVotes(postId),
    refetchInterval: 5000,
  });

  const { mutate, error: mutationError, isPending } = useMutation({
    mutationFn: (voteValue: number) => {
      if (!user) throw new Error("You must be logged in to vote.");
      return vote(voteValue, postId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votes", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["communityPost"] });
    },
  });

  if (isLoading) {
    return <div className="h-[34px] w-[108px] animate-pulse rounded-full bg-slate-100" aria-label="Loading votes" />;
  }

  if (error) {
    return <div className="text-xs text-slate-400">Votes unavailable</div>;
  }

  const likes = votes?.filter((entry) => entry.vote === 1).length || 0;
  const dislikes = votes?.filter((entry) => entry.vote === -1).length || 0;
  const score = likes - dislikes;
  const userVote = votes?.find((entry) => entry.user_id === user?.id)?.vote;

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex h-[34px] items-center overflow-hidden rounded-full border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => mutate(1)}
          disabled={isPending}
          aria-label="Upvote"
          aria-pressed={userVote === 1}
          className={`grid h-full w-9 place-items-center border-0 transition ${
            userVote === 1
              ? "bg-orange-50 text-orange-600"
              : "bg-transparent text-slate-500 hover:bg-orange-50 hover:text-orange-600"
          }`}
        >
          <Arrow direction="up" />
        </button>
        <span className={`min-w-8 px-1 text-center text-xs font-extrabold ${score > 0 ? "text-orange-600" : score < 0 ? "text-violet-700" : "text-slate-600"}`}>
          {score}
        </span>
        <button
          type="button"
          onClick={() => mutate(-1)}
          disabled={isPending}
          aria-label="Downvote"
          aria-pressed={userVote === -1}
          className={`grid h-full w-9 place-items-center border-0 transition ${
            userVote === -1
              ? "bg-violet-50 text-violet-700"
              : "bg-transparent text-slate-500 hover:bg-violet-50 hover:text-violet-700"
          }`}
        >
          <Arrow direction="down" />
        </button>
      </div>
      {mutationError && (
        <span role="alert" className="text-xs font-semibold text-red-600">
          {user ? "Vote failed" : "Sign in to vote"}
        </span>
      )}
    </div>
  );
};
