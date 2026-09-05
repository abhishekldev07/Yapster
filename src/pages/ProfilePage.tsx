import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { getFriendlyErrorMessage } from "../lib/auth";

interface ProfileRecord {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
}

const fetchProfileByUsername = async (username: string): Promise<ProfileRecord | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, created_at")
    .ilike("username", username)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ProfileRecord | null;
};

const updateProfile = async (values: Partial<ProfileRecord>) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to edit your profile.");

  const { error } = await supabase
    .from("profiles")
    .update({
      username: values.username?.trim() || null,
      display_name: values.display_name?.trim() || null,
      bio: values.bio?.trim() || null,
      avatar_url: values.avatar_url?.trim() || null,
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
};

export const ProfilePage = () => {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ username: "", display_name: "", bio: "", avatar_url: "" });

  const profileUsername = useMemo(() => {
    if (!username) return "";
    return decodeURIComponent(username).trim();
  }, [username]);

  const { data: profile, isLoading, error } = useQuery<ProfileRecord | null, Error>({
    queryKey: ["profile", profileUsername],
    queryFn: () => (profileUsername ? fetchProfileByUsername(profileUsername) : Promise.resolve(null)),
    enabled: !!profileUsername,
    retry: false,
  });

  const isOwnProfile = !!user && !!profile && user.id === profile.id;

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile", profileUsername] });
      await queryClient.invalidateQueries({ queryKey: ["profile-navbar", user?.id] });
      setIsEditing(false);
    },
  });

  const openEditor = () => {
    if (!profile) return;
    setForm({
      username: profile.username || "",
      display_name: profile.display_name || "",
      bio: profile.bio || "",
      avatar_url: profile.avatar_url || "",
    });
    setIsEditing(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      username: form.username,
      display_name: form.display_name,
      bio: form.bio,
      avatar_url: form.avatar_url,
    });
  };

  const messageShell = (children: React.ReactNode) => (
    <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">{children}</div>
    </main>
  );

  if (!profileUsername) {
    return messageShell(<div className="yapster-card p-8 text-sm text-slate-600">Missing profile username.</div>);
  }

  if (isLoading) {
    return messageShell(
      <div className="yapster-card animate-pulse p-7">
        <div className="h-24 rounded-2xl bg-slate-100" />
        <div className="mx-5 -mt-8 h-20 w-20 rounded-2xl bg-slate-200 ring-4 ring-white" />
        <div className="mt-5 h-5 w-44 rounded bg-slate-100" />
        <div className="mt-3 h-3 w-28 rounded bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return messageShell(
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-sm font-medium text-red-700 shadow-sm">
        Unable to load this profile. Please try again.
      </div>
    );
  }

  if (!profile) {
    return messageShell(
      <div className="yapster-card p-9 text-center">
        <img src="/yapster-mark.svg" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">Profile not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          There is no Yapster profile for <span className="font-bold">@{profileUsername}</span>.
        </p>
        <Link to="/" className="yapster-button yapster-button--primary mt-5">Back home</Link>
      </div>
    );
  }

  const profileAvatar = profile.avatar_url || (isOwnProfile ? user?.user_metadata?.avatar_url : null) || null;
  const displayName = profile.display_name || profile.username || "Anonymous user";
  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "Recently";
  const inputClassName = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60";

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[980px] px-4 sm:px-6">
        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="relative h-40 overflow-hidden bg-[#0e0e15] sm:h-48">
            <div className="absolute -left-20 -top-28 h-80 w-80 rounded-full bg-orange-500/15 blur-3xl" />
            <div className="absolute left-1/3 -top-40 h-96 w-96 rounded-full bg-pink-600/15 blur-3xl" />
            <div className="absolute -right-16 -top-24 h-80 w-80 rounded-full bg-violet-600/25 blur-3xl" />
            <div className="absolute right-5 top-5 flex items-center gap-2 text-white/30">
              <img src="/yapster-mark.svg" alt="" className="h-8 w-8 opacity-80" />
              <span className="text-xs font-extrabold uppercase tracking-[0.15em]">Profile</span>
            </div>
          </div>

          <div className="relative px-5 pb-6 sm:px-7 sm:pb-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 items-end gap-4">
                <div className="-mt-14 shrink-0 rounded-[22px] bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="" className="h-24 w-24 rounded-[17px] object-cover sm:h-28 sm:w-28" />
                  ) : (
                    <div className="grid h-24 w-24 place-items-center rounded-[17px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-3xl font-black text-violet-800 sm:h-28 sm:w-28">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 pb-1">
                  <h1 className="truncate text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">{displayName}</h1>
                  <p className="mt-1 text-sm font-semibold text-violet-700">@{profile.username || profileUsername}</p>
                </div>
              </div>

              {isOwnProfile && !isEditing && (
                <button type="button" onClick={openEditor} className="yapster-button yapster-button--ghost w-fit">
                  Edit profile
                </button>
              )}
            </div>

            {!isEditing ? (
              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">About</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-650">
                    {profile.bio || "This Yapster has not written a bio yet."}
                  </p>
                </div>

                <aside className="rounded-2xl border border-slate-100 bg-white p-5 ring-1 ring-slate-100">
                  <h2 className="text-sm font-extrabold text-slate-950">Profile details</h2>
                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Username</dt>
                      <dd className="mt-1 font-bold text-slate-700">@{profile.username || profileUsername}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Joined Yapster</dt>
                      <dd className="mt-1 font-bold text-slate-700">{joinedDate}</dd>
                    </div>
                  </dl>
                </aside>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">Edit profile</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Profile image upload will replace URL-based avatars in a later phase.</p>
                  </div>
                  <button type="button" onClick={() => setIsEditing(false)} className="text-xs font-extrabold text-slate-400 hover:text-slate-700">Close</button>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className="text-sm font-extrabold text-slate-700 md:col-span-2">
                    Avatar URL
                    <input
                      type="url"
                      value={form.avatar_url}
                      onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))}
                      placeholder="https://..."
                      className={`${inputClassName} mt-2`}
                    />
                  </label>

                  <label className="text-sm font-extrabold text-slate-700">
                    Username
                    <input
                      type="text"
                      value={form.username}
                      onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                      className={`${inputClassName} mt-2`}
                    />
                  </label>

                  <label className="text-sm font-extrabold text-slate-700">
                    Display name
                    <input
                      type="text"
                      value={form.display_name}
                      onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
                      className={`${inputClassName} mt-2`}
                    />
                  </label>

                  <label className="text-sm font-extrabold text-slate-700 md:col-span-2">
                    Bio
                    <textarea
                      rows={5}
                      value={form.bio}
                      onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
                      className={`${inputClassName} mt-2 resize-y leading-6`}
                    />
                  </label>
                </div>

                {mutation.isError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                    {getFriendlyErrorMessage(mutation.error, "Could not save profile. Please try again.")}
                  </div>
                )}

                {mutation.isSuccess && (
                  <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-medium text-violet-700">
                    Profile saved successfully.
                  </div>
                )}

                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setIsEditing(false)} className="yapster-button yapster-button--ghost">Cancel</button>
                  <button type="submit" disabled={mutation.isPending} className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-60">
                    {mutation.isPending ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};
