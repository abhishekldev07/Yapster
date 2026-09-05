import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { getFriendlyErrorMessage } from "../lib/auth";
import { fetchUnreadMessageCount } from "../lib/social";
import { supabase } from "../supabase-client";

interface ConversationRow {
  id: number;
  user_low: string;
  user_high: string;
  created_at: string;
  last_message_at: string;
}

interface ConversationState {
  conversation_id: number;
  hidden_at: string | null;
  pinned_at: string | null;
  manually_unread: boolean;
  cleared_at: string | null;
}

interface ProfileSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface MessageRow {
  id: number;
  conversation_id: number;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  replied_to_message_id: number | null;
}

interface ReactionRow {
  message_id: number;
  user_id: string;
  emoji: string;
  created_at: string;
}

interface InboxConversation extends ConversationRow {
  partner: ProfileSummary | null;
  latestMessage: MessageRow | null;
  unreadCount: number;
  state: ConversationState;
}

interface BlockState {
  blockedByMe: boolean;
  blockedMe: boolean;
}

type ReportReason = "spam" | "harassment" | "hate" | "threat" | "scam" | "sexual" | "other";
type PendingChatAction = { kind: "clear" | "delete" | "block"; conversationId: number; partnerId?: string | null; partnerName: string };

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];
const COMPOSER_EMOJIS = ["😀", "😂", "😊", "😍", "🥹", "😅", "😎", "🤔", "🙌", "👏", "👍", "👎", "❤️", "💜", "🔥", "✨", "🎉", "😭", "😮", "😡", "🙏", "💀", "👀", "🤣"];
const REPORT_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate or abusive content" },
  { value: "threat", label: "Threat or intimidation" },
  { value: "scam", label: "Scam or fraud" },
  { value: "sexual", label: "Unwanted sexual content" },
  { value: "other", label: "Other" },
];

