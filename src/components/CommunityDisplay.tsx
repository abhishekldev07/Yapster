import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { PostItem } from "./PostItem";
import { Post } from "./PostList";

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

interface PostWithCommunity extends Post {
  communities?: {
    name: string;
  };
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

const isOwnerOfCommunity = (community: CommunityRecord | null | undefined, userId: string | null | undefined) => {
  if (!community || !userId) return false;
  return community.created_by === userId;
};

const fetchCommunityMembers = async (communityId: number): Promise<CommunityMemberRecord[]> => {
  // First, fetch all community_members for this community with moderation info
  const { data: memberships, error: membershipError } = await supabase
    .from("community_members")
    .select("user_id, role, muted, banned, joined_at")
    .eq("community_id", communityId)
    .order("joined_at", { ascending: true });

  if (membershipError) throw new Error(membershipError.message);
  if (!memberships || memberships.length === 0) return [];

  // Then fetch profile data for all members
  const userIds = memberships.map(m => m.user_id);
  
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", userIds);

  if (profileError) {
    // If profiles query fails, still return members but without profile data
    console.warn("Failed to fetch member profiles:", profileError);
    return memberships.map(m => ({
      user_id: m.user_id,
      username: null,
      display_name: null,
      avatar_url: null,
      role: m.role as CommunityRole || "member",
      muted: m.muted ?? false,
      banned: m.banned ?? false,
      joined_at: m.joined_at,
    }));
  }

  // Map profiles by user_id for easy lookup
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // Combine membership data with profile data
  return memberships.map(m => {
    const profile = profileMap.get(m.user_id);
    return {
      user_id: m.user_id,
      username: profile?.username || null,
      display_name: profile?.display_name || null,
      avatar_url: profile?.avatar_url || null,
      role: m.role as CommunityRole || "member",
      muted: m.muted ?? false,
      banned: m.banned ?? false,
      joined_at: m.joined_at,
    };
  });
};

const fetchOwnerProfile = async (userId: string): Promise<CommunityMemberRecord | null> => {
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
): Promise<PostWithCommunity[]> => {
  const { data, error } = await supabase
    .from("posts")
    .select("*, communities(name)")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as PostWithCommunity[];
};

export const CommunityDisplay = ({ communityId }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, signInWithGitHub } = useAuth();
  const [pending, setPending] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "about" | "members">("posts");
  const [manageOpen, setManageOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const {
    data: community,
    error: communityError,
    isLoading: communityLoading,
  } = useQuery<CommunityRecord, Error>({
    queryKey: ["community", communityId],
    queryFn: () => fetchCommunityById(communityId),
    enabled: !!communityId,
  });

  const { data, error, isLoading } = useQuery<PostWithCommunity[], Error>({
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
      const { data, error } = await supabase
        .from("community_members")
        .select("user_id, role, muted, banned")
        .eq("community_id", communityId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunityMemberRecord | null;
    },
    enabled: !authLoading && !!user && !!communityId,
    retry: false,
    throwOnError: false,
  });

  const { data: members = [], isLoading: membersLoading, error: membersError } = useQuery<CommunityMemberRecord[], Error>({
    queryKey: ["community-members", communityId],
    queryFn: () => fetchCommunityMembers(communityId),
    enabled: !!communityId,
  });

  const { data: ownerProfile = null } = useQuery<CommunityMemberRecord | null, Error>({
    queryKey: ["community-owner-profile", community?.created_by],
    queryFn: () => (community?.created_by ? fetchOwnerProfile(community.created_by) : Promise.resolve(null)),
    enabled: !!community?.created_by,
  });

  const isOwner = isOwnerOfCommunity(community, user?.id ?? null);
  const isModerator = membership?.role === "moderator";
  const isJoined = isOwner || Boolean(membership);
  const isBanned = Boolean(membership?.banned);
  const totalMemberCount = memberCount + (community?.created_by ? 1 : 0);

  const filteredMembers = useMemo(() => {
    const search = memberSearch.trim().toLowerCase();
    
    // Filter out the owner and only show regular members
    const regularMembers = members.filter((member) => {
      // Don't show the owner in the members list
      return community?.created_by !== member.user_id;
    });
    
    if (!search) return regularMembers;
    
    return regularMembers.filter((member) => {
      const displayName = member.username || member.display_name || member.user_id;
      const role = member.role ?? "member";
      return displayName.toLowerCase().includes(search) || role.toLowerCase().includes(search);
    });
  }, [memberSearch, members, community?.created_by]);

  const getDisplayName = (memberRecord: CommunityMemberRecord): string => {
    return memberRecord.username || memberRecord.display_name || memberRecord.user_id;
  };

  const joinOrLeaveMembership = useMutation({
    mutationFn: async ({ communityId, isJoined }: { communityId: number; isJoined: boolean }) => {
      if (!user) throw new Error("You must be signed in to join a community.");

      if (isOwner) {
        return { communityId, joined: true, owner: true };
      }

      if (isJoined) {
        if (isBanned) {
          throw new Error("Banned members cannot leave this community.");
        }
        const { error } = await supabase
          .from("community_members")
          .delete()
          .eq("community_id", communityId)
          .eq("user_id", user.id);

        if (error && !String(error.message).toLowerCase().includes("not found")) {
          throw new Error(error.message);
        }
        return { communityId, joined: false };
      }

      const { error } = await supabase
        .from("community_members")
        .insert({ community_id: communityId, user_id: user.id });

      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes("duplicate") || message.includes("23505") || message.includes("already exists")) {
          return { communityId, joined: true, alreadyExists: true };
        }
        throw new Error(error.message);
      }

      return { communityId, joined: true, alreadyExists: false };
    },
    onSuccess: (_, variables) => {
      setMembershipError(null);
      setPending(false);
      queryClient.invalidateQueries({ queryKey: ["community-membership", variables.communityId] });
      queryClient.invalidateQueries({ queryKey: ["community-member-count", variables.communityId] });
      queryClient.invalidateQueries({ queryKey: ["community-member-counts"] });
      queryClient.invalidateQueries({ queryKey: ["community-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["community-members", variables.communityId] });
    },
    onError: (error) => {
      setMembershipError(error.message);
      setPending(false);
    },
  });

  const updateRole = async (targetUserId: string, nextRole: CommunityRole) => {
    if (!user) return;
    if (!isOwner) return;
    if (targetUserId === user.id) {
      setMembershipError("You cannot change your own role.");
      return;
    }

    // Check that we're not trying to modify the owner
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot modify the community owner.");
      return;
    }

    const { error } = await supabase
      .from("community_members")
      .update({ role: nextRole })
      .eq("community_id", communityId)
      .eq("user_id", targetUserId);

    if (error) {
      setMembershipError(error.message);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["community-members", communityId] });
    setMembershipError(null);
  };

