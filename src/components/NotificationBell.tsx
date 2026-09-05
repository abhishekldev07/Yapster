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
        className="relative inline-flex h-[37px] w-[37px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-white/65 transition hover:bg-white/10 hover:text-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6.5 9.8a5.5 5.5 0 0 1 11 0c0 6 2.5 6.2 2.5 7.7H4c0-1.5 2.5-1.7 2.5-7.7Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 20h4" strokeLinecap="round" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-violet-600 px-1 py-0.5 text-[9px] font-black text-white ring-2 ring-[#0b0b12]">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-3 w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[16px] border border-slate-200 bg-white text-slate-900 shadow-[0_20px_60px_rgba(8,8,14,0.22)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">Notifications</h3>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">Recent activity on Yapster</p>
            </div>
            {unreadCount > 0 && (
              <span className="rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-extrabold text-violet-700">
                {unreadCount} unread
              </span>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6.5 9.8a5.5 5.5 0 0 1 11 0c0 6 2.5 6.2 2.5 7.7H4c0-1.5 2.5-1.7 2.5-7.7Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-extrabold text-slate-800">You&apos;re all caught up</p>
                <p className="mt-1 text-xs text-slate-400">New activity will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((notification) => {
                  const actor = notification.actor;
                  const actorAvatar = actor?.avatar_url;
                  const isSystemNotification = notification.type === "community_moderation" || notification.type === "moderator_promotion";

                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleOpenNotification(notification)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${!notification.read ? "bg-violet-50/35" : "bg-white"}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {actorAvatar ? (
                          <img
                            src={actorAvatar}
                            alt=""
                            className="h-9 w-9 rounded-xl border border-slate-200 object-cover"
                          />
                        ) : isSystemNotification ? (
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#101017]">
                            <img src="/yapster-mark.svg" alt="" className="h-6 w-6" />
                          </div>
                        ) : (
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                            {(actor?.display_name || actor?.username || "U").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-5 text-slate-700">{notification.message || "New activity on Yapster"}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                          <span>{formatRelativeTime(notification.created_at)}</span>
                          {!notification.read && <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 p-2.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate("/notifications");
              }}
              className="w-full rounded-lg px-3 py-2 text-center text-xs font-extrabold text-violet-700 transition hover:bg-violet-50 hover:text-violet-800"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
