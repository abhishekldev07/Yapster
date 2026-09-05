import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

interface Props {
  postId: number;
  compact?: boolean;
}

const SaveIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current stroke-[1.8]" fill={filled ? "currentColor" : "none"} aria-hidden="true">
    <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const fetchSaved = async (postId: number, userId: string) => {
  const { data, error } = await supabase
    .from("saved_posts")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
};

export const SaveButton = ({ postId, compact = false }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: isSaved = false, isLoading } = useQuery({
    queryKey: ["saved-post", user?.id, postId],
    queryFn: () => (user ? fetchSaved(postId, user.id) : Promise.resolve(false)),
    enabled: !!user,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save posts.");

      if (isSaved) {
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("user_id", user.id)
          .eq("post_id", postId);
        if (error) throw new Error(error.message);
        return false;
      }

      const { error } = await supabase
        .from("saved_posts")
        .insert({ user_id: user.id, post_id: postId });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["saved-post", user?.id, postId], saved);
      queryClient.invalidateQueries({ queryKey: ["saved-posts", user?.id] });
    },
  });

  const label = !user ? "Sign in to save" : isSaved ? "Saved" : "Save";

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={!user || isLoading || mutation.isPending}
      title={!user ? "Sign in to save posts" : isSaved ? "Remove from saved" : "Save post"}
      aria-pressed={isSaved}
      className={`yapster-post-action ${compact ? "" : "ml-auto"} ${!user ? "cursor-not-allowed opacity-45" : ""}`}
    >
      <SaveIcon filled={isSaved} />
      <span className={compact ? "" : "hidden sm:inline"}>{mutation.isPending ? "..." : label}</span>
    </button>
  );
};
