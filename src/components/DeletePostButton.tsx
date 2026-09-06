import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "../supabase-client";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  postId: number;
  imageUrl?: string | null;
  onDeleted?: () => void;
  className?: string;
}

const getPostImagePath = (url?: string | null) => {
  if (!url) return null;
  const marker = "/storage/v1/object/public/post-images/";
  const index = url.indexOf(marker);
  return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : null;
};

export const DeletePostButton = ({ postId, imageUrl, onDeleted, className = "" }: Props) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in to delete a post.");
      const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", user.id);
      if (error) throw new Error(error.message);
      const path = getPostImagePath(imageUrl);
      if (path) void supabase.storage.from("post-images").remove([path]);
    },
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["communityPost"] }),
        queryClient.invalidateQueries({ queryKey: ["profile-activity"] }),
        queryClient.invalidateQueries({ queryKey: ["saved-posts"] }),
      ]);
      onDeleted?.();
    },
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={mutation.isPending} className={className || "text-xs font-extrabold text-red-600 hover:text-red-700 disabled:opacity-50"}>
        {mutation.isPending ? "Deleting..." : "Delete post"}
      </button>
      <ConfirmDialog open={open} title="Delete this post?" description="The post, its comments, votes, poll data, saves, and related notifications will be permanently removed. This cannot be undone." confirmLabel="Delete post" isPending={mutation.isPending} onCancel={() => setOpen(false)} onConfirm={() => mutation.mutate()} />
      {mutation.error && <p className="mt-2 text-xs font-semibold text-red-600">{mutation.error.message}</p>}
    </>
  );
};
