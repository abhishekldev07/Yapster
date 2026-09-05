import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

interface Props {
  postId: number;
}

interface PollOption {
  id: number;
  option_text: string;
  position: number;
}

interface PollVote {
  option_id: number;
  user_id: string;
}

const fetchOptions = async (postId: number): Promise<PollOption[]> => {
  const { data, error } = await supabase
    .from("poll_options")
    .select("id, option_text, position")
    .eq("post_id", postId)
    .order("position")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as PollOption[];
};

const fetchVotes = async (postId: number): Promise<PollVote[]> => {
  const { data, error } = await supabase
    .from("poll_votes")
    .select("option_id, user_id")
    .eq("post_id", postId);
  if (error) throw new Error(error.message);
  return (data ?? []) as PollVote[];
};

export const PollCard = ({ postId }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: options = [], isLoading: optionsLoading } = useQuery<PollOption[], Error>({
    queryKey: ["poll-options", postId],
    queryFn: () => fetchOptions(postId),
  });
  const { data: votes = [], isLoading: votesLoading } = useQuery<PollVote[], Error>({
    queryKey: ["poll-votes", postId],
    queryFn: () => fetchVotes(postId),
    refetchInterval: 10_000,
  });

  const selectedOptionId = votes.find((vote) => vote.user_id === user?.id)?.option_id ?? null;
  const totalVotes = votes.length;

  const mutation = useMutation({
    mutationFn: async (optionId: number) => {
      if (!user) throw new Error("Sign in to vote.");
      if (selectedOptionId === optionId) {
        const { error } = await supabase.from("poll_votes").delete().eq("post_id", postId).eq("user_id", user.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("poll_votes").upsert(
        { post_id: postId, option_id: optionId, user_id: user.id },
        { onConflict: "post_id,user_id" }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["poll-votes", postId] }),
  });

  if (optionsLoading || votesLoading) {
    return <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">{[0, 1, 2].map((item) => <div key={item} className="h-10 animate-pulse rounded-xl bg-slate-100" />)}</div>;
  }

  if (!options.length) return null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 sm:p-4">
      <div className="space-y-2">
        {options.map((option) => {
          const optionVotes = votes.filter((vote) => Number(vote.option_id) === Number(option.id)).length;
          const percentage = totalVotes ? Math.round((optionVotes / totalVotes) * 100) : 0;
          const selected = Number(selectedOptionId) === Number(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={!user || mutation.isPending}
              onClick={() => mutation.mutate(option.id)}
              aria-pressed={selected}
              className={`relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition ${selected ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-200"} ${!user ? "cursor-not-allowed" : ""}`}
            >
              <span className="absolute inset-y-0 left-0 bg-violet-100/70 transition-[width] duration-300" style={{ width: `${percentage}%` }} />
              <span className="relative flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-extrabold text-slate-800">{option.option_text}</span>
                <span className={`shrink-0 text-xs font-black ${selected ? "text-violet-700" : "text-slate-500"}`}>{percentage}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-400">
        <span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
        <span>{user ? (selectedOptionId ? "Tap your choice again to remove your vote" : "Choose one option") : "Sign in to vote"}</span>
      </div>
    </div>
  );
};
