import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
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

  if (createError) throw new Error(createError.message);

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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !name.trim()) return;
    mutate({ name: name.trim(), description: description.trim() });
  };

  const fieldClassName = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60";
  const previewName = name.trim() || "Your community";
  const previewDescription = description.trim() || "A clear description helps the right people understand why this community exists.";

  if (!user) {
    return (
      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
        <div className="p-7 text-center sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#101017]">
            <img src="/yapster-mark.svg" alt="" className="h-9 w-9" />
          </div>
          <h2 className="mt-5 text-2xl font-black tracking-[-0.035em] text-slate-950">Sign in to start a community</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Community creators become the initial admin and can manage members and moderators.
          </p>
          <Link to="/login" className="yapster-button yapster-button--primary mt-5">Sign in</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_270px]">
        <form onSubmit={handleSubmit} className="p-5 sm:p-7">
          <div>
            <h2 className="text-lg font-black text-slate-950">Community details</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Start with the essentials. You can manage the community after creation.</p>
          </div>

          <div className="mt-6 space-y-5">
            <label className="block text-sm font-extrabold text-slate-700" htmlFor="name">
              Community name
              <span className="ml-2 text-[11px] font-semibold text-slate-400">Required</span>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Web Developers Nepal"
                className={`${fieldClassName} mt-2`}
                maxLength={80}
                required
              />
              <span className="mt-1.5 block text-[11px] font-medium text-slate-400">Use a name people can understand at a glance.</span>
            </label>

            <label className="block text-sm font-extrabold text-slate-700" htmlFor="description">
              Description
              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What should people discuss here, and who is this community for?"
                className={`${fieldClassName} mt-2 min-h-32 resize-y leading-6`}
                rows={5}
                maxLength={500}
              />
              <span className="mt-1.5 flex justify-between gap-3 text-[11px] font-medium text-slate-400">
                <span>Keep the purpose focused.</span>
                <span>{description.length}/500</span>
              </span>
            </label>
          </div>

          {isError && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700">
              {getFriendlyErrorMessage(mutationError, "Unable to create community. Please try again.")}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => navigate(-1)} className="yapster-button yapster-button--ghost">Cancel</button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create community"}
            </button>
          </div>
        </form>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0 sm:p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Preview</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="h-1 bg-gradient-to-r from-orange-400 via-pink-500 to-violet-600" />
            <div className="p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-black text-violet-800 ring-1 ring-black/5">
                  {previewName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-extrabold text-slate-950">{previewName}</strong>
                  <span className="mt-0.5 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">New community</span>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">{previewDescription}</p>
              <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-400">You’ll be the admin</div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50/60 p-3.5">
            <p className="text-xs font-extrabold text-violet-800">Coming next</p>
            <p className="mt-1 text-[11px] leading-5 text-violet-700/70">Community icons, banners, rules, and flairs are planned for the next feature phase.</p>
          </div>
        </aside>
      </div>
    </section>
  );
};
