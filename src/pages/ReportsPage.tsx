import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

interface ReportRow {
  id: number;
  community_id: number;
  target_type: "post" | "comment";
  target_id: number;
  reason: string;
  details: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  resolution_note: string;
}

interface CommunitySummary {
  id: number;
  name: string;
}

interface TargetPreview {
  title: string;
  href: string | null;
}

const reasonLabels: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate or abusive content",
  misinformation: "Misleading information",
  off_topic: "Off-topic",
  other: "Other",
};

const statusCopy: Record<string, string> = {
  open: "Waiting for moderator review",
  reviewing: "A moderator is reviewing this report",
  resolved: "Reviewed and resolved",
  dismissed: "Reviewed and dismissed",
};

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  : "";

export const ReportsPage = () => {
  const { user } = useAuth();

  const { data: reports = [], isLoading, error } = useQuery<ReportRow[], Error>({
    queryKey: ["my-reports", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error: reportError } = await supabase
        .from("reports")
        .select("id, community_id, target_type, target_id, reason, details, status, created_at, reviewed_at, resolution_note")
        .eq("reporter_id", user.id)
        .order("created_at", { ascending: false });
      if (reportError) throw new Error(reportError.message);
      return (data ?? []) as ReportRow[];
    },
    enabled: !!user,
  });

  const { data: communities = new Map<number, CommunitySummary>() } = useQuery<Map<number, CommunitySummary>, Error>({
    queryKey: ["my-report-communities", reports.map((report) => report.community_id).join(",")],
    queryFn: async () => {
      const ids = Array.from(new Set(reports.map((report) => report.community_id)));
      if (!ids.length) return new Map();
      const { data, error: communityError } = await supabase.from("communities").select("id, name").in("id", ids);
      if (communityError) throw new Error(communityError.message);
      return new Map((data ?? []).map((community) => [Number(community.id), community as CommunitySummary]));
    },
    enabled: reports.length > 0,
    staleTime: 60_000,
  });

  const { data: targets = new Map<string, TargetPreview>() } = useQuery<Map<string, TargetPreview>, Error>({
    queryKey: ["my-report-targets", reports.map((report) => `${report.target_type}:${report.target_id}`).join(",")],
    queryFn: async () => {
      const result = new Map<string, TargetPreview>();
      const postIds = Array.from(new Set(reports.filter((report) => report.target_type === "post").map((report) => report.target_id)));
      const commentIds = Array.from(new Set(reports.filter((report) => report.target_type === "comment").map((report) => report.target_id)));

      if (postIds.length) {
        const { data, error: postError } = await supabase.from("posts").select("id, title").in("id", postIds);
        if (postError) throw new Error(postError.message);
        (data ?? []).forEach((post) => result.set(`post:${post.id}`, { title: post.title || `Post #${post.id}`, href: `/post/${post.id}` }));
      }

      if (commentIds.length) {
        const { data, error: commentError } = await supabase.from("comments").select("id, post_id, content").in("id", commentIds);
        if (commentError) throw new Error(commentError.message);
        (data ?? []).forEach((comment) => result.set(`comment:${comment.id}`, {
          title: comment.content ? `${String(comment.content).slice(0, 90)}${String(comment.content).length > 90 ? "…" : ""}` : `Comment #${comment.id}`,
          href: `/post/${comment.post_id}`,
        }));
      }

      return result;
    },
    enabled: reports.length > 0,
    staleTime: 30_000,
  });

  if (!user) {
    return (
      <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <section className="yapster-card p-9 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M6 21V4m0 1h9.5l-1.4 3 1.4 3H6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h1 className="mt-4 text-2xl font-black text-slate-950">Your reports are private</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Sign in to see reports you have submitted and their review status.</p>
            <Link to="/login" className="yapster-button yapster-button--primary mt-5">Sign in</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-[820px] px-4 sm:px-6">
        <header className="mb-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-500">Trust & safety</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">My reports</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Reports are private. Only you and the moderation team for that community can see them.</p>
        </header>

        {isLoading ? (
          <div className="yapster-card animate-pulse p-6"><div className="h-5 w-40 rounded bg-slate-100" /><div className="mt-5 h-28 rounded-2xl bg-slate-100" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">Your reports could not be loaded.</div>
        ) : reports.length ? (
          <div className="space-y-4">
            {reports.map((report) => {
              const community = communities.get(report.community_id);
              const target = targets.get(`${report.target_type}:${report.target_id}`);
              const statusClass = report.status === "resolved"
                ? "border-green-200 bg-green-50 text-green-700"
                : report.status === "dismissed"
                  ? "border-slate-200 bg-slate-100 text-slate-600"
                  : report.status === "reviewing"
                    ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-orange-200 bg-orange-50 text-orange-700";

              return (
                <article key={report.id} className="yapster-card overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${statusClass}`}>{report.status}</span>
                          <span className="text-xs font-extrabold text-slate-700">{reasonLabels[report.reason] || report.reason}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(report.created_at)}</p>
                      </div>
                      <span className="text-[11px] font-bold text-slate-300">Report #{report.id}</span>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{community?.name?.trim() || "Community"} · {report.target_type}</p>
                          <h2 className="mt-1.5 break-words text-sm font-black text-slate-900">{target?.title || "Content no longer available"}</h2>
                        </div>
                        {target?.href && <Link to={target.href} className="shrink-0 text-xs font-extrabold text-violet-700 hover:text-violet-800">Open →</Link>}
                      </div>
                    </div>

                    {report.details && <p className="mt-3 text-sm leading-6 text-slate-500"><span className="font-extrabold text-slate-700">Your context:</span> {report.details}</p>}

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="text-sm font-extrabold text-slate-800">{statusCopy[report.status] || report.status}</p>
                      {report.reviewed_at && <p className="mt-1 text-xs text-slate-400">Reviewed {formatDate(report.reviewed_at)}</p>}
                      {report.resolution_note && <p className="mt-2 text-sm leading-6 text-slate-500">{report.resolution_note}</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="yapster-card p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M6 21V4m0 1h9.5l-1.4 3 1.4 3H6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-950">No reports submitted</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">If you report a post or comment, its moderation status will appear here.</p>
            <Link to="/" className="yapster-button yapster-button--primary mt-5">Back to feed</Link>
          </section>
        )}
      </div>
    </main>
  );
};
