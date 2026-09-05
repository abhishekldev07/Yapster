import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { getFriendlyErrorMessage } from "../lib/auth";

type ReportTargetType = "post" | "comment";
type ReportReason = "spam" | "harassment" | "hate" | "misinformation" | "off_topic" | "other";

interface Props {
  open: boolean;
  communityId: number;
  targetType: ReportTargetType;
  targetId: number;
  onClose: () => void;
}

const reasons: { value: ReportReason; label: string; hint: string }[] = [
  { value: "spam", label: "Spam", hint: "Repeated, promotional, or low-value content." },
  { value: "harassment", label: "Harassment", hint: "Targeted abuse, threats, or unwanted behavior." },
  { value: "hate", label: "Hate or abusive content", hint: "Attacks based on protected characteristics." },
  { value: "misinformation", label: "Misleading information", hint: "Potentially deceptive or harmful claims." },
  { value: "off_topic", label: "Off-topic", hint: "Does not belong in this community." },
  { value: "other", label: "Something else", hint: "Explain the issue in your own words." },
];

export const ReportDialog = ({ open, communityId, targetType, targetId, onClose }: Props) => {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to submit a report.");
      const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        community_id: communityId,
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setReason("spam");
      setDetails("");
    },
  });

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !mutation.isPending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, mutation.isPending, onClose]);

  useEffect(() => {
    if (!open) {
      mutation.reset();
      setReason("spam");
      setDetails("");
    }
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const duplicateReport = mutation.error?.message.toLowerCase().includes("duplicate") || mutation.error?.message.includes("23505");
  const errorMessage = mutation.error
    ? duplicateReport
      ? "You already have an active report for this item."
      : getFriendlyErrorMessage(mutation.error, "We could not submit this report. Please try again.")
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !mutation.isPending) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" className="w-full max-w-lg overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
        <div className="p-5 sm:p-6">
          {mutation.isSuccess ? (
            <div className="py-3 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2" aria-hidden="true"><path d="m5 12.5 4.2 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 id="report-dialog-title" className="mt-4 text-xl font-black text-slate-950">Report submitted</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">Community moderators can now review it. Reports stay private.</p>
              <button type="button" onClick={onClose} className="yapster-button yapster-button--primary mt-5">Done</button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-500">Community report</p>
                  <h2 id="report-dialog-title" className="mt-1 text-xl font-black tracking-[-0.025em] text-slate-950">What should moderators review?</h2>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">Choose the closest reason. Your report is only visible to you and the community moderation team.</p>
                </div>
                <button type="button" onClick={onClose} disabled={mutation.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50" aria-label="Close report dialog">×</button>
              </div>

              {!user ? (
                <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">Sign in first to submit a report.</div>
              ) : (
                <>
                  <div className="mt-5 grid gap-2">
                    {reasons.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setReason(item.value)}
                        className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${reason === item.value ? "border-violet-300 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-slate-300"}`}
                        aria-pressed={reason === item.value}
                      >
                        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${reason === item.value ? "border-violet-600 bg-violet-600" : "border-slate-300"}`}>
                          {reason === item.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span><strong className="block text-sm text-slate-900">{item.label}</strong><span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.hint}</span></span>
                      </button>
                    ))}
                  </div>

                  <label className="mt-5 block text-sm font-extrabold text-slate-700">
                    Extra context <span className="font-medium text-slate-400">(optional)</span>
                    <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1200} rows={4} placeholder="Add anything that would help moderators understand the issue..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60" />
                    <span className="mt-1 block text-right text-[11px] font-medium text-slate-400">{details.length}/1200</span>
                  </label>
                </>
              )}

              {errorMessage && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-700">{errorMessage}</div>}

              <div className="mt-6 flex flex-col-reverse gap-2.5 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} disabled={mutation.isPending} className="yapster-button yapster-button--ghost sm:min-w-24 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => mutation.mutate()} disabled={!user || mutation.isPending} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-32">{mutation.isPending ? "Submitting..." : "Submit report"}</button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
};
