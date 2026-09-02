import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
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
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="mt-3 text-sm text-slate-600">Please sign in to view your activity.</p>
        </div>
      </div>
    );
  }

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data ?? 0;

  return (
    <div className="pt-6 pb-12">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Notifications</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">NOTIFICATIONS</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Stay up to date with activity on H4UP.</p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
              >
                {markAllAsReadMutation.isPending ? "Updating..." : "Mark all as read"}
              </button>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
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
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          {(notificationsQuery.error || unreadCountQuery.error || markAllAsReadMutation.error) && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {getFriendlyErrorMessage(notificationsQuery.error || unreadCountQuery.error || markAllAsReadMutation.error, "Unable to load notifications. Please try again.")}
            </div>
          )}
          {notificationsQuery.isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((item) => (
                <div key={item} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-slate-200" />
                  <div className="mt-4 h-4 w-40 rounded bg-slate-200" />
                  <div className="mt-3 h-4 w-full rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {tab === "unread" ? "You&apos;re all caught up" : "You&apos;re all caught up"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {tab === "all" ? "New activity will appear here." : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => {
                const actor = notification.actor;
                const actorAvatar = actor?.avatar_url;

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`block w-full rounded-2xl border p-4 text-left shadow-sm transition-colors hover:border-slate-300 ${
                      notification.read ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50/60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        {actorAvatar ? (
                          <img
                            src={actorAvatar}
                            alt={actor?.display_name || actor?.username || "User"}
                            className="h-11 w-11 rounded-full border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700">
                            {notification.type === "community_moderation" || notification.type === "moderator_promotion"
                              ? "H"
                              : "U"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-6 text-slate-700">{notification.message || "New activity on H4UP"}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <span>{formatRelativeTime(notification.created_at)}</span>
                          {!notification.read && <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />}
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
    </div>
  );
};
