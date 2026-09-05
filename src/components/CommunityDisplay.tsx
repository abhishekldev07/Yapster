import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { getFriendlyErrorMessage } from "../lib/auth";
import { ConfirmDialog } from "./ConfirmDialog";
import { PostItem } from "./PostItem";
import { fetchPosts, Post } from "./PostList";

interface Props {
  communityId: number;
}

interface CommunityRecord {
  id: number;
  name: string;
  description: string | null;
  category?: string | null;
  created_at: string;
  created_by?: string | null;
}

type CommunityRole = "moderator" | "member";
type ConfirmedMemberAction = "promote" | "demote" | "mute" | "ban";

interface CommunityMemberRecord {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: CommunityRole | null;
  muted?: boolean;
  banned?: boolean;
  joined_at?: string;
}

interface PendingMemberAction {
  userId: string;
  displayName: string;
  action: ConfirmedMemberAction;
}

const fetchCommunityById = async (communityId: number): Promise<CommunityRecord> => {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("id", communityId)
    .single();

  if (error) throw new Error(error.message);
  return data as CommunityRecord;
};

const fetchCommunityMemberCount = async (communityId: number): Promise<number> => {
  const { count, error } = await supabase
    .from("community_members")
    .select("community_id", { count: "exact" })
    .eq("community_id", communityId);

  if (error) throw new Error(error.message);
  return count ?? 0;
};

const isOwnerOfCommunity = (
  community: CommunityRecord | null | undefined,
  userId: string | null | undefined
) => {
  if (!community || !userId) return false;
  return community.created_by === userId;
};

const fetchCommunityMembers = async (
  communityId: number
): Promise<CommunityMemberRecord[]> => {
  const { data: memberships, error: membershipError } = await supabase
    .from("community_members")
    .select("user_id, role, muted, banned, joined_at")
    .eq("community_id", communityId)
    .order("joined_at", { ascending: true });

  if (membershipError) throw new Error(membershipError.message);
  if (!memberships || memberships.length === 0) return [];

  const userIds = memberships.map((membership) => membership.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", userIds);

  if (profileError) {
    console.warn("Failed to fetch member profiles:", profileError);
    return memberships.map((membership) => ({
      user_id: membership.user_id,
      username: null,
      display_name: null,
      avatar_url: null,
      role: (membership.role as CommunityRole) || "member",
      muted: membership.muted ?? false,
      banned: membership.banned ?? false,
      joined_at: membership.joined_at,
    }));
  }

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return memberships.map((membership) => {
    const profile = profileMap.get(membership.user_id);
    return {
      user_id: membership.user_id,
      username: profile?.username || null,
      display_name: profile?.display_name || null,
      avatar_url: profile?.avatar_url || null,
      role: (membership.role as CommunityRole) || "member",
      muted: membership.muted ?? false,
      banned: membership.banned ?? false,
      joined_at: membership.joined_at,
    };
  });
};

const fetchOwnerProfile = async (
  userId: string
): Promise<CommunityMemberRecord | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    user_id: userId,
    username: data.username || null,
    display_name: data.display_name || null,
    avatar_url: data.avatar_url || null,
  };
};

export const fetchCommunityPost = async (
  communityId: number
): Promise<Post[]> => {
  const posts = await fetchPosts();
  return posts.filter((post) => Number(post.community_id) === communityId);
};

const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-2-12a4 4 0 0 1 0 7.75" />
  </svg>
);

const PostIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.5A2.5 2.5 0 0 1 4 14V5.5Z" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 3v3m10-3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 3 5 6v5c0 4.55 2.98 8.74 7 10 4.02-1.26 7-5.45 7-10V6l-7-3Z" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 18 6-6-6-6" />
  </svg>
);

const formatCommunityDate = (dateValue?: string | null) => {
  if (!dateValue) return "Unknown";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(date);
};

