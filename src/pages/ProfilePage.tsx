import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

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
  const [form, setForm] = useState({
    username: "",
    display_name: "",
    bio: "",
    avatar_url: "",
  });

  const profileUsername = useMemo(() => {
    if (!username) return "";
    return decodeURIComponent(username).trim();
  }, [username]);

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery<ProfileRecord | null, Error>({
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

  if (!profileUsername) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Missing profile username.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading profile...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-sm">
          Error loading profile: {error.message}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Profile not found</h1>
          <p className="mt-3 text-sm text-slate-600">
            There is no profile for <span className="font-semibold">@{profileUsername}</span>.
          </p>
          <div className="mt-6">
            <Link to="/" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
              Back home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const profileAvatar = profile.avatar_url || user?.user_metadata?.avatar_url || null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {profileAvatar ? (
                <img
                  src={profileAvatar}
                  alt={profile.display_name || profile.username || profile.id}
                  className="h-20 w-20 rounded-full object-cover border border-slate-200 bg-slate-100"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-2xl font-bold text-slate-700">
                  {(profile.display_name || profile.username || "U").slice(0, 1).toUpperCase()}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Profile
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                  {profile.display_name || profile.username || "Anonymous user"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  @{profile.username || profileUsername}
                </p>
              </div>
            </div>

            {isOwnProfile && !isEditing && (
              <button
                type="button"
                onClick={openEditor}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {!isEditing ? (
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                  About
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {profile.bio || "No bio yet."}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                Basic info
              </h2>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div>
                  <span className="block text-xs uppercase tracking-[0.08em] text-slate-500">Username</span>
                  <span className="mt-1 block font-medium">@{profile.username || profileUsername}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.08em] text-slate-500">Display name</span>
                  <span className="mt-1 block font-medium">{profile.display_name || "Not set"}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.08em] text-slate-500">Joined</span>
                  <span className="mt-1 block font-medium">
                    {profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recently"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="profile-avatar" className="block text-sm font-medium text-slate-700">
                  Avatar URL
                </label>
                <input
                  id="profile-avatar"
                  type="url"
                  value={form.avatar_url}
                  onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-username" className="block text-sm font-medium text-slate-700">
                  Username
                </label>
                <input
                  id="profile-username"
                  type="text"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-display-name" className="block text-sm font-medium text-slate-700">
                  Display name
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  value={form.display_name}
                  onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="profile-bio" className="block text-sm font-medium text-slate-700">
                  Bio
                </label>
                <textarea
                  id="profile-bio"
                  rows={5}
                  value={form.bio}
                  onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            {mutation.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {mutation.error instanceof Error ? mutation.error.message : "Could not save profile."}
              </div>
            )}

            {mutation.isSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Profile saved successfully.
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
