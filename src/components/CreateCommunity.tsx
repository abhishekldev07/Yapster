import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { getFriendlyErrorMessage } from "../lib/auth";

interface CommunityInput {
  name: string;
  description: string;
}

const createCommunity = async (community: CommunityInput, userId: string) => {
  const payload = {
    name: community.name,
    description: community.description,
    created_by: userId,
  };

  const { data: createdCommunity, error: createError } = await supabase
    .from("communities")
    .insert(payload)
    .select("id")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  // Do NOT insert community creator into community_members
  // The creator is the owner/admin, not a regular member
  return createdCommunity;
};

export const CreateCommunity = () => {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { mutate, isPending, isError, error: mutationError } = useMutation({
    mutationFn: (input: CommunityInput) => {
      if (!user) throw new Error("You must be signed in to create a community.");
      return createCommunity(input, user.id);
    },
    onSuccess: (createdCommunity) => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      navigate(`/community/${createdCommunity.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    mutate({ name, description });
  };

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create a community</h1>
      <p className="mt-2 text-sm text-slate-600">
        Build a space for your topic, interest, or local discussion.
      </p>

      {!user ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You must be signed in to create a community.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">
              Community Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              rows={4}
            />
          </div>

          <button
            type="submit"
            disabled={!user || isPending}
            className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Creating..." : "CREATE COMMUNITY"}
          </button>

          {isError && <p className="text-sm text-red-600">{getFriendlyErrorMessage(mutationError, "Unable to create community. Please try again.")}</p>}
        </form>
      )}
    </div>
  );
};