export const CommunityDisplay = ({ communityId }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, signInWithGitHub } = useAuth();
  const [pending, setPending] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"posts" | "about" | "members">("posts");
  const [manageOpen, setManageOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [pendingMemberAction, setPendingMemberAction] = useState<PendingMemberAction | null>(null);
  const [memberActionPending, setMemberActionPending] = useState(false);

  const {
    data: community,
    error: communityError,
    isLoading: communityLoading,
  } = useQuery<CommunityRecord, Error>({
    queryKey: ["community", communityId],
    queryFn: () => fetchCommunityById(communityId),
    enabled: !!communityId,
  });

  const { data, error, isLoading } = useQuery<Post[], Error>({
    queryKey: ["communityPost", communityId],
    queryFn: () => fetchCommunityPost(communityId),
    enabled: !!communityId,
  });

  const { data: memberCount = 0 } = useQuery<number, Error>({
    queryKey: ["community-member-count", communityId],
    queryFn: () => fetchCommunityMemberCount(communityId),
    enabled: !!communityId,
  });

  const { data: membership = null } = useQuery<CommunityMemberRecord | null, Error>({
    queryKey: ["community-membership", communityId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: membershipData, error: membershipQueryError } = await supabase
        .from("community_members")
        .select("user_id, role, muted, banned")
        .eq("community_id", communityId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipQueryError) throw new Error(membershipQueryError.message);
      return membershipData as CommunityMemberRecord | null;
    },
    enabled: !authLoading && !!user && !!communityId,
    retry: false,
    throwOnError: false,
  });

  const {
    data: members = [],
    isLoading: membersLoading,
    error: membersError,
  } = useQuery<CommunityMemberRecord[], Error>({
    queryKey: ["community-members", communityId],
    queryFn: () => fetchCommunityMembers(communityId),
    enabled: !!communityId,
  });

  const { data: ownerProfile = null } = useQuery<CommunityMemberRecord | null, Error>({
    queryKey: ["community-owner-profile", community?.created_by],
    queryFn: () =>
      community?.created_by
        ? fetchOwnerProfile(community.created_by)
        : Promise.resolve(null),
    enabled: !!community?.created_by,
  });

  const isOwner = isOwnerOfCommunity(community, user?.id ?? null);
  const isModerator = membership?.role === "moderator";
  const isJoined = isOwner || Boolean(membership);
  const isBanned = Boolean(membership?.banned);
  const totalMemberCount = memberCount + (community?.created_by ? 1 : 0);
  const postCount = data?.length ?? 0;

  const getDisplayName = (memberRecord: CommunityMemberRecord): string =>
    memberRecord.username || memberRecord.display_name || memberRecord.user_id;

  const moderators = useMemo(
    () => members.filter((member) => member.role === "moderator" && !member.banned),
    [members]
  );

  const filteredMembers = useMemo(() => {
    const search = memberSearch.trim().toLowerCase();
    const regularMembers = members.filter(
      (member) => community?.created_by !== member.user_id
    );

    if (!search) return regularMembers;

    return regularMembers.filter((member) => {
      const displayName = member.username || member.display_name || member.user_id;
      const role = member.role ?? "member";
      return (
        displayName.toLowerCase().includes(search) ||
        role.toLowerCase().includes(search)
      );
    });
  }, [memberSearch, members, community?.created_by]);

  const joinOrLeaveMembership = useMutation({
    mutationFn: async ({
      communityId: targetCommunityId,
      isJoined: currentlyJoined,
    }: {
      communityId: number;
      isJoined: boolean;
    }) => {
      if (!user) throw new Error("You must be signed in to join a community.");

      if (isOwner) {
        return { communityId: targetCommunityId, joined: true, owner: true };
      }

      if (currentlyJoined) {
        if (isBanned) {
          throw new Error("Banned members cannot leave this community.");
        }

        const { error: leaveError } = await supabase
          .from("community_members")
          .delete()
          .eq("community_id", targetCommunityId)
          .eq("user_id", user.id);

        if (
          leaveError &&
          !String(leaveError.message).toLowerCase().includes("not found")
        ) {
          throw new Error(leaveError.message);
        }

        return { communityId: targetCommunityId, joined: false };
      }

      const { error: joinError } = await supabase
        .from("community_members")
        .insert({ community_id: targetCommunityId, user_id: user.id });

      if (joinError) {
        const message = joinError.message.toLowerCase();
        if (
          message.includes("duplicate") ||
          message.includes("23505") ||
          message.includes("already exists")
        ) {
          return {
            communityId: targetCommunityId,
            joined: true,
            alreadyExists: true,
          };
        }
        throw new Error(joinError.message);
      }

      return {
        communityId: targetCommunityId,
        joined: true,
        alreadyExists: false,
      };
    },
    onSuccess: (_, variables) => {
      setMembershipError(null);
      setPending(false);
      queryClient.invalidateQueries({
        queryKey: ["community-membership", variables.communityId],
      });
      queryClient.invalidateQueries({
        queryKey: ["community-member-count", variables.communityId],
      });
      queryClient.invalidateQueries({ queryKey: ["community-member-counts"] });
      queryClient.invalidateQueries({ queryKey: ["community-memberships"] });
      queryClient.invalidateQueries({
        queryKey: ["community-members", variables.communityId],
      });
    },
    onError: (mutationError) => {
      setMembershipError(
        getFriendlyErrorMessage(
          mutationError,
          "We could not update your community membership."
        )
      );
      setPending(false);
    },
  });

  const updateRole = async (
    targetUserId: string,
    nextRole: CommunityRole
  ) => {
    if (!user || !isOwner) return;
    if (targetUserId === user.id) {
      setMembershipError("You cannot change your own role.");
      return;
    }
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot modify the community owner.");
      return;
    }

    const { error: roleError } = await supabase
      .from("community_members")
      .update({ role: nextRole })
      .eq("community_id", communityId)
      .eq("user_id", targetUserId);

    if (roleError) {
      setMembershipError(
        getFriendlyErrorMessage(roleError, "We could not update the member role.")
      );
      return;
    }

    queryClient.invalidateQueries({
      queryKey: ["community-members", communityId],
    });
    setMembershipError(null);
  };

  const updateMuteStatus = async (targetUserId: string, muted: boolean) => {
    if (!user || (!isOwner && !isModerator)) return;
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot moderate the community owner.");
      return;
    }

    const { error: muteError } = await supabase
      .from("community_members")
      .update({ muted })
      .eq("community_id", communityId)
      .eq("user_id", targetUserId);

    if (muteError) {
      setMembershipError(
        getFriendlyErrorMessage(
          muteError,
          "We could not update member permissions."
        )
      );
      return;
    }

    queryClient.invalidateQueries({
      queryKey: ["community-members", communityId],
    });
    queryClient.invalidateQueries({ queryKey: ["moderation-log", communityId] });
    setMembershipError(null);
  };

  const updateBanStatus = async (targetUserId: string, banned: boolean) => {
    if (!user || (!isOwner && !isModerator)) return;
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot ban the community owner.");
      return;
    }

    const { error: banError } = await supabase
      .from("community_members")
      .update({ banned })
      .eq("community_id", communityId)
      .eq("user_id", targetUserId);

    if (banError) {
      setMembershipError(
        getFriendlyErrorMessage(
          banError,
          "We could not update member permissions."
        )
      );
      return;
    }

    queryClient.invalidateQueries({
      queryKey: ["community-members", communityId],
    });
    queryClient.invalidateQueries({ queryKey: ["moderation-log", communityId] });
    setMembershipError(null);
  };

  const applyModerationAction = async (
    targetUserId: string,
    action: "mute" | "ban" | "unmute" | "unban"
  ) => {
    if (!user || (!isOwner && !isModerator)) return;
    if (targetUserId === user.id) {
      setMembershipError("You cannot moderate yourself.");
      return;
    }
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot moderate the community owner.");
      return;
    }

    if (action === "mute") await updateMuteStatus(targetUserId, true);
    if (action === "unmute") await updateMuteStatus(targetUserId, false);
    if (action === "ban") await updateBanStatus(targetUserId, true);
    if (action === "unban") await updateBanStatus(targetUserId, false);
  };

  const runPendingMemberAction = async () => {
    if (!pendingMemberAction) return;
    setMemberActionPending(true);
    try {
      if (pendingMemberAction.action === "promote") {
        await updateRole(pendingMemberAction.userId, "moderator");
      } else if (pendingMemberAction.action === "demote") {
        await updateRole(pendingMemberAction.userId, "member");
      } else if (pendingMemberAction.action === "mute") {
        await applyModerationAction(pendingMemberAction.userId, "mute");
      } else if (pendingMemberAction.action === "ban") {
        await applyModerationAction(pendingMemberAction.userId, "ban");
      }
      setPendingMemberAction(null);
    } finally {
      setMemberActionPending(false);
    }
  };

  const handleMembershipToggle = () => {
    if (!user) {
      signInWithGitHub();
      return;
    }

    if (isOwner || isBanned || joinOrLeaveMembership.isPending) return;

    setPending(true);
    setMembershipError(null);
    joinOrLeaveMembership.mutate({ communityId, isJoined });
  };

  const openManageCommunity = () => {
    setEditName(community?.name ?? "");
    setEditDescription(community?.description ?? "");
    setManageOpen(true);
  };

  if (communityLoading || isLoading) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="h-56 animate-pulse bg-slate-900" />
        <div className="space-y-3 p-6">
          <div className="h-4 w-32 animate-pulse rounded-full bg-slate-100" />
          <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  if (communityError) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700 shadow-sm">
        Unable to load this community. Please try again.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700 shadow-sm">
        Unable to load community posts. Please try again.
      </div>
    );
  }

  const communityInitial = community?.name?.trim().slice(0, 1).toUpperCase() || "Y";
  const ownerName = ownerProfile ? getDisplayName(ownerProfile) : "Community owner";
  const memberActionCopy = pendingMemberAction
    ? pendingMemberAction.action === "promote"
      ? {
          title: `Make ${pendingMemberAction.displayName} a moderator?`,
          description: "They will be able to review reports and moderate regular community members.",
          confirmLabel: "Make moderator",
        }
      : pendingMemberAction.action === "demote"
        ? {
            title: `Remove moderator access from ${pendingMemberAction.displayName}?`,
            description: "They will become a regular community member and lose moderation permissions.",
            confirmLabel: "Remove moderator",
          }
        : pendingMemberAction.action === "mute"
          ? {
              title: `Mute ${pendingMemberAction.displayName}?`,
              description: "They will remain in the community but will not be able to post or comment until unmuted.",
              confirmLabel: "Mute member",
            }
          : {
              title: `Ban ${pendingMemberAction.displayName}?`,
              description: "They will be blocked from participating in this community until an owner or moderator unbans them.",
              confirmLabel: "Ban member",
            }
    : null;

  return (
    <>
      <div className="space-y-6">
        {membershipError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
            {membershipError}
          </div>
        )}

        <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_24px_70px_-34px_rgba(15,23,42,0.35)]">
          <div className="relative overflow-hidden bg-[#0b0914] px-5 pb-7 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
            <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-orange-500/30 blur-3xl" />
            <div className="pointer-events-none absolute left-[38%] top-5 h-52 w-52 rounded-full bg-pink-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 -top-16 h-80 w-80 rounded-full bg-violet-600/35 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0b0914] to-transparent" />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/80 backdrop-blur">
                  Yapster community
                </span>
                {community?.category && (
                  <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs font-bold text-white/60 backdrop-blur">
                    {community.category}
                  </span>
                )}
              </div>

              {(isOwner || isModerator) && (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur">
                  <ShieldIcon />
                  {isOwner ? "Community owner" : "Moderator"}
                </span>
              )}
            </div>

            <div className="relative z-10 mt-10 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-5 sm:flex-row sm:items-end">
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[24px] border border-white/20 bg-gradient-to-br from-orange-400 via-pink-500 to-violet-600 text-3xl font-black text-white shadow-[0_18px_45px_-15px_rgba(236,72,153,0.8)] ring-4 ring-white/10 sm:h-24 sm:w-24 sm:text-4xl">
                  {communityInitial}
                </div>

                <div className="min-w-0 pb-1">
                  <h1 className="truncate text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
                    {community?.name}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-white/60 sm:text-[15px]">
                    {community?.description || "A space for people who want to talk, share, and build around this topic."}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-white/65 sm:text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <PeopleIcon />
                      {totalMemberCount} {totalMemberCount === 1 ? "member" : "members"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <PostIcon />
                      {postCount} {postCount === 1 ? "post" : "posts"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarIcon />
                      Since {formatCommunityDate(community?.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 lg:max-w-[390px] lg:justify-end">
                {!isOwner && !isModerator && (
                  <button
                    type="button"
                    disabled={authLoading || pending || joinOrLeaveMembership.isPending}
                    onClick={handleMembershipToggle}
                    className={`rounded-xl px-5 py-3 text-sm font-extrabold transition ${
                      user && isJoined
                        ? "border border-white/15 bg-white/10 text-white hover:bg-white/15"
                        : "bg-white text-slate-950 shadow-lg shadow-black/15 hover:-translate-y-0.5 hover:bg-white/95"
                    } ${
                      authLoading || pending || joinOrLeaveMembership.isPending
                        ? "cursor-not-allowed opacity-60"
                        : ""
                    }`}
                  >
                    {authLoading
                      ? "Loading..."
                      : pending || joinOrLeaveMembership.isPending
                        ? "Processing..."
                        : user
                          ? isJoined
                            ? "Leave community"
                            : "Join community"
                          : "Sign in to join"}
                  </button>
                )}

                {(isOwner || (isJoined && !isBanned)) && (
                  <button
                    type="button"
                    onClick={() => navigate(`/create?community=${communityId}`)}
                    className="rounded-xl bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-[0_14px_32px_-14px_rgba(236,72,153,0.8)] transition hover:-translate-y-0.5 hover:brightness-110"
                  >
                    Create post
                  </button>
                )}

                {isOwner && (
                  <button
                    type="button"
                    onClick={openManageCommunity}
                    className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-white/15"
                  >
                    Manage
                  </button>
                )}
              </div>
            </div>
          </div>

          <nav className="flex overflow-x-auto border-t border-slate-100 bg-white px-3 sm:px-5" aria-label="Community sections">
            {(["posts", "about", "members"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative min-w-max px-4 py-4 text-sm font-extrabold capitalize transition sm:px-5 ${
                  activeTab === tab
                    ? "text-slate-950"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600 sm:inset-x-5" />
                )}
              </button>
            ))}
          </nav>
        </section>

        {manageOpen && isOwner && (
          <section className="rounded-[24px] border border-violet-200/70 bg-white p-5 shadow-[0_18px_50px_-34px_rgba(76,29,149,0.5)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-600">
                  Owner tools
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                  Manage community
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Keep the identity and description of this space up to date.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            <form
              className="mt-5 grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!user || !editName.trim()) return;

                const { error: updateError } = await supabase
                  .from("communities")
                  .update({
                    name: editName.trim(),
                    description: editDescription.trim() || null,
                  })
                  .eq("id", communityId)
                  .eq("created_by", user.id);

                if (updateError) {
                  setMembershipError(
                    getFriendlyErrorMessage(
                      updateError,
                      "We could not update the community."
                    )
                  );
                } else {
                  setManageOpen(false);
                  queryClient.invalidateQueries({
                    queryKey: ["community", communityId],
                  });
                }
              }}
            >
              <label className="grid gap-2 text-sm font-extrabold text-slate-700">
                Community name
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60"
                />
              </label>
              <label className="grid gap-2 text-sm font-extrabold text-slate-700">
                Description
                <textarea
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium leading-6 text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60"
                />
              </label>
              <div>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-slate-800"
                >
                  Save changes
                </button>
              </div>
            </form>
          </section>
        )}

        {activeTab === "posts" && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
            <section className="min-w-0">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-600">
                    Conversations
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                    Community feed
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-500">
                  {postCount} {postCount === 1 ? "post" : "posts"}
                </span>
              </div>

              {data && data.length > 0 ? (
                <div className="space-y-4">
                  {data.map((post) => (
                    <PostItem key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-violet-700">
                    <PostIcon />
                  </div>
                  <h3 className="mt-4 text-lg font-black text-slate-950">
                    No conversations yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    Be the first person to start a useful conversation in this community.
                  </p>
                  {(isOwner || (isJoined && !isBanned)) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/create?community=${communityId}`)}
                      className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-slate-800"
                    >
                      Create the first post
                    </button>
                  )}
                </div>
              )}
            </section>

            <aside className="space-y-4 lg:sticky lg:top-24">
              <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_45px_-34px_rgba(15,23,42,0.4)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-slate-950">About this community</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("about")}
                    className="inline-flex items-center gap-1 text-xs font-extrabold text-violet-600 transition hover:text-violet-800"
                  >
                    More <ArrowIcon />
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {community?.description || "No description has been added yet."}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xl font-black tracking-tight text-slate-950">
                      {totalMemberCount}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Members
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xl font-black tracking-tight text-slate-950">
                      {postCount}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Posts
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_45px_-34px_rgba(15,23,42,0.4)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-slate-950">Community team</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("members")}
                    className="text-xs font-extrabold text-violet-600 transition hover:text-violet-800"
                  >
                    View all
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {ownerProfile && (
                    <MemberMiniCard
                      member={ownerProfile}
                      label="Owner"
                      accent="owner"
                      getDisplayName={getDisplayName}
                    />
                  )}
                  {moderators.slice(0, 2).map((moderator) => (
                    <MemberMiniCard
                      key={moderator.user_id}
                      member={moderator}
                      label="Moderator"
                      accent="moderator"
                      getDisplayName={getDisplayName}
                    />
                  ))}
                  {!ownerProfile && moderators.length === 0 && (
                    <p className="text-sm text-slate-400">Team information is unavailable.</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}

        {activeTab === "about" && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
            <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-600">
                About
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                About {community?.name}
              </h2>
              <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">
                {community?.description || "No description has been added yet."}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <InfoTile icon={<PeopleIcon />} label="Members" value={`${totalMemberCount}`} />
                <InfoTile icon={<PostIcon />} label="Posts" value={`${postCount}`} />
                <InfoTile icon={<CalendarIcon />} label="Created" value={formatCommunityDate(community?.created_at)} />
                <InfoTile icon={<ShieldIcon />} label="Owner" value={ownerName} />
              </div>
            </section>

            <aside className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] lg:sticky lg:top-24">
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-slate-400">
                Community team
              </p>
              <div className="mt-4 space-y-3">
                {ownerProfile && (
                  <MemberMiniCard
                    member={ownerProfile}
                    label="Owner"
                    accent="owner"
                    getDisplayName={getDisplayName}
                  />
                )}
                {moderators.map((moderator) => (
                  <MemberMiniCard
                    key={moderator.user_id}
                    member={moderator}
                    label="Moderator"
                    accent="moderator"
                    getDisplayName={getDisplayName}
                  />
                ))}
              </div>
            </aside>
          </div>
        )}

        {activeTab === "members" && (
          <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] lg:sticky lg:top-24">
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-600">
                Leadership
              </p>
              <div className="mt-4 space-y-3">
                {ownerProfile && (
                  <MemberMiniCard
                    member={ownerProfile}
                    label="Owner"
                    accent="owner"
                    getDisplayName={getDisplayName}
                  />
                )}
                {moderators.map((moderator) => (
                  <MemberMiniCard
                    key={moderator.user_id}
                    member={moderator}
                    label="Moderator"
                    accent="moderator"
                    getDisplayName={getDisplayName}
                  />
                ))}
              </div>
            </aside>

            <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-600">
                    People
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                    Community members
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {totalMemberCount} people are part of this space.
                  </p>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    onClick={openManageCommunity}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                  >
                    Manage community
                  </button>
                )}
              </div>

              <div className="mt-5">
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search members by name or role"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60"
                />
              </div>

              {membersError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  Unable to load community members. Please try again.
                </div>
              )}

              <div className="mt-5 space-y-3">
                {membersLoading ? (
                  <p className="text-sm text-slate-500">Loading members...</p>
                ) : filteredMembers.length ? (
                  filteredMembers.map((member) => {
                    const displayName = getDisplayName(member);
                    const roleLabel = member.role === "moderator" ? "Moderator" : "Member";
                    const canManageRole = Boolean(user && isOwner && member.user_id !== user.id);
                    const canModerateMember = Boolean(
                      user
                      && member.user_id !== user.id
                      && (isOwner || (isModerator && member.role === "member"))
                    );

                    return (
                      <div
                        key={member.user_id}
                        className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition hover:border-slate-200 hover:bg-white hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3.5">
                          <MemberAvatar member={member} displayName={displayName} size="large" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {member.username ? (
                                <Link
                                  to={`/profile/${encodeURIComponent(member.username)}`}
                                  className="truncate font-extrabold text-slate-950 transition hover:text-violet-700"
                                >
                                  {displayName}
                                </Link>
                              ) : (
                                <span className="truncate font-extrabold text-slate-950">
                                  {displayName}
                                </span>
                              )}
                              {member.role === "moderator" && (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-violet-700">
                                  Mod
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
                              <span>{roleLabel}</span>
                              {member.muted && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                                  Muted
                                </span>
                              )}
                              {member.banned && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                                  Banned
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {(canManageRole || canModerateMember) && (
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {canManageRole && !member.banned && member.role !== "moderator" && (
                              <SmallActionButton
                                onClick={() => setPendingMemberAction({ userId: member.user_id, displayName, action: "promote" })}
                              >
                                Make moderator
                              </SmallActionButton>
                            )}

                            {canManageRole && !member.banned && member.role === "moderator" && (
                              <SmallActionButton
                                onClick={() => setPendingMemberAction({ userId: member.user_id, displayName, action: "demote" })}
                              >
                                Remove moderator
                              </SmallActionButton>
                            )}

                            {canModerateMember && !member.banned && !member.muted && (
                              <SmallActionButton
                                tone="warning"
                                onClick={() => setPendingMemberAction({ userId: member.user_id, displayName, action: "mute" })}
                              >
                                Mute
                              </SmallActionButton>
                            )}

                            {canModerateMember && !member.banned && member.muted && (
                              <SmallActionButton
                                tone="warning"
                                onClick={() => void applyModerationAction(member.user_id, "unmute")}
                              >
                                Unmute
                              </SmallActionButton>
                            )}

                            {canModerateMember && !member.banned ? (
                              <SmallActionButton
                                tone="danger"
                                onClick={() => setPendingMemberAction({ userId: member.user_id, displayName, action: "ban" })}
                              >
                                Ban
                              </SmallActionButton>
                            ) : canModerateMember && member.banned ? (
                              <SmallActionButton
                                tone="danger"
                                onClick={() => void applyModerationAction(member.user_id, "unban")}
                              >
                                Unban
                              </SmallActionButton>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                    <p className="text-sm font-semibold text-slate-400">
                      No members match your search.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingMemberAction}
        title={memberActionCopy?.title || "Confirm member action"}
        description={memberActionCopy?.description}
        confirmLabel={memberActionCopy?.confirmLabel || "Confirm"}
        isPending={memberActionPending}
        onCancel={() => setPendingMemberAction(null)}
        onConfirm={() => void runPendingMemberAction()}
      />
    </>
  );
};

const MemberAvatar = ({
  member,
  displayName,
  size = "small",
}: {
  member: CommunityMemberRecord;
  displayName: string;
  size?: "small" | "large";
}) => {
  const sizeClass = size === "large" ? "h-11 w-11" : "h-9 w-9";
  const textClass = size === "large" ? "text-sm" : "text-xs";

  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={displayName}
        className={`${sizeClass} shrink-0 rounded-xl object-cover ring-1 ring-slate-200`}
      />
    );
  }

  return (
    <div className={`${sizeClass} ${textClass} grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 font-black text-violet-700 ring-1 ring-violet-100`}>
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
};

const MemberMiniCard = ({
  member,
  label,
  accent,
  getDisplayName,
}: {
  member: CommunityMemberRecord;
  label: string;
  accent: "owner" | "moderator";
  getDisplayName: (memberRecord: CommunityMemberRecord) => string;
}) => {
  const displayName = getDisplayName(member);
  const labelClass =
    accent === "owner"
      ? "bg-orange-50 text-orange-700"
      : "bg-violet-50 text-violet-700";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <MemberAvatar member={member} displayName={displayName} />
      <div className="min-w-0 flex-1">
        {member.username ? (
          <Link
            to={`/profile/${encodeURIComponent(member.username)}`}
            className="block truncate text-sm font-extrabold text-slate-800 transition hover:text-violet-700"
          >
            {displayName}
          </Link>
        ) : (
          <p className="truncate text-sm font-extrabold text-slate-800">{displayName}</p>
        )}
        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] ${labelClass}`}>
          {label}
        </span>
      </div>
    </div>
  );
};

const InfoTile = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
    <div className="flex items-center gap-2 text-slate-400">
      {icon}
      <span className="text-[11px] font-extrabold uppercase tracking-[0.12em]">{label}</span>
    </div>
    <p className="mt-2 truncate text-base font-black text-slate-900">{value}</p>
  </div>
);

const SmallActionButton = ({
  children,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "warning" | "danger";
}) => {
  const toneClass =
    tone === "danger"
      ? "border-red-100 bg-red-50 text-red-700 hover:bg-red-100"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100"
        : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-extrabold transition ${toneClass}`}
    >
      {children}
    </button>
  );
};
