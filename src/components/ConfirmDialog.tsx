import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isPending = false,
  onConfirm,
  onCancel,
}: Props) => {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onCancel();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, isPending, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="yapster-confirm-title"
        aria-describedby="yapster-confirm-description"
        className="w-full max-w-md overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(0,0,0,0.45)]"
      >
        <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
                <path d="M12 8v5m0 3.5h.01M10.2 4.8 3.3 17a2 2 0 0 0 1.75 3h13.9a2 2 0 0 0 1.75-3L13.8 4.8a2 2 0 0 0-3.6 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 id="yapster-confirm-title" className="text-lg font-black tracking-[-0.02em] text-slate-950">{title}</h2>
              <p id="yapster-confirm-description" className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="yapster-button yapster-button--ghost sm:min-w-24 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-32"
            >
              {isPending ? "Deleting..." : confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
};
