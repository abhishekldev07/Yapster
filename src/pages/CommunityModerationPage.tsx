import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { getFriendlyErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

interface CommunitySummary { id: number; name: string; created_by: string | null; }
interface ReportRow {
  id: number;
  reporter_id: string;
  community_id: number;
  target_type: "post" | "comment";
  target_id: number;
  reason: string;
  details: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution_note: string;
}
interface TargetPreview { title: string; body: string; href: string; }
interface ModLogRow { id: number; actor_id: string; action_type: string; target_type: string; target_id: number | null; note: string; created_at: string; }
type Tab = "queue" | "history" | "log";

const reasonLabels: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate or abusive content",
  misinformation: "Misleading information",
  off_topic: "Off-topic",
  other: "Other",
};

const actionLabels: Record<string, string> = {
  report_resolved: "Resolved report",
  report_dismissed: "Dismissed report",
  post_removed: "Removed post",
  comment_removed: "Removed comment",
  member_muted: "Muted member",
  member_unmuted: "Unmuted member",
  member_banned: "Banned member",
  member_unbanned: "Unbanned member",
  member_removed: "Removed member",
};

const formatDate = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const CommunityModerationPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("queue");
  const [removeTarget, setRemoveTarget] = useState<ReportRow | null>(null);

  const { data: community, isLoading: communityLoading } = useQuery<CommunitySummary | null, Error>({
    queryKey: ["moderation-community", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id, name, created_by").eq("id", communityId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunitySummary | null;
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const { data: membership } = useQuery<{ role: string | null; banned: boolean | null } | null, Error>({
    queryKey: ["moderation-role", communityId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("community_members").select("role, banned").eq("community_id", communityId).eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { role: string | null; banned: boolean | null } | null;
    },
    enabled: !!user && Number.isFinite(communityId) && communityId > 0,
    retry: false,
  });

  const canModerate = Boolean(user && community && (community.created_by === user.id || (membership?.role === "moderator" && !membership?.banned)));

  const { data: reports = [], isLoading: reportsLoading, error: reportsError } = useQuery<ReportRow[], Error>({
    queryKey: ["community-reports", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("reports").select("id, reporter_id, community_id, target_type, target_id, reason, details, status, created_at, reviewed_at, reviewed_by, resolution_note").eq("community_id", communityId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ReportRow[];
    },
    enabled: canModerate,
    retry: false,
  });

  const { data: targetPreviews = new Map<string, TargetPreview>() } = useQuery<Map<string, TargetPreview>, Error>({
    queryKey: ["report-target-previews", communityId, reports.map((report) => `${report.target_type}:${report.target_id}`).join(",")],
    queryFn: async () => {
      const result = new Map<string, TargetPreview>();
      const postIds = Array.from(new Set(reports.filter((report) => report.target_type === "post").map((report) => report.target_id)));
      const commentIds = Array.from(new Set(reports.filter((report) => report.target_type === "comment").map((report) => report.target_id)));
      if (postIds.length) {
        const { data, error } = await supabase.from("posts").select("id, title, content").in("id", postIds);
        if (error) throw new Error(error.message);
        (data ?? []).forEach((post) => result.set(`post:${post.id}`, { title: post.title || `Post #${post.id}`, body: post.content || "No text body", href: `/post/${post.id}` }));
      }
      if (commentIds.length) {
        const { data, error } = await supabase.from("comments").select("id, post_id, content, author").in("id", commentIds);
        if (error) throw new Error(error.message);
        (data ?? []).forEach((comment) => result.set(`comment:${comment.id}`, { title: `Comment by ${comment.author || "member"}`, body: comment.content || "Comment content unavailable", href: `/post/${comment.post_id}?comment=${comment.id}` }));
      }
      return result;
    },
    enabled: canModerate && reports.length > 0,
    staleTime: 10_000,
  });

  const { data: reporterNames = new Map<string, string>() } = useQuery<Map<string, string>, Error>({
    queryKey: ["reporter-names", reports.map((report) => report.reporter_id).join(",")],
    queryFn: async () => {
      const ids = Array.from(new Set(reports.map((report) => report.reporter_id)));
      if (!ids.length) return new Map();
      const { data, error } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((profile) => [profile.id, profile.username || profile.display_name || "Yapster member"]));
    },
    enabled: canModerate && reports.length > 0,
    staleTime: 60_000,
  });

  const { data: modLog = [], isLoading: logLoading } = useQuery<ModLogRow[], Error>({
    queryKey: ["moderation-log", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("moderation_log").select("id, actor_id, action_type, target_type, target_id, note, created_at").eq("community_id", communityId).order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as ModLogRow[];
    },
    enabled: canModerate && tab === "log",
    retry: false,
  });

  const refreshModeration = () => {
    queryClient.invalidateQueries({ queryKey: ["community-reports", communityId] });
    queryClient.invalidateQueries({ queryKey: ["moderation-log", communityId] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["communityPost", communityId] });
    queryClient.invalidateQueries({ queryKey: ["comments"] });
    queryClient.invalidateQueries({ queryKey: ["my-reports"] });
    queryClient.invalidateQueries({ queryKey: ["community-open-report-count", communityId] });
  };

  const resolveMutation = useMutation({
    mutationFn: async ({ report, status }: { report: ReportRow; status: "resolved" | "dismissed" }) => {
      if (!user) throw new Error("Sign in to moderate this community.");
      const { error } = await supabase.rpc("review_report", { p_report_id: report.id, p_action: status });
      if (error) throw new Error(error.message);
    },
    onSuccess: refreshModeration,
  });

  const removeMutation = useMutation({
    mutationFn: async (report: ReportRow) => {
      if (!user) throw new Error("Sign in to moderate this community.");
      const { error } = await supabase.rpc("remove_reported_content", { p_report_id: report.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setRemoveTarget(null); refreshModeration(); },
  });

  const queueReports = useMemo(() => reports.filter((report) => report.status === "open" || report.status === "reviewing"), [reports]);
  const historyReports = useMemo(() => reports.filter((report) => report.status === "resolved" || report.status === "dismissed"), [reports]);
  const visibleReports = tab === "queue" ? queueReports : historyReports;
  const actionError = resolveMutation.error || removeMutation.error;

  if (communityLoading) return <main className="pb-16 pt-7"><div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="yapster-card animate-pulse p-8"><div className="h-8 w-64 rounded bg-slate-100" /><div className="mt-6 h-48 rounded-2xl bg-slate-100" /></div></div></main>;
  if (!community) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><h1 className="text-xl font-black text-slate-950">Community not found</h1><Link to="/communities" className="yapster-button yapster-button--primary mt-5">Browse communities</Link></div></div></main>;
  if (!user || !canModerate) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-9 text-center"><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-500">Trust & safety</p><h1 className="mt-2 text-2xl font-black text-slate-950">Moderator access required</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Only the community owner and active moderators can review reports or view the moderation log.</p><Link to={`/community/${communityId}`} className="yapster-button yapster-button--primary mt-5">Back to {community.name}</Link></div></div></main>;

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to={`/community/${communityId}/manage`} className="yapster-back-community">← Back to Manage community</Link>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-500">Trust & safety</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">Moderation center</h1>
            <p className="mt-2 text-sm text-slate-500">Review member reports, remove violating content, and keep an audit trail of moderation actions.</p>
          </div>
          <span className="w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-700">{queueReports.length} open {queueReports.length === 1 ? "report" : "reports"}</span>
        </header>

        <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {([["queue", `Queue · ${queueReports.length}`], ["history", "History"], ["log", "Mod log"]] as [Tab, string][]).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${tab === key ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{label}</button>)}
        </div>

        {actionError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{getFriendlyErrorMessage(actionError, "The moderation action could not be completed.")}</div>}

        {tab === "log" ? (
          <section className="yapster-card p-5 sm:p-6">
            <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-violet-600">Audit trail</p><h2 className="mt-1 text-xl font-black text-slate-950">Moderation log</h2></div><span className="text-xs font-bold text-slate-400">Latest 100</span></div>
            <div className="mt-5 divide-y divide-slate-100">
              {logLoading ? <p className="py-8 text-center text-sm text-slate-400">Loading moderation log...</p> : modLog.length ? modLog.map((item) => <div key={item.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-extrabold text-slate-900">{actionLabels[item.action_type] || item.action_type}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.note || `${item.target_type}${item.target_id ? ` #${item.target_id}` : ""}`}</p></div><time className="shrink-0 text-[11px] font-semibold text-slate-400">{formatDate(item.created_at)}</time></div>) : <div className="py-10 text-center"><p className="font-extrabold text-slate-800">No moderation actions yet</p><p className="mt-1 text-sm text-slate-400">Actions taken from the report queue will appear here.</p></div>}
            </div>
          </section>
        ) : reportsLoading ? (
          <div className="yapster-card animate-pulse p-6"><div className="h-5 w-40 rounded bg-slate-100" /><div className="mt-5 space-y-3">{[0, 1].map((item) => <div key={item} className="h-36 rounded-2xl bg-slate-100" />)}</div></div>
        ) : reportsError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">Reports could not be loaded.</div>
        ) : visibleReports.length ? (
          <div className="space-y-4">{visibleReports.map((report) => {
            const preview = targetPreviews.get(`${report.target_type}:${report.target_id}`);
            const reporter = reporterNames.get(report.reporter_id) || "Yapster member";
            return <article key={report.id} className="yapster-card overflow-hidden"><div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-violet-600" /><div className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${report.status === "dismissed" ? "bg-slate-100 text-slate-500" : report.status === "resolved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{report.status}</span><span className="text-xs font-extrabold text-slate-700">{reasonLabels[report.reason] || report.reason}</span><span className="text-xs text-slate-400">{report.target_type} #{report.target_id}</span></div><p className="mt-2 text-xs text-slate-400">Reported by @{reporter} · {formatDate(report.created_at)}</p></div><span className="text-[11px] font-bold text-slate-300">Report #{report.id}</span></div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black text-slate-900">{preview?.title || "Content unavailable"}</h3><p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-500">{preview?.body || "This content may already have been removed."}</p></div>{preview && <Link to={preview.href} className="shrink-0 text-xs font-extrabold text-violet-700 hover:text-violet-800">Open →</Link>}</div></div>
              {report.details && <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-orange-600">Reporter context</p><p className="mt-1 text-sm leading-6 text-slate-600">{report.details}</p></div>}
              {(report.status === "open" || report.status === "reviewing") && <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={resolveMutation.isPending || removeMutation.isPending} onClick={() => resolveMutation.mutate({ report, status: "dismissed" })} className="yapster-button yapster-button--ghost min-h-9 px-3 py-0 text-xs disabled:opacity-50">Dismiss</button><button type="button" disabled={resolveMutation.isPending || removeMutation.isPending} onClick={() => resolveMutation.mutate({ report, status: "resolved" })} className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2 text-xs font-extrabold text-green-700 transition hover:bg-green-100 disabled:opacity-50">Resolve · keep content</button><button type="button" disabled={!preview || resolveMutation.isPending || removeMutation.isPending} onClick={() => setRemoveTarget(report)} className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45">Remove {report.target_type}</button></div>}
            </div></article>;
          })}</div>
        ) : (
          <section className="yapster-card p-10 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-green-50 text-green-700 ring-1 ring-green-100"><svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2" aria-hidden="true"><path d="m5 12.5 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg></div><h2 className="mt-4 text-xl font-black text-slate-950">{tab === "queue" ? "Queue is clear" : "No report history yet"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{tab === "queue" ? "There are no open reports waiting for this community's moderation team." : "Resolved and dismissed reports will appear here."}</p></section>
        )}
      </div>

      <ConfirmDialog open={!!removeTarget} title={`Remove reported ${removeTarget?.target_type || "content"}?`} description="This permanently removes the content and resolves the report in one transaction. The action will be recorded in the community moderation log." confirmLabel={`Remove ${removeTarget?.target_type || "content"}`} pendingLabel="Removing..." isPending={removeMutation.isPending} onCancel={() => setRemoveTarget(null)} onConfirm={() => removeTarget && removeMutation.mutate(removeTarget)} />
    </main>
  );
};