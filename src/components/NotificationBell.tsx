import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import {
  fetchNotificationsForUser,
  fetchUnreadNotificationCount,
  formatRelativeTime,
  getNotificationTarget,
  markNotificationsRead,
  NotificationRecord,
} from "../lib/notifications";

export const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const unreadCountQuery = useQuery<number, Error>({
    queryKey: ["notifications-unread-count", user?.id],
    queryFn: () => (user ? fetchUnreadNotificationCount(user.id) : 0),
    enabled: !!user,
    retry: false,
    staleTime: 30_000,
  });

  const notificationsQuery = useQuery<NotificationRecord[], Error>({
    queryKey: ["notifications-dropdown", user?.id],
    queryFn: () => (user ? fetchNotificationsForUser(user.id, 6) : []),
    enabled: !!user && isOpen,
    retry: false,
    staleTime: 30_000,
  });

  const unreadCount = unreadCountQuery.data ?? 0;
  const notifications = notificationsQuery.data ?? [];

  const badgeLabel = useMemo(() => (unreadCount > 9 ? "9+" : String(unreadCount)), [unreadCount]);

  const handleOpenNotification = async (notification: NotificationRecord) => {
    if (!user) return;

    const nextTarget = getNotificationTarget(notification);

    if (!notification.read) {
      await markNotificationsRead(user.id, [notification.id]);
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-page", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-dropdown", user.id] });
    }

    navigate(nextTarget);
    setIsOpen(false);
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setIsOpen((current) => !current)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-emerald-700 px-1 py-0.5 text-[10px] font-bold text-white">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-3 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <span className="text-xs font-medium text-slate-500">{unreadCount} unread</span>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-slate-800">You&apos;re all caught up</p>
                <p className="mt-1 text-xs text-slate-500">New activity will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {notifications.map((notification) => {
                  const actor = notification.actor;
                  const actorAvatar = actor?.avatar_url;

                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleOpenNotification(notification)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                        !notification.read ? "bg-emerald-50/40" : "bg-white"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {actorAvatar ? (
                          <img
                            src={actorAvatar}
                            alt={actor?.display_name || actor?.username || "User"}
                            className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-700">
                            {notification.type === "community_moderation" || notification.type === "moderator_promotion"
                              ? "H"
                              : "U"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-5 text-slate-700">{notification.message || "New activity on H4UP"}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span>{formatRelativeTime(notification.created_at)}</span>
                          {!notification.read && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate("/notifications");
              }}
              className="w-full text-center text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
