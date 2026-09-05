import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { getFriendlyErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

interface CommunitySummary { id: number; name: string; created_by: string | null; }
interface MemberRow { user_id: string; role: string; muted: boolean; banned: boolean; joined_at: string; username: string | null; display_name: string | null; avatar_url: string | null; }
interface RemoveTarget { userId: string; name: string; }

export const CommunityMembersAdminPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [reason, setReason] = useState("");

  const communityQuery = useQuery<CommunitySummary | null, Error>({
    queryKey: ["members-admin-community", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id, name, created_by").eq("id", communityId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunitySummary | null;
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const roleQuery = useQuery<{ role: string | null; banned: boolean | null } | null, Error>({
    queryKey: ["members-admin-role", communityId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("community_members").select("role, banned").eq("community_id", communityId).eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { role: string | null; banned: boolean | null } | null;
    },
    enabled: !!user && Number.isFinite(communityId) && communityId > 0,
    retry: false,
  });

  const community = communityQuery.data;
  const isOwner = Boolean(user && community?.created_by === user.id);
  const isModerator = Boolean(roleQuery.data?.role === "moderator" && !roleQuery.data?.banned);
  const canManage = isOwner || isModerator;

  const membersQuery = useQuery<MemberRow[], Error>({
    queryKey: ["members-admin-list", communityId],
    queryFn: async () => {
      const { data: memberships, error } = await supabase.from("community_members").select("user_id, role, muted, banned, joined_at").eq("community_id", communityId).order("joined_at");
      if (error) throw new Error(error.message);
      const ids = (memberships ?? []).map((row) => row.user_id);
      if (!ids.length) return [];
      const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      if (profileError) throw new Error(profileError.message);
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return (memberships ?? []).map((row) => {
        const profile = profileMap.get(row.user_id);
        return { ...row, username: profile?.username ?? null, display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null } as MemberRow;
      });
    },
    enabled: canManage,
    retry: false,
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!removeTarget) throw new Error("Choose a member to remove.");
      if (!reason.trim()) throw new Error("Give a reason for removing this member.");
      const { error } = await supabase.rpc("remove_community_member", { p_community_id: communityId, p_user_id: removeTarget.userId, p_reason: reason.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setRemoveTarget(null);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["members-admin-list", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-members", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-member-count", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-member-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["moderation-log", communityId] }),
      ]);
    },
  });

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (membersQuery.data ?? []).filter((member) => {
      if (member.user_id === community?.created_by) return false;
      if (isModerator && member.role === "moderator") return false;
      const name = `${member.username ?? ""} ${member.display_name ?? ""} ${member.role}`.toLowerCase();
      return !term || name.includes(term);
    });
  }, [community?.created_by, isModerator, membersQuery.data, search]);

  if (communityQuery.isLoading) return <main className="pb-16 pt-7"><div className="mx-auto max-w-4xl px-4 sm:px-6"><div className="yapster-card animate-pulse p-8"><div className="h-8 w-52 rounded bg-slate-100" /></div></div></main>;
  if (!community) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><h1 className="text-xl font-black text-slate-950">Community not found</h1></div></div></main>;
  if (!user || !canManage) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-9 text-center"><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-500">Member safety</p><h1 className="mt-2 text-2xl font-black text-slate-950">Moderator access required</h1><p className="mt-2 text-sm text-slate-500">Only the owner and active moderators can remove members.</p><Link to={`/community/${communityId}`} className="yapster-button yapster-button--primary mt-5">Back to community</Link></div></div></main>;

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <header className="mb-6"><Link to={`/community/${communityId}`} className="text-xs font-extrabold text-violet-700">← Back to {community.name}</Link><p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-500">Member management</p><h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">Remove community members</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Removal requires a reason. The member receives a notification containing that reason, and the action is recorded in the moderation log.</p></header>

        <section className="yapster-card p-5 sm:p-6">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-800 outline-none focus:border-violet-300 focus:bg-white" />
          {membersQuery.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{getFriendlyErrorMessage(membersQuery.error, "Members could not be loaded.")}</div>}
          <div className="mt-5 space-y-3">
            {membersQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-400">Loading members...</p> : visibleMembers.length ? visibleMembers.map((member) => {
              const name = member.display_name?.trim() || member.username?.trim() || "Yapster member";
              return <div key={member.user_id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3">{member.avatar_url ? <img src={member.avatar_url} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-black text-violet-700">{name.slice(0,1).toUpperCase()}</span>}<div className="min-w-0"><strong className="block truncate text-sm font-extrabold text-slate-950">{name}</strong><p className="mt-1 text-xs text-slate-400">{member.username ? `@${member.username} · ` : ""}{member.role === "moderator" ? "Moderator" : "Member"}{member.muted ? " · Muted" : ""}{member.banned ? " · Banned" : ""}</p></div></div><button type="button" onClick={() => { setRemoveTarget({ userId: member.user_id, name }); setReason(""); }} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-extrabold text-red-700 transition hover:bg-red-100">Remove member</button></div>;
            }) : <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No removable members match your search.</div>}
          </div>
        </section>
      </div>

      {removeTarget && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><form onSubmit={(event) => { event.preventDefault(); removeMutation.mutate(); }} className="w-full max-w-lg rounded-[22px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-500">Remove member</p><h2 className="mt-2 text-xl font-black text-slate-950">Remove {removeTarget.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-500">Tell them why they are being removed. This reason will be included in their notification.</p><label className="mt-5 block text-sm font-extrabold text-slate-700">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={300} autoFocus placeholder="e.g. Repeated spam after moderator warnings" className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-800 outline-none focus:border-violet-300 focus:bg-white" /></label><div className="mt-1 text-right text-[10px] font-medium text-slate-400">{reason.length}/300</div>{removeMutation.error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{getFriendlyErrorMessage(removeMutation.error, "Member could not be removed.")}</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setRemoveTarget(null); setReason(""); }} className="yapster-button yapster-button--ghost">Cancel</button><button type="submit" disabled={!reason.trim() || removeMutation.isPending} className="yapster-button yapster-button--primary disabled:opacity-50">{removeMutation.isPending ? "Removing..." : "Remove member"}</button></div></form></div>}
    </main>
  );
};