const emptyState = (conversationId: number): ConversationState => ({ conversation_id: conversationId, hidden_at: null, pinned_at: null, manually_unread: false, cleared_at: null });
const timeValue = (value?: string | null) => value ? new Date(value).getTime() : null;

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const fetchInbox = async (userId: string): Promise<InboxConversation[]> => {
  const [{ data: conversations, error: conversationError }, { data: states, error: stateError }] = await Promise.all([
    supabase.from("direct_conversations").select("id, user_low, user_high, created_at, last_message_at").or(`user_low.eq.${userId},user_high.eq.${userId}`).order("last_message_at", { ascending: false }),
    supabase.from("direct_conversation_states").select("conversation_id, hidden_at, pinned_at, manually_unread, cleared_at").eq("user_id", userId),
  ]);
  if (conversationError) throw new Error(conversationError.message);
  if (stateError) throw new Error(stateError.message);

  const stateMap = new Map<number, ConversationState>((states ?? []).map((row) => [Number(row.conversation_id), {
    conversation_id: Number(row.conversation_id),
    hidden_at: row.hidden_at ?? null,
    pinned_at: row.pinned_at ?? null,
    manually_unread: Boolean(row.manually_unread),
    cleared_at: row.cleared_at ?? null,
  }]));

  const rows = ((conversations ?? []) as ConversationRow[]).filter((row) => {
    const hiddenAt = timeValue(stateMap.get(row.id)?.hidden_at);
    return hiddenAt == null || new Date(row.last_message_at).getTime() > hiddenAt;
  });
  if (!rows.length) return [];

  const partnerIds = Array.from(new Set(rows.map((row) => row.user_low === userId ? row.user_high : row.user_low)));
  const conversationIds = rows.map((row) => row.id);
  const [{ data: profiles, error: profileError }, { data: messages, error: messageError }, { data: hiddenMessages, error: hiddenMessageError }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", partnerIds),
    supabase.from("direct_messages").select("id, conversation_id, sender_id, body, created_at, read_at, edited_at, deleted_at, replied_to_message_id").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(800),
    supabase.from("direct_message_hidden_messages").select("message_id").eq("user_id", userId),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (messageError) throw new Error(messageError.message);
  if (hiddenMessageError) throw new Error(hiddenMessageError.message);

  const hiddenIds = new Set((hiddenMessages ?? []).map((row) => Number(row.message_id)));
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile as ProfileSummary]));
  const latestMap = new Map<number, MessageRow>();
  const unreadMap = new Map<number, number>();

  ((messages ?? []) as MessageRow[]).forEach((message) => {
    if (hiddenIds.has(message.id)) return;
    const state = stateMap.get(message.conversation_id);
    const clearedAt = timeValue(state?.cleared_at);
    const createdAt = new Date(message.created_at).getTime();
    if (clearedAt != null && createdAt <= clearedAt) return;
    if (!latestMap.has(message.conversation_id)) latestMap.set(message.conversation_id, message);
    if (message.sender_id !== userId && !message.read_at) unreadMap.set(message.conversation_id, (unreadMap.get(message.conversation_id) ?? 0) + 1);
  });

  return rows.map((row) => {
    const partnerId = row.user_low === userId ? row.user_high : row.user_low;
    const state = stateMap.get(row.id) ?? emptyState(row.id);
    const actualUnread = unreadMap.get(row.id) ?? 0;
    return {
      ...row,
      state,
      partner: profileMap.get(partnerId) ?? null,
      latestMessage: latestMap.get(row.id) ?? null,
      unreadCount: actualUnread || (state.manually_unread ? 1 : 0),
    };
  }).sort((a, b) => {
    const aPinned = timeValue(a.state.pinned_at);
    const bPinned = timeValue(b.state.pinned_at);
    if (aPinned != null || bPinned != null) {
      if (aPinned == null) return 1;
      if (bPinned == null) return -1;
      if (aPinned !== bPinned) return bPinned - aPinned;
    }
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
};

const fetchConversationMessages = async (conversationId: number, userId: string, clearedAt?: string | null): Promise<MessageRow[]> => {
  const [{ data, error }, { data: hidden, error: hiddenError }] = await Promise.all([
    supabase.from("direct_messages").select("id, conversation_id, sender_id, body, created_at, read_at, edited_at, deleted_at, replied_to_message_id").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(600),
    supabase.from("direct_message_hidden_messages").select("message_id").eq("user_id", userId),
  ]);
  if (error) throw new Error(error.message);
  if (hiddenError) throw new Error(hiddenError.message);
  const hiddenIds = new Set((hidden ?? []).map((row) => Number(row.message_id)));
  const cutoff = timeValue(clearedAt);
  return ((data ?? []) as MessageRow[]).filter((message) => !hiddenIds.has(message.id) && (cutoff == null || new Date(message.created_at).getTime() > cutoff));
};

const fetchMessageReactions = async (messageIds: number[]): Promise<ReactionRow[]> => {
  if (!messageIds.length) return [];
  const { data, error } = await supabase.from("direct_message_reactions").select("message_id, user_id, emoji, created_at").in("message_id", messageIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReactionRow[];
};

const fetchBlockState = async (userId: string, otherUserId: string): Promise<BlockState> => {
  const { data, error } = await supabase.from("user_blocks").select("blocker_id, blocked_id").or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`);
  if (error) throw new Error(error.message);
  return {
    blockedByMe: (data ?? []).some((row) => row.blocker_id === userId && row.blocked_id === otherUserId),
    blockedMe: (data ?? []).some((row) => row.blocker_id === otherUserId && row.blocked_id === userId),
  };
};

const updateConversationState = async (conversationId: number, userId: string, patch: Partial<Pick<ConversationState, "hidden_at" | "pinned_at" | "manually_unread" | "cleared_at">>) => {
  const { error } = await supabase.from("direct_conversation_states").upsert({ conversation_id: conversationId, user_id: userId, ...patch }, { onConflict: "conversation_id,user_id" });
  if (error) throw new Error(error.message);
};

const ChatIcon = () => <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M5 5.5h14A2.5 2.5 0 0 1 21.5 8v7A2.5 2.5 0 0 1 19 17.5h-7L6 21v-3.5H5A2.5 2.5 0 0 1 2.5 15V8A2.5 2.5 0 0 1 5 5.5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ChevronIcon = () => <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true"><path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const SmileIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5c.9 1 2 1.5 3.5 1.5s2.6-.5 3.5-1.5M9 9.5h.01M15 9.5h.01" strokeLinecap="round" /></svg>;
const PinIcon = () => <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.7]" aria-hidden="true"><path d="m7 3 6 6m-4-4 4-2 4 4-2 4m-3-3-7 7m2-2-3 3" strokeLinecap="round" /></svg>;

export const MessagesPage = () => {
  const { conversationId: conversationParam } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [composer, setComposer] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteMessageId, setDeleteMessageId] = useState<number | null>(null);
  const [hideMessageId, setHideMessageId] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<MessageRow | null>(null);
  const [openInboxMenuId, setOpenInboxMenuId] = useState<number | null>(null);
  const [openMessageMenuId, setOpenMessageMenuId] = useState<number | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [pendingChatAction, setPendingChatAction] = useState<PendingChatAction | null>(null);
  const [reportTarget, setReportTarget] = useState<MessageRow | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const activeConversationId = conversationParam ? Number(conversationParam) : null;

  const inboxQuery = useQuery<InboxConversation[], Error>({ queryKey: ["message-inbox", user?.id], queryFn: () => user ? fetchInbox(user.id) : [], enabled: !!user, retry: false, staleTime: 5_000 });
  const activeConversation = useMemo(() => (inboxQuery.data ?? []).find((conversation) => conversation.id === activeConversationId) ?? null, [activeConversationId, inboxQuery.data]);
  const partnerId = activeConversation?.partner?.id || null;

  const messagesQuery = useQuery<MessageRow[], Error>({
    queryKey: ["direct-messages", activeConversationId, activeConversation?.state.cleared_at],
    queryFn: () => user && activeConversationId ? fetchConversationMessages(activeConversationId, user.id, activeConversation?.state.cleared_at) : [],
    enabled: !!user && !!activeConversationId && Number.isFinite(activeConversationId) && !!activeConversation,
    retry: false,
    staleTime: 2_500,
  });

  const messageIds = (messagesQuery.data ?? []).map((message) => message.id);
  const reactionsQuery = useQuery<ReactionRow[], Error>({
    queryKey: ["direct-message-reactions", messageIds.join(",")],
    queryFn: () => fetchMessageReactions(messageIds),
    enabled: messageIds.length > 0,
    retry: false,
    staleTime: 2_000,
  });

  const blockQuery = useQuery<BlockState>({
    queryKey: ["message-block-state", user?.id, partnerId],
    queryFn: () => user && partnerId ? fetchBlockState(user.id, partnerId) : { blockedByMe: false, blockedMe: false },
    enabled: !!user && !!partnerId,
    retry: false,
    staleTime: 5_000,
  });

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-chat-popover]")) return;
      setOpenInboxMenuId(null);
      setOpenMessageMenuId(null);
      setReactionPickerMessageId(null);
      setEmojiPickerOpen(false);
    };
    document.addEventListener("pointerdown", closePopovers);
    return () => document.removeEventListener("pointerdown", closePopovers);
  }, []);

  useEffect(() => {
    if (!user || !activeConversationId || !Number.isFinite(activeConversationId)) return;
    const channel = supabase.channel(`direct-messages:${activeConversationId}:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${activeConversationId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversationId] });
        queryClient.invalidateQueries({ queryKey: ["message-inbox", user.id] });
        queryClient.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_message_reactions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["direct-message-reactions"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeConversationId, queryClient, user]);

  useEffect(() => {
    if (!user || !activeConversationId || !activeConversation) return;
    if (!activeConversation.state.manually_unread) return;
    void updateConversationState(activeConversationId, user.id, { manually_unread: false }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["message-inbox", user.id] });
      queryClient.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
    });
  }, [activeConversationId, activeConversation?.state.manually_unread, queryClient, user]);

  useEffect(() => {
    if (!user || !activeConversationId || !messagesQuery.data?.length) return;
    if (!messagesQuery.data.some((message) => message.sender_id !== user.id && !message.read_at)) return;
    void (async () => {
      const { error } = await supabase.rpc("mark_direct_conversation_read", { p_conversation_id: activeConversationId });
      if (!error) await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversationId] }),
        queryClient.invalidateQueries({ queryKey: ["message-inbox", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["messages-unread-count", user.id] }),
      ]);
    })();
  }, [activeConversationId, messagesQuery.data, queryClient, user]);

  const refreshMessages = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["direct-messages"] }),
      queryClient.invalidateQueries({ queryKey: ["direct-message-reactions"] }),
      queryClient.invalidateQueries({ queryKey: ["message-inbox", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["messages-unread-count", user?.id] }),
    ]);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user || !activeConversationId) throw new Error("Open a conversation first.");
      if (blockQuery.data?.blockedByMe || blockQuery.data?.blockedMe) throw new Error("Messaging is unavailable between these users.");
      const body = composer.trim();
      if (!body) throw new Error("Write a message first.");
      const { error } = await supabase.from("direct_messages").insert({ conversation_id: activeConversationId, sender_id: user.id, body, replied_to_message_id: replyTarget?.id ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setComposer(""); setReplyTarget(null); setEmojiPickerOpen(false); await refreshMessages(); },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingMessageId) throw new Error("Choose a message to edit.");
      const body = editText.trim();
      if (!body) throw new Error("Message cannot be empty.");
      const { error } = await supabase.from("direct_messages").update({ body }).eq("id", editingMessageId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setEditingMessageId(null); setEditText(""); await refreshMessages(); },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async () => {
      if (!deleteMessageId) throw new Error("Choose a message to delete.");
      const { error } = await supabase.from("direct_messages").update({ body: "", deleted_at: new Date().toISOString() }).eq("id", deleteMessageId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setDeleteMessageId(null); await refreshMessages(); },
  });

  const hideMessageMutation = useMutation({
    mutationFn: async () => {
      if (!user || !hideMessageId) throw new Error("Choose a message to hide.");
      const { error } = await supabase.from("direct_message_hidden_messages").insert({ message_id: hideMessageId, user_id: user.id });
      if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
    },
    onSuccess: async () => { setHideMessageId(null); await refreshMessages(); },
  });

  const pinMutation = useMutation({
    mutationFn: async (conversation: InboxConversation) => {
      if (!user) throw new Error("Sign in first.");
      await updateConversationState(conversation.id, user.id, { pinned_at: conversation.state.pinned_at ? null : new Date().toISOString() });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["message-inbox", user?.id] }),
  });

  const markUnreadMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      if (!user) throw new Error("Sign in first.");
      await updateConversationState(conversationId, user.id, { manually_unread: true });
    },
    onSuccess: async (_, conversationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["message-inbox", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["messages-unread-count", user?.id] }),
      ]);
      if (activeConversationId === conversationId) navigate("/messages");
    },
  });

  const chatActionMutation = useMutation({
    mutationFn: async (action: PendingChatAction) => {
      if (!user) throw new Error("Sign in first.");
      if (action.kind === "clear") {
        await updateConversationState(action.conversationId, user.id, { cleared_at: new Date().toISOString(), hidden_at: null, manually_unread: false });
        return;
      }
      if (action.kind === "delete") {
        await updateConversationState(action.conversationId, user.id, { hidden_at: new Date().toISOString(), manually_unread: false });
        return;
      }
      if (!action.partnerId) throw new Error("This member could not be resolved.");
      const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: action.partnerId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_, action) => {
      setPendingChatAction(null);
      await refreshMessages();
      if (action.kind === "delete" || action.kind === "block") navigate("/messages");
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      if (!user) throw new Error("Sign in to react.");
      const existing = (reactionsQuery.data ?? []).find((reaction) => reaction.message_id === messageId && reaction.user_id === user.id);
      if (existing?.emoji === emoji) {
        const { error } = await supabase.from("direct_message_reactions").delete().eq("message_id", messageId).eq("user_id", user.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("direct_message_reactions").upsert({ message_id: messageId, user_id: user.id, emoji }, { onConflict: "message_id,user_id" });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => { setReactionPickerMessageId(null); await queryClient.invalidateQueries({ queryKey: ["direct-message-reactions"] }); },
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!user || !reportTarget) throw new Error("Choose a message to report.");
      const { error } = await supabase.from("direct_message_reports").insert({ reporter_id: user.id, message_id: reportTarget.id, reason: reportReason, details: reportDetails.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setReportTarget(null); setReportReason("spam"); setReportDetails(""); },
  });

  const copyMessage = async (message: MessageRow) => {
    if (message.deleted_at) return;
    await navigator.clipboard.writeText(message.body);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1200);
  };

  const unreadQuery = useQuery<number, Error>({ queryKey: ["messages-unread-count", user?.id], queryFn: () => user ? fetchUnreadMessageCount(user.id) : 0, enabled: !!user, retry: false, staleTime: 5_000 });

  if (!user) return <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4"><div className="mx-auto max-w-2xl px-4 sm:px-6"><section className="yapster-card p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ChatIcon /></div><h1 className="mt-5 text-2xl font-bold text-slate-950">Messages</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Sign in to message other Yapster members one-to-one.</p><Link to="/login" className="yapster-button yapster-button--primary mt-5">Sign in</Link></section></div></main>;

  const conversations = inboxQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const partnerName = activeConversation?.partner?.display_name?.trim() || activeConversation?.partner?.username?.trim() || "Yapster member";
  const partnerUsername = activeConversation?.partner?.username?.trim() || null;
  const partnerAvatar = activeConversation?.partner?.avatar_url || null;
  const interactionBlocked = Boolean(blockQuery.data?.blockedByMe || blockQuery.data?.blockedMe);
  const mutationError = sendMutation.error || editMutation.error || deleteMessageMutation.error || hideMessageMutation.error || pinMutation.error || markUnreadMutation.error || chatActionMutation.error || reactionMutation.error;

  const reactionsForMessage = (messageId: number) => (reactionsQuery.data ?? []).filter((reaction) => reaction.message_id === messageId);
  const groupedReactions = (messageId: number) => {
    const groups = new Map<string, ReactionRow[]>();
    reactionsForMessage(messageId).forEach((reaction) => groups.set(reaction.emoji, [...(groups.get(reaction.emoji) ?? []), reaction]));
    return Array.from(groups.entries());
  };

  const renderMessageActions = (message: MessageRow, own: boolean) => {
    if (message.deleted_at) return null;
    const open = openMessageMenuId === message.id;
    const reactionOpen = reactionPickerMessageId === message.id;
    return <div className={`yapster-message-hover-actions relative flex items-center gap-0.5 ${open || reactionOpen ? "is-open" : ""}`} data-chat-popover>
      <button type="button" onClick={(event) => { event.stopPropagation(); setReactionPickerMessageId((current) => current === message.id ? null : message.id); setOpenMessageMenuId(null); }} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700" aria-label="React to message"><SmileIcon /></button>
      <button type="button" onClick={(event) => { event.stopPropagation(); setOpenMessageMenuId((current) => current === message.id ? null : message.id); setReactionPickerMessageId(null); }} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700" aria-label="Message options"><ChevronIcon /></button>
      {reactionOpen && <div className={`absolute bottom-full z-40 mb-2 flex gap-1 rounded-full border border-slate-200 bg-white p-1.5 shadow-lg ${own ? "right-0" : "left-0"}`}>{QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => reactionMutation.mutate({ messageId: message.id, emoji })} className="grid h-8 w-8 place-items-center rounded-full text-lg transition hover:bg-slate-100 hover:scale-110" aria-label={`React ${emoji}`}>{emoji}</button>)}</div>}
      {open && <div className={`yapster-popover-menu absolute top-8 z-40 overflow-hidden rounded-xl p-1 ${own ? "right-0" : "left-0"}`}>
        {own ? <>
          <button type="button" onClick={() => { setEditingMessageId(message.id); setEditText(message.body); setOpenMessageMenuId(null); }}>Edit message</button>
          <button type="button" onClick={() => { setDeleteMessageId(message.id); setOpenMessageMenuId(null); }} className="text-red-600!">Delete message</button>
          <button type="button" onClick={() => { void copyMessage(message); setOpenMessageMenuId(null); }}>Copy message</button>
        </> : <>
          <button type="button" onClick={() => { setReplyTarget(message); setOpenMessageMenuId(null); }}>Reply</button>
          <button type="button" onClick={() => { void copyMessage(message); setOpenMessageMenuId(null); }}>Copy message</button>
          <button type="button" onClick={() => { setReportTarget(message); setOpenMessageMenuId(null); }}>Report message</button>
          <button type="button" onClick={() => { setHideMessageId(message.id); setOpenMessageMenuId(null); }} className="text-red-600!">Delete for me</button>
        </>}
      </div>}
    </div>;
  };

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">Messages</h1><p className="mt-2 text-sm text-slate-500">One-to-one conversations between Yapster members.</p></div>{(unreadQuery.data ?? 0) > 0 && <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">{unreadQuery.data} unread</span>}</header>

        <div className="grid min-h-[620px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className={`border-slate-200 bg-slate-50/60 lg:border-r ${activeConversationId ? "hidden lg:block" : "block"}`}>
            <div className="border-b border-slate-200 px-4 py-4"><h2 className="text-sm font-semibold text-slate-950">Inbox</h2><p className="mt-1 text-xs text-slate-400">Start a chat from someone&apos;s profile.</p></div>
            {inboxQuery.isLoading ? <div className="space-y-2 p-3">{[0,1,2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div> : inboxQuery.error ? <p className="p-5 text-sm text-red-600">Inbox could not be loaded.</p> : conversations.length ? (
              <div className="max-h-[555px] overflow-y-auto p-2.5">{conversations.map((conversation) => {
                const name = conversation.partner?.display_name?.trim() || conversation.partner?.username?.trim() || "Yapster member";
                const avatar = conversation.partner?.avatar_url || null;
                const selected = conversation.id === activeConversationId;
                const preview = conversation.latestMessage?.deleted_at ? "Message deleted" : conversation.latestMessage?.body || (conversation.state.cleared_at ? "Conversation cleared" : "Start the conversation");
                const menuOpen = openInboxMenuId === conversation.id;
                return <div key={conversation.id} className={`yapster-inbox-row group relative mb-1 rounded-2xl transition ${selected ? "bg-slate-100 ring-1 ring-slate-200" : "hover:bg-white"}`} data-chat-popover>
                  <button type="button" onClick={() => navigate(`/messages/${conversation.id}`)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 pr-10 text-left">
                    {avatar ? <img src={avatar} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-semibold text-violet-700 ring-1 ring-violet-100">{name.slice(0,1).toUpperCase()}</span>}
                    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm font-semibold text-slate-900">{name}</strong><time className="shrink-0 text-[10px] font-medium text-slate-400">{formatMessageTime(conversation.latestMessage?.created_at || conversation.last_message_at)}</time></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{preview}</span><span className="flex items-center gap-1.5">{conversation.state.pinned_at && <span className="text-slate-400"><PinIcon /></span>}{conversation.unreadCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">{conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}</span>}</span></span></span>
                  </button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setOpenInboxMenuId((current) => current === conversation.id ? null : conversation.id); }} className={`yapster-inbox-hover-actions absolute right-3 top-9 grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 ${menuOpen ? "is-open" : ""}`} aria-label={`Options for ${name}`}><ChevronIcon /></button>
                  {menuOpen && <div className="yapster-popover-menu absolute right-3 top-16 z-50 overflow-hidden rounded-xl p-1">
                    <button type="button" onClick={() => { pinMutation.mutate(conversation); setOpenInboxMenuId(null); }}>{conversation.state.pinned_at ? "Unpin chat" : "Pin chat"}</button>
                    <button type="button" onClick={() => { markUnreadMutation.mutate(conversation.id); setOpenInboxMenuId(null); }}>Mark as unread</button>
                    <button type="button" onClick={() => { setPendingChatAction({ kind: "block", conversationId: conversation.id, partnerId: conversation.partner?.id, partnerName: name }); setOpenInboxMenuId(null); }}>Block</button>
                    <button type="button" onClick={() => { setPendingChatAction({ kind: "clear", conversationId: conversation.id, partnerName: name }); setOpenInboxMenuId(null); }}>Clear chat</button>
                    <button type="button" onClick={() => { setPendingChatAction({ kind: "delete", conversationId: conversation.id, partnerName: name }); setOpenInboxMenuId(null); }} className="text-red-600!">Delete chat</button>
                  </div>}
                </div>;
              })}</div>
            ) : <div className="p-8 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ChatIcon /></div><p className="mt-4 text-sm font-semibold text-slate-800">No conversations yet</p><p className="mt-1 text-xs leading-5 text-slate-400">Visit a member profile and choose Message.</p><Link to="/search" className="mt-4 inline-flex text-xs font-semibold text-violet-700">Find people</Link></div>}
          </aside>

          <section className={`${activeConversationId ? "flex" : "hidden lg:flex"} min-w-0 flex-col bg-white`}>
            {!activeConversationId ? <div className="m-auto max-w-sm p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ChatIcon /></div><h2 className="mt-4 text-xl font-bold text-slate-950">Choose a conversation</h2><p className="mt-2 text-sm leading-6 text-slate-500">Select someone from your inbox, or start a new chat from their profile.</p></div> : !activeConversation && !inboxQuery.isLoading ? <div className="m-auto max-w-sm p-8 text-center"><h2 className="text-xl font-bold text-slate-950">Conversation unavailable</h2><p className="mt-2 text-sm text-slate-500">It may have been deleted from your inbox or you may not have access.</p><button type="button" onClick={() => navigate("/messages")} className="yapster-button yapster-button--primary mt-5">Back to inbox</button></div> : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
                  <button type="button" onClick={() => navigate("/messages")} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 lg:hidden" aria-label="Back to inbox">←</button>
                  {partnerAvatar ? <img src={partnerAvatar} alt="" className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-semibold text-violet-700">{partnerName.slice(0,1).toUpperCase()}</span>}
                  <div className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold text-slate-950">{partnerName}</strong>{partnerUsername && <Link to={`/profile/${encodeURIComponent(partnerUsername)}`} className="text-xs font-medium text-violet-700">@{partnerUsername}</Link>}</div>
                </div>

                {interactionBlocked && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">{blockQuery.data?.blockedByMe ? `You blocked @${partnerUsername || "this user"}. Unblock them from their profile to message again.` : "Messaging is unavailable between these users."}</div>}

                <div className="flex-1 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6">
                  {messagesQuery.isLoading ? <p className="text-center text-sm text-slate-400">Loading messages...</p> : messagesQuery.error ? <p className="text-center text-sm text-red-600">Messages could not be loaded.</p> : messages.length ? (
                    <div className="space-y-3">{messages.map((message) => {
                      const own = message.sender_id === user.id;
                      const deleted = Boolean(message.deleted_at);
                      const editing = editingMessageId === message.id;
                      const parent = message.replied_to_message_id ? messageById.get(message.replied_to_message_id) : null;
                      return <div key={message.id} className={`yapster-message-row group flex items-center gap-2 ${own ? "justify-end" : "justify-start"}`}>
                        {own && renderMessageActions(message, true)}
                        <div className="max-w-[82%] sm:max-w-[72%]">
                          {editing ? <form onSubmit={(event) => { event.preventDefault(); editMutation.mutate(); }} className="rounded-2xl border border-violet-200 bg-white p-2 shadow-sm"><textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={2} maxLength={4000} autoFocus className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-normal text-slate-800 outline-none focus:border-violet-300" /><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => { setEditingMessageId(null); setEditText(""); }} className="text-xs font-medium text-slate-500">Cancel</button><button type="submit" disabled={!editText.trim() || editMutation.isPending} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{editMutation.isPending ? "Saving..." : "Save"}</button></div></form> : <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${own ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
                            {message.replied_to_message_id && <div className={`mb-2 rounded-lg border-l-2 px-2.5 py-1.5 text-[11px] leading-4 ${own ? "border-white/45 bg-white/10 text-white/75" : "border-violet-300 bg-slate-50 text-slate-500"}`}><span className="block font-semibold">{parent ? (parent.sender_id === user.id ? "You" : partnerName) : "Original message"}</span><span className="block max-w-[260px] truncate">{parent ? (parent.deleted_at ? "Message deleted" : parent.body) : "Message unavailable"}</span></div>}
                            <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${deleted ? "italic opacity-65" : ""}`}>{deleted ? "Message deleted" : message.body}</p><div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] font-medium ${own ? "text-white/70" : "text-slate-400"}`}><span>{formatMessageTime(message.created_at)}</span>{message.edited_at && !deleted && <span>edited</span>}{copiedMessageId === message.id && <span>copied</span>}{own && <span title={message.read_at ? "Read" : "Sent"} className="text-[12px] tracking-[-0.16em]">{message.read_at ? "✓✓" : "✓"}</span>}</div>
                          </div>}
                          {!deleted && groupedReactions(message.id).length > 0 && <div className={`mt-1 flex flex-wrap gap-1 ${own ? "justify-end" : "justify-start"}`}>{groupedReactions(message.id).map(([emoji, rows]) => { const mine = rows.some((row) => row.user_id === user.id); return <button key={emoji} type="button" onClick={() => reactionMutation.mutate({ messageId: message.id, emoji })} className={`rounded-full border px-1.5 py-0.5 text-xs transition ${mine ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`}>{emoji}{rows.length > 1 ? <span className="ml-1 text-[10px] text-slate-400">{rows.length}</span> : null}</button>; })}</div>}
                        </div>
                        {!own && renderMessageActions(message, false)}
                      </div>;
                    })}</div>
                  ) : <div className="mx-auto mt-24 max-w-sm text-center"><p className="font-semibold text-slate-800">Start the conversation</p><p className="mt-1 text-sm text-slate-400">Send a message to {partnerName}.</p></div>}
                </div>

                <form className="border-t border-slate-200 bg-white p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); if (!sendMutation.isPending && composer.trim() && !interactionBlocked) sendMutation.mutate(); }}>
                  {mutationError && <p className="mb-2 text-xs font-medium text-red-600">{getFriendlyErrorMessage(mutationError, "Message action failed.")}</p>}
                  {replyTarget && <div className="mb-2 flex items-start justify-between gap-3 rounded-xl bg-slate-100 px-3 py-2"><div className="min-w-0"><span className="text-[11px] font-semibold text-violet-600">Replying to {replyTarget.sender_id === user.id ? "yourself" : partnerName}</span><p className="mt-0.5 truncate text-xs text-slate-500">{replyTarget.body}</p></div><button type="button" onClick={() => setReplyTarget(null)} className="text-sm text-slate-400 hover:text-slate-700" aria-label="Cancel reply">×</button></div>}
                  <div className="flex items-end gap-2">
                    <div className="relative" data-chat-popover><button type="button" onClick={() => setEmojiPickerOpen((current) => !current)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label="Add emoji"><SmileIcon /></button>{emojiPickerOpen && <div className="absolute bottom-13 left-0 z-50 grid w-56 grid-cols-6 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">{COMPOSER_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => { setComposer((current) => `${current}${emoji}`); setEmojiPickerOpen(false); }} className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-slate-100">{emoji}</button>)}</div>}</div>
                    <textarea value={composer} onChange={(event) => setComposer(event.target.value)} rows={1} maxLength={4000} disabled={interactionBlocked} placeholder={interactionBlocked ? "Messaging unavailable" : `Message ${partnerName}`} className="min-h-11 max-h-32 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-normal text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60 disabled:cursor-not-allowed disabled:opacity-50" /><button type="submit" disabled={!composer.trim() || sendMutation.isPending || interactionBlocked} className="yapster-button yapster-button--primary min-h-11 disabled:cursor-not-allowed disabled:opacity-50">{sendMutation.isPending ? "Sending..." : "Send"}</button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog open={deleteMessageId != null} title="Delete message?" description="This message will be replaced with “Message deleted” for both people. This cannot be undone." confirmLabel="Delete message" isPending={deleteMessageMutation.isPending} onCancel={() => setDeleteMessageId(null)} onConfirm={() => deleteMessageMutation.mutate()} />
      <ConfirmDialog open={hideMessageId != null} title="Delete this message for you?" description="The message will disappear from your chat only. The other person will still have their copy." confirmLabel="Delete for me" isPending={hideMessageMutation.isPending} onCancel={() => setHideMessageId(null)} onConfirm={() => hideMessageMutation.mutate()} />
      <ConfirmDialog open={!!pendingChatAction} title={pendingChatAction?.kind === "block" ? `Block ${pendingChatAction.partnerName}?` : pendingChatAction?.kind === "clear" ? "Clear this chat?" : "Delete chat from your inbox?"} description={pendingChatAction?.kind === "block" ? "You will stop following each other and neither of you will be able to send new messages until you unblock them." : pendingChatAction?.kind === "clear" ? "Existing messages will be hidden for you. The conversation stays in your Inbox and new messages will still appear." : "This hides the conversation from your Inbox. It does not delete the other person’s history. A future message can make the chat appear again."} confirmLabel={pendingChatAction?.kind === "block" ? "Block" : pendingChatAction?.kind === "clear" ? "Clear chat" : "Delete chat"} isPending={chatActionMutation.isPending} onCancel={() => setPendingChatAction(null)} onConfirm={() => pendingChatAction && chatActionMutation.mutate(pendingChatAction)} />

      {reportTarget && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Report message"><form onSubmit={(event) => { event.preventDefault(); reportMutation.mutate(); }} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Report message</h2><p className="mt-1 text-sm leading-5 text-slate-500">This report is stored for Yapster administration to review.</p></div><button type="button" onClick={() => { setReportTarget(null); setReportDetails(""); }} className="text-xl text-slate-400 hover:text-slate-700" aria-label="Close report dialog">×</button></div><label className="mt-5 block text-sm font-semibold text-slate-700">Reason<select value={reportReason} onChange={(event) => setReportReason(event.target.value as ReportReason)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-violet-300">{REPORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="mt-4 block text-sm font-semibold text-slate-700">Details <span className="font-normal text-slate-400">· optional</span><textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1200} rows={4} placeholder="Add context for the administrator..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-violet-300" /></label>{reportMutation.error && <p className="mt-3 text-xs text-red-600">{getFriendlyErrorMessage(reportMutation.error, "This message could not be reported. It may already be reported by you.")}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setReportTarget(null); setReportDetails(""); }} className="yapster-button yapster-button--ghost">Cancel</button><button type="submit" disabled={reportMutation.isPending} className="yapster-button yapster-button--primary disabled:opacity-50">{reportMutation.isPending ? "Reporting..." : "Submit report"}</button></div></form></div>}
    </main>
  );
};
