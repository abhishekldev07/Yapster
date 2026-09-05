import { supabase } from "../supabase-client";

export type NotificationType =
  | "post_comment"
  | "comment_reply"
  | "community_moderation"
  | "moderator_promotion"
  | "mention"
  | "user_follow"
  | "community_join"
  | "community_leave"
  | "community_removed"
  | string;

export interface NotificationActor {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface NotificationRecord {
  id: number;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  post_id: number | null;
  comment_id: number | null;
  community_id: number | null;
  message: string | null;
  read: boolean;
  created_at: string;
  actor?: NotificationActor | null;
}

export const fetchUnreadNotificationCount = async (userId: string): Promise<number> => {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).eq("read", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export const fetchNotificationsForUser = async (userId: string, limit = 20, unreadOnly = false): Promise<NotificationRecord[]> => {
  let query = supabase.from("notifications").select("*").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (unreadOnly) query = query.eq("read", false);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const notifications = (data ?? []) as NotificationRecord[];
  const actorIds = Array.from(new Set(notifications.map((notification) => notification.actor_id).filter((value): value is string => Boolean(value))));
  const actorMap = new Map<string, NotificationActor>();
  if (actorIds.length) {
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds);
    if (profileError) throw new Error(profileError.message);
    (profiles ?? []).forEach((profile) => actorMap.set(profile.id, { id: profile.id, username: profile.username ?? null, display_name: profile.display_name ?? null, avatar_url: profile.avatar_url ?? null }));
  }
  return notifications.map((notification) => ({ ...notification, actor: notification.actor_id ? actorMap.get(notification.actor_id) ?? null : null }));
};

export const markNotificationsRead = async (userId: string, notificationIds: number[]) => {
  if (!notificationIds.length) return;
  const { error } = await supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).in("id", notificationIds);
  if (error) throw new Error(error.message);
};

export const markAllNotificationsRead = async (userId: string) => {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).eq("read", false);
  if (error) throw new Error(error.message);
};

export const formatRelativeTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const deltaMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.max(1, Math.round(deltaMinutes / 60));
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.max(1, Math.round(deltaHours / 24));
  if (deltaDays < 7) return `${deltaDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const getNotificationTarget = (notification: NotificationRecord) => {
  if (["post_comment", "comment_reply", "mention"].includes(notification.type) && notification.post_id) {
    const suffix = notification.comment_id ? `?comment=${notification.comment_id}` : "";
    return `/post/${notification.post_id}${suffix}`;
  }
  if (notification.type === "user_follow" && notification.actor?.username) return `/profile/${encodeURIComponent(notification.actor.username)}`;
  if (["community_moderation", "moderator_promotion", "community_join", "community_leave", "community_removed"].includes(notification.type) && notification.community_id) return `/community/${notification.community_id}`;
  return "/notifications";
};
