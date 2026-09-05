import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import {
  fetchNotificationsForUser,
  fetchUnreadNotificationCount,
  formatRelativeTime,
  getNotificationTarget,
  markAllNotificationsRead,
  markNotificationsRead,
  NotificationRecord,
} from "../lib/notifications";
import { getFriendlyErrorMessage } from "../lib/auth";

const BellIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <path d="M6.5 9.8a5.5 5.5 0 0 1 11 0c0 6 2.5 6.2 2.5 7.7H4c0-1.5 2.5-1.7 2.5-7.7Z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 20h4" strokeLinecap="round" />
  </svg>
);

export const NotificationsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "unread">("all");

  const notificationsQuery = useQuery<NotificationRecord[], Error>({
    queryKey: ["notifications-page", user?.id, tab],
    queryFn: async () => {
      if (!user) return [];
      return fetchNotificationsForUser(user.id, 30, tab === "unread");
    },
    enabled: !!user,
    retry: false,
    staleTime: 30_000,
  });

  const unreadCountQuery = useQuery<number, Error>({
    queryKey: ["notifications-unread-count", user?.id],
    queryFn: () => (user ? fetchUnreadNotificationCount(user.id) : 0),
    enabled: !!user,
    retry: false,
    staleTime: 30_000,
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => {
      if (!user) return Promise.resolve();
      return markAllNotificationsRead(user.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications-page", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-dropdown", user?.id] });
    },
  });

  const handleNotificationClick = async (notification: NotificationRecord) => {
    if (!user) return;

    if (!notification.read) {
      await markNotificationsRead(user.id, [notification.id]);
      await queryClient.invalidateQueries({ queryKey: ["notifications-page", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-dropdown", user.id] });
    }

    navigate(getNotificationTarget(notification));
  };

  if (!user) {
    return (
      <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="yapster-card p-9 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700">
              <BellIcon />
            </div>
            <h1 className="mt-5 text-2xl font-black text-slate-950">Your notifications live here</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Sign in to see replies, mentions, moderation updates, and other activity on Yapster.
            </p>
            <Link to="/login" className="yapster-button yapster-button--primary mt-5">
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data ?? 0;

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[900px] px-4 sm:px-6">
        <section className="overflow-hidden rounded-[22px] border border-[#22222c] bg-[#0e0e15] shadow-sm">
          <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
            <div>
              <div className="flex items-center gap-2 text-white/45">
                <BellIcon />
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em]">Activity</p>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] text-white">Notifications</h1>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Replies, mentions, community updates, and things that need your attention.
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                className="inline-flex w-fit items-center rounded-xl border border-white/10 bg-white/[0.07] px-3.5 py-2 text-xs font-extrabold text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {markAllAsReadMutation.isPending ? "Updating..." : `Mark all read · ${unreadCount}`}
              </button>
            )}
          </div>

          <div className="flex gap-1 border-t border-white/10 px-5 py-3 sm:px-7">
            {([
              { key: "all", label: "All" },
              { key: "unread", label: "Unread" },
            ] as const).map((option) => {
              const isActive = tab === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setTab(option.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                    isActive ? "bg-white text-slate-950" : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                  }`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-5">
          {(notificationsQuery.error || unreadCountQuery.error || markAllAsReadMutation.error) && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              {getFriendlyErrorMessage(notificationsQuery.error || unreadCountQuery.error || markAllAsReadMutation.error, "Unable to load notifications. Please try again.")}
            </div>
          )}

          {notificationsQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="yapster-card animate-pulse p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 rounded-xl bg-slate-100" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 w-4/5 rounded bg-slate-100" />
                      <div className="h-3 w-2/5 rounded bg-slate-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="yapster-card p-9 text-center sm:p-11">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                <BellIcon />
              </div>
              <h2 className="mt-4 text-xl font-black text-slate-950">You&apos;re all caught up</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {tab === "all" ? "New activity will show up here as conversations move." : "No unread notifications right now."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => {
                const actor = notification.actor;
                const actorAvatar = actor?.avatar_url;
                const isSystemNotification = notification.type === "community_moderation" || notification.type === "moderator_promotion";

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`group block w-full rounded-[16px] border p-4 text-left shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md ${
                      notification.read ? "border-slate-200 bg-white" : "border-violet-200 bg-violet-50/45"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        {actorAvatar ? (
                          <img
                            src={actorAvatar}
                            alt=""
                            className="h-11 w-11 rounded-xl border border-slate-200 object-cover"
                          />
                        ) : isSystemNotification ? (
                          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#111118]">
                            <img src="/yapster-mark.svg" alt="" className="h-7 w-7" />
                          </div>
                        ) : (
                          <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-sm font-black text-slate-600 ring-1 ring-slate-200">
                            {(actor?.display_name || actor?.username || "U").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-6 text-slate-700 group-hover:text-slate-950">
                          {notification.message || "New activity on Yapster"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-slate-400">
                          <span>{formatRelativeTime(notification.created_at)}</span>
                          {!notification.read && <span className="h-2 w-2 rounded-full bg-gradient-to-br from-pink-500 to-violet-600" />}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