  const updateMuteStatus = async (targetUserId: string, muted: boolean) => {
    if (!user) return;
    if (!isOwner) return;

    // Check that we're not trying to modify the owner
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot moderate the community owner.");
      return;
    }

    const { error } = await supabase
      .from("community_members")
      .update({ muted })
      .eq("community_id", communityId)
      .eq("user_id", targetUserId);

    if (error) {
      setMembershipError(error.message);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["community-members", communityId] });
    setMembershipError(null);
  };

  const updateBanStatus = async (targetUserId: string, banned: boolean) => {
    if (!user) return;
    if (!isOwner) return;

    // Check that we're not trying to modify the owner
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot ban the community owner.");
      return;
    }

    const { error } = await supabase
      .from("community_members")
      .update({ banned })
      .eq("community_id", communityId)
      .eq("user_id", targetUserId);

    if (error) {
      setMembershipError(error.message);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["community-members", communityId] });
    setMembershipError(null);
  };

  const applyModerationAction = async (targetUserId: string, action: "mute" | "ban" | "unmute" | "unban") => {
    if (!user) return;
    if (!isOwner) return;

    if (targetUserId === user.id) {
      setMembershipError("You cannot moderate yourself.");
      return;
    }

    // Check that we're not trying to modify the owner
    if (community?.created_by === targetUserId) {
      setMembershipError("You cannot moderate the community owner.");
      return;
    }

    if (action === "mute") {
      await updateMuteStatus(targetUserId, true);
    } else if (action === "unmute") {
      await updateMuteStatus(targetUserId, false);
    } else if (action === "ban") {
      await updateBanStatus(targetUserId, true);
    } else if (action === "unban") {
      await updateBanStatus(targetUserId, false);
    }

    queryClient.invalidateQueries({ queryKey: ["community-members", communityId] });
  };

  const handleMembershipToggle = () => {
    if (!user) {
      signInWithGitHub();
      return;
    }

    if (isOwner || isBanned) return;
    if (joinOrLeaveMembership.isPending) return;

    setPending(true);
    setMembershipError(null);
    joinOrLeaveMembership.mutate({ communityId, isJoined });
  };

  if (communityLoading || isLoading)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading community...
      </div>
    );

  if (communityError)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        Error loading community: {communityError.message}
      </div>
    );

  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        Error: {error.message}
      </div>
    );

  return (
    <div className="space-y-6">
      {membershipError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {membershipError}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              Community
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {community?.name}
            </h1>
            {community?.category && (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                {community.category}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            {isOwner ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
                Owner
              </span>
            ) : isModerator ? (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">
                Moderator
              </span>
            ) : (
              <button
                type="button"
                disabled={authLoading || pending || joinOrLeaveMembership.isPending}
                onClick={handleMembershipToggle}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  user && isJoined
                    ? "border border-slate-200 bg-slate-100 text-slate-700"
                    : "bg-emerald-700 text-white hover:bg-emerald-800"
                } ${
                  authLoading || pending || joinOrLeaveMembership.isPending ? "cursor-not-allowed opacity-70" : ""
                }`}
              >
                {authLoading
                  ? "Loading..."
                  : pending || joinOrLeaveMembership.isPending
                    ? "Processing..."
                    : user
                      ? isJoined
                        ? "Joined"
                        : "Join community"
                      : "Sign in to join"}
              </button>
            )}
            
            <button
              type="button"
              onClick={() => setShowMembers(!showMembers)}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              View Members
            </button>
            {(isOwner || (isJoined && !isBanned)) && (
              <button
                type="button"
                onClick={() => navigate(`/create?community=${communityId}`)}
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
              >
                Create Post
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => { setEditName(community?.name ?? ""); setEditDescription(community?.description ?? ""); setManageOpen(true); }}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                Manage Community
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>{totalMemberCount} {totalMemberCount === 1 ? "member" : "members"}</span>
          {ownerProfile && <span>Owner: {getDisplayName(ownerProfile)}</span>}
        </div>

        {community?.description && (
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
            {community.description}
          </p>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Community sections">
        {(["posts", "about", "members"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => { setActiveTab(tab); if (tab === "members") setShowMembers(true); }}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold capitalize ${activeTab === tab ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50"}`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {manageOpen && isOwner && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-xl font-semibold text-slate-900">Manage Community</h2><p className="mt-1 text-sm text-slate-500">Edit the community details below.</p></div>
            <button type="button" onClick={() => setManageOpen(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Close</button>
          </div>
          <form className="mt-5 space-y-4" onSubmit={async (event) => {
            event.preventDefault();
            if (!user || !editName.trim()) return;
            const { error: updateError } = await supabase.from("communities").update({ name: editName.trim(), description: editDescription.trim() || null }).eq("id", communityId).eq("created_by", user.id);
            if (updateError) setMembershipError(updateError.message); else { setManageOpen(false); queryClient.invalidateQueries({ queryKey: ["community", communityId] }); }
          }}>
            <input aria-label="Community name" value={editName || community?.name || ""} onChange={(event) => setEditName(event.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none" />
            <textarea aria-label="Community description" value={editDescription || community?.description || ""} onChange={(event) => setEditDescription(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none" />
            <button type="submit" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Save changes</button>
          </form>
        </div>
      )}

      {activeTab === "about" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-slate-900">About this community</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">{community?.description || "No description yet."}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Owner</p><p className="mt-1 font-semibold text-slate-800">{ownerProfile ? getDisplayName(ownerProfile) : "Unavailable"}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Moderators</p><p className="mt-1 font-semibold text-slate-800">{members.filter((member) => member.role === "moderator").map(getDisplayName).join(", ") || "None yet"}</p></div></div>
        </div>
      )}

      {(activeTab === "members" || showMembers) && (
        <div className="space-y-6">
          {/* Community Admin Section */}
          {ownerProfile && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Community Admin</h2>
              <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-white p-3">
                {ownerProfile.avatar_url ? (
                  <img
                    src={ownerProfile.avatar_url}
                    alt={getDisplayName(ownerProfile)}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800">
                    {getDisplayName(ownerProfile).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👑</span>
                    <span className="font-semibold text-slate-900">{getDisplayName(ownerProfile)}</span>
                  </div>
                  <p className="mt-1 text-sm text-amber-700">Admin</p>
                </div>
              </div>
            </div>
          )}

          {/* Members Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Members</h2>
                <p className="text-sm text-slate-500">{memberCount} {memberCount === 1 ? "member" : "members"}</p>
              </div>
              {isOwner && (
                <button type="button" className="rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white">
                  Manage Community
                </button>
              )}
            </div>

          <div className="mt-4">
            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          {membersError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Error loading members: {membersError.message}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {membersLoading ? (
              <p className="text-sm text-slate-500">Loading members...</p>
            ) : filteredMembers.length ? (
              filteredMembers.map((member: any) => {
                const displayName = getDisplayName(member);
                const roleLabel = member.role === "moderator" ? "Moderator" : "Member";
                const canModerate = user && (isOwner || isModerator) && member.user_id !== user.id;

                return (
                  <div
                    key={member.user_id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={displayName}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{member.role === "moderator" ? "🛡" : ""}</span>
                          {member.username ? (
                            <Link
                              to={`/profile/${encodeURIComponent(member.username)}`}
                              className="font-semibold text-slate-900 transition-colors hover:text-emerald-800"
                            >
                              {displayName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-900">{displayName}</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-sm text-slate-500">{roleLabel}</p>
                          {member.muted && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Muted</span>}
                          {member.banned && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">Banned</span>}
                        </div>
                      </div>
                    </div>
                    {canModerate && !member.banned && (
                      <div className="flex flex-wrap gap-2">
                        {member.role !== "moderator" && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Promote this member to moderator?")) {
                                void updateRole(member.user_id, "moderator");
                              }
                            }}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Make Moderator
                          </button>
                        )}
                        {member.role === "moderator" && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Remove moderator access from this user?")) {
                                void updateRole(member.user_id, "member");
                              }
                            }}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Remove Moderator
                          </button>
                        )}
                        {!member.muted && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Mute this member?")) {
                                void applyModerationAction(member.user_id, "mute");
                              }
                            }}
                            className="rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100"
                          >
                            Mute
                          </button>
                        )}
                        {member.muted && (
                          <button
                            type="button"
                            onClick={() => {
                              void applyModerationAction(member.user_id, "unmute");
                            }}
                            className="rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100"
                          >
                            Unmute
                          </button>
                        )}
                        {!member.banned && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Ban this member from the community?")) {
                                void applyModerationAction(member.user_id, "ban");
                              }
                            }}
                            className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            Ban
                          </button>
                        )}
                      </div>
                    )}
                    
                    {canModerate && member.banned && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Unban this member?")) {
                              void applyModerationAction(member.user_id, "unban");
                            }
                          }}
                          className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          Unban
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">No members yet.</p>
            )}
          </div>
          </div>
        </div>
      )}

      {activeTab === "posts" && <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Community feed</h2>
          <span className="text-sm text-slate-500">{data?.length ?? 0} posts</span>
        </div>

        {data && data.length > 0 ? (
          <div className="space-y-4">
            {data.map((post) => (
              <PostItem key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">No posts in this community yet</h3>
            <p className="mt-2 text-sm text-slate-600">
              Start the conversation with the first post in this community.
            </p>
          </div>
        )}
      </div>}
    </div>
  );
};
