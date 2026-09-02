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
    // Liked -> 0, Like -> -1
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

export const LikeButton = ({ postId }: Props) => {
  const { user } = useAuth();

  const queryClient = useQueryClient();

  const {
    data: votes,
    isLoading,
    error,
  } = useQuery<Vote[], Error>({
    queryKey: ["votes", postId],
    queryFn: () => fetchVotes(postId),
    refetchInterval: 5000,
  });

  const { mutate, error: mutationError } = useMutation({
    mutationFn: (voteValue: number) => {
      if (!user) throw new Error("You must be logged in to Vote!");
      return vote(voteValue, postId, user.id);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votes", postId] });
    },
  });

  if (isLoading) {
    return <div> Loading votes...</div>;
  }

  if (error) {
    return <div className="text-sm text-slate-500">Votes are unavailable right now.</div>;
  }

  const likes = votes?.filter((v) => v.vote === 1).length || 0;
  const dislikes = votes?.filter((v) => v.vote === -1).length || 0;
  const userVote = votes?.find((v) => v.user_id === user?.id)?.vote;

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <button
        type="button"
        onClick={() => mutate(1)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          userVote === 1
            ? "border-emerald-200 bg-emerald-700 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900"
        }`}
      >
        <span aria-hidden="true">▲</span>
        <span>{likes}</span>
      </button>
      <button
        type="button"
        onClick={() => mutate(-1)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          userVote === -1
            ? "border-rose-200 bg-rose-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900"
        }`}
      >
        <span aria-hidden="true">▼</span>
        <span>{dislikes}</span>
      </button>
      {mutationError && <span role="alert" className="text-xs text-red-700">Vote could not be saved.</span>}
    </div>
  );
};
