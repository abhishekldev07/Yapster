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
}

interface InboxConversation extends ConversationRow {
  partner: ProfileSummary | null;
  latestMessage: MessageRow | null;
  unreadCount: number;
}

interface BlockState {
  blockedByMe: boolean;
  blockedMe: boolean;
}

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const fetchInbox = async (userId: string): Promise<InboxConversation[]> => {
  const [{ data: conversations, error: conversationError }, { data: states, error: stateError }] = await Promise.all([
    supabase.from("direct_conversations").select("id, user_low, user_high, created_at, last_message_at").or(`user_low.eq.${userId},user_high.eq.${userId}`).order("last_message_at", { ascending: false }),
    supabase.from("direct_conversation_states").select("conversation_id, hidden_at").eq("user_id", userId),
  ]);
  if (conversationError) throw new Error(conversationError.message);
  if (stateError) throw new Error(stateError.message);

  const hiddenMap = new Map<number, number>((states ?? []).map((row) => [Number(row.conversation_id), new Date(row.hidden_at).getTime()]));
  const rows = ((conversations ?? []) as ConversationRow[]).filter((row) => {
    const hiddenAt = hiddenMap.get(row.id);
    return hiddenAt == null || new Date(row.last_message_at).getTime() > hiddenAt;
  });
  if (!rows.length) return [];

  const partnerIds = Array.from(new Set(rows.map((row) => row.user_low === userId ? row.user_high : row.user_low)));
  const conversationIds = rows.map((row) => row.id);
  const [{ data: profiles, error: profileError }, { data: messages, error: messageError }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", partnerIds),
    supabase.from("direct_messages").select("id, conversation_id, sender_id, body, created_at, read_at, edited_at, deleted_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(500),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (messageError) throw new Error(messageError.message);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile as ProfileSummary]));
  const latestMap = new Map<number, MessageRow>();
  const unreadMap = new Map<number, number>();
  ((messages ?? []) as MessageRow[]).forEach((message) => {
    if (!latestMap.has(message.conversation_id)) latestMap.set(message.conversation_id, message);
    if (message.sender_id !== userId && !message.read_at) unreadMap.set(message.conversation_id, (unreadMap.get(message.conversation_id) ?? 0) + 1);
  });

  return rows.map((row) => {
    const partnerId = row.user_low === userId ? row.user_high : row.user_low;
    return { ...row, partner: profileMap.get(partnerId) ?? null, latestMessage: latestMap.get(row.id) ?? null, unreadCount: unreadMap.get(row.id) ?? 0 };
  });
};

const fetchConversationMessages = async (conversationId: number): Promise<MessageRow[]> => {
  const { data, error } = await supabase.from("direct_messages").select("id, conversation_id, sender_id, body, created_at, read_at, edited_at, deleted_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as MessageRow[];
};

const fetchBlockState = async (userId: string, otherUserId: string): Promise<BlockState> => {
  const { data, error } = await supabase.from("user_blocks").select("blocker_id, blocked_id").or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`);
  if (error) throw new Error(error.message);
  return {
    blockedByMe: (data ?? []).some((row) => row.blocker_id === userId && row.blocked_id === otherUserId),
    blockedMe: (data ?? []).some((row) => row.blocker_id === otherUserId && row.blocked_id === userId),
  };
};

const ChatIcon = () => <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M5 5.5h14A2.5 2.5 0 0 1 21.5 8v7A2.5 2.5 0 0 1 19 17.5h-7L6 21v-3.5H5A2.5 2.5 0 0 1 2.5 15V8A2.5 2.5 0 0 1 5 5.5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export const MessagesPage = () => {
  const { conversationId: conversationParam } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [composer, setComposer] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteMessageId, setDeleteMessageId] = useState<number | null>(null);
  const [deleteChatOpen, setDeleteChatOpen] = useState(false);
  const activeConversationId = conversationParam ? Number(conversationParam) : null;

  const inboxQuery = useQuery<InboxConversation[], Error>({ queryKey: ["message-inbox", user?.id], queryFn: () => user ? fetchInbox(user.id) : [], enabled: !!user, retry: false, staleTime: 8_000 });
  const messagesQuery = useQuery<MessageRow[], Error>({ queryKey: ["direct-messages", activeConversationId], queryFn: () => activeConversationId ? fetchConversationMessages(activeConversationId) : [], enabled: !!user && !!activeConversationId && Number.isFinite(activeConversationId), retry: false, staleTime: 4_000 });
  const activeConversation = useMemo(() => (inboxQuery.data ?? []).find((conversation) => conversation.id === activeConversationId) ?? null, [activeConversationId, inboxQuery.data]);
  const partnerId = activeConversation?.partner?.id || null;

  const blockQuery = useQuery<BlockState>({
    queryKey: ["message-block-state", user?.id, partnerId],
    queryFn: () => user && partnerId ? fetchBlockState(user.id, partnerId) : { blockedByMe: false, blockedMe: false },
    enabled: !!user && !!partnerId,
    retry: false,
    staleTime: 8_000,
  });

  useEffect(() => {
    if (!user || !activeConversationId || !Number.isFinite(activeConversationId)) return;
    const channel = supabase.channel(`direct-messages:${activeConversationId}:${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${activeConversationId}` }, () => {
      queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ["message-inbox", user.id] });
      queryClient.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeConversationId, queryClient, user]);

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
      queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversationId] }),
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
      const { error } = await supabase.from("direct_messages").insert({ conversation_id: activeConversationId, sender_id: user.id, body });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setComposer(""); await refreshMessages(); },
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

  const deleteChatMutation = useMutation({
    mutationFn: async () => {
      if (!user || !activeConversationId) throw new Error("Open a conversation first.");
      const { error } = await supabase.from("direct_conversation_states").upsert({ conversation_id: activeConversationId, user_id: user.id, hidden_at: new Date().toISOString() }, { onConflict: "conversation_id,user_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setDeleteChatOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["message-inbox", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["messages-unread-count", user?.id] });
      navigate("/messages");
    },
  });

  const unreadQuery = useQuery<number, Error>({ queryKey: ["messages-unread-count", user?.id], queryFn: () => user ? fetchUnreadMessageCount(user.id) : 0, enabled: !!user, retry: false, staleTime: 8_000 });

  if (!user) return <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4"><div className="mx-auto max-w-2xl px-4 sm:px-6"><section className="yapster-card p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ChatIcon /></div><h1 className="mt-5 text-2xl font-black text-slate-950">Private conversations</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Sign in to message other Yapster members one-to-one.</p><Link to="/login" className="yapster-button yapster-button--primary mt-5">Sign in</Link></section></div></main>;

  const conversations = inboxQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const partnerName = activeConversation?.partner?.display_name?.trim() || activeConversation?.partner?.username?.trim() || "Yapster member";
  const partnerUsername = activeConversation?.partner?.username?.trim() || null;
  const partnerAvatar = activeConversation?.partner?.avatar_url || null;
  const interactionBlocked = Boolean(blockQuery.data?.blockedByMe || blockQuery.data?.blockedMe);
  const mutationError = sendMutation.error || editMutation.error || deleteMessageMutation.error || deleteChatMutation.error;

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">Private</p><h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">Messages</h1><p className="mt-2 text-sm text-slate-500">One-to-one conversations between Yapster members.</p></div>{(unreadQuery.data ?? 0) > 0 && <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-extrabold text-violet-700">{unreadQuery.data} unread</span>}</header>

        <div className="grid min-h-[620px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className={`border-slate-200 bg-slate-50/60 lg:border-r ${activeConversationId ? "hidden lg:block" : "block"}`}>
            <div className="border-b border-slate-200 px-4 py-4"><h2 className="text-sm font-black text-slate-950">Inbox</h2><p className="mt-1 text-xs text-slate-400">Start a chat from someone&apos;s profile.</p></div>
            {inboxQuery.isLoading ? <div className="space-y-2 p-3">{[0,1,2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div> : inboxQuery.error ? <p className="p-5 text-sm text-red-600">Inbox could not be loaded.</p> : conversations.length ? (
              <div className="max-h-[555px] overflow-y-auto p-2.5">{conversations.map((conversation) => {
                const name = conversation.partner?.display_name?.trim() || conversation.partner?.username?.trim() || "Yapster member";
                const avatar = conversation.partner?.avatar_url || null;
                const selected = conversation.id === activeConversationId;
                const preview = conversation.latestMessage?.deleted_at ? "Message deleted" : conversation.latestMessage?.body || "Start the conversation";
                return <button key={conversation.id} type="button" onClick={() => navigate(`/messages/${conversation.id}`)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${selected ? "bg-violet-50 ring-1 ring-violet-100" : "hover:bg-white"}`}>
                  {avatar ? <img src={avatar} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-black text-violet-700 ring-1 ring-violet-100">{name.slice(0,1).toUpperCase()}</span>}
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm font-extrabold text-slate-900">{name}</strong><time className="shrink-0 text-[10px] font-semibold text-slate-400">{formatMessageTime(conversation.latestMessage?.created_at || conversation.last_message_at)}</time></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{preview}</span>{conversation.unreadCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-black text-white">{conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}</span>}</span></span>
                </button>;
              })}</div>
            ) : <div className="p-8 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ChatIcon /></div><p className="mt-4 text-sm font-extrabold text-slate-800">No conversations yet</p><p className="mt-1 text-xs leading-5 text-slate-400">Visit a member profile and choose Message.</p><Link to="/search" className="mt-4 inline-flex text-xs font-extrabold text-violet-700">Find people</Link></div>}
          </aside>

          <section className={`${activeConversationId ? "flex" : "hidden lg:flex"} min-w-0 flex-col bg-white`}>
            {!activeConversationId ? <div className="m-auto max-w-sm p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ChatIcon /></div><h2 className="mt-4 text-xl font-black text-slate-950">Choose a conversation</h2><p className="mt-2 text-sm leading-6 text-slate-500">Select someone from your inbox, or start a new chat from their profile.</p></div> : !activeConversation && !inboxQuery.isLoading ? <div className="m-auto max-w-sm p-8 text-center"><h2 className="text-xl font-black text-slate-950">Conversation unavailable</h2><p className="mt-2 text-sm text-slate-500">It may have been deleted from your inbox or you may not have access.</p><button type="button" onClick={() => navigate("/messages")} className="yapster-button yapster-button--primary mt-5">Back to inbox</button></div> : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
                  <button type="button" onClick={() => navigate("/messages")} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 lg:hidden" aria-label="Back to inbox">←</button>
                  {partnerAvatar ? <img src={partnerAvatar} alt="" className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-black text-violet-700">{partnerName.slice(0,1).toUpperCase()}</span>}
                  <div className="min-w-0 flex-1"><strong className="block truncate text-sm font-black text-slate-950">{partnerName}</strong>{partnerUsername && <Link to={`/profile/${encodeURIComponent(partnerUsername)}`} className="text-xs font-semibold text-violet-700">@{partnerUsername}</Link>}</div>
                  <button type="button" onClick={() => setDeleteChatOpen(true)} className="rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-red-600 transition hover:bg-red-50">Delete chat</button>
                </div>

                {interactionBlocked && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">{blockQuery.data?.blockedByMe ? `You blocked @${partnerUsername || "this user"}. Unblock them from their profile to message again.` : "Messaging is unavailable between these users."}</div>}

                <div className="flex-1 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6">
                  {messagesQuery.isLoading ? <p className="text-center text-sm text-slate-400">Loading messages...</p> : messagesQuery.error ? <p className="text-center text-sm text-red-600">Messages could not be loaded.</p> : messages.length ? (
                    <div className="space-y-3">{messages.map((message) => {
                      const own = message.sender_id === user.id;
                      const deleted = Boolean(message.deleted_at);
                      const editing = editingMessageId === message.id;
                      return <div key={message.id} className={`group flex ${own ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[82%]">
                          {editing ? <form onSubmit={(event) => { event.preventDefault(); editMutation.mutate(); }} className="rounded-2xl border border-violet-200 bg-white p-2 shadow-sm"><textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={2} maxLength={4000} autoFocus className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-normal text-slate-800 outline-none focus:border-violet-300" /><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => { setEditingMessageId(null); setEditText(""); }} className="text-xs font-extrabold text-slate-500">Cancel</button><button type="submit" disabled={!editText.trim() || editMutation.isPending} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-50">{editMutation.isPending ? "Saving..." : "Save"}</button></div></form> : <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${own ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}><p className={`whitespace-pre-wrap break-words text-sm leading-6 ${deleted ? "italic opacity-65" : ""}`}>{deleted ? "Message deleted" : message.body}</p><div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] font-semibold ${own ? "text-white/70" : "text-slate-400"}`}><span>{formatMessageTime(message.created_at)}</span>{message.edited_at && !deleted && <span>edited</span>}{own && <span title={message.read_at ? "Read" : "Sent"} className="text-[12px] tracking-[-0.16em]">{message.read_at ? "✓✓" : "✓"}</span>}</div></div>}
                          {own && !deleted && !editing && <div className="mt-1 flex justify-end gap-2 opacity-70 transition group-hover:opacity-100"><button type="button" onClick={() => { setEditingMessageId(message.id); setEditText(message.body); }} className="text-[10px] font-extrabold text-slate-500 hover:text-violet-700">Edit</button><button type="button" onClick={() => setDeleteMessageId(message.id)} className="text-[10px] font-extrabold text-red-500 hover:text-red-700">Delete</button></div>}
                        </div>
                      </div>;
                    })}</div>
                  ) : <div className="mx-auto mt-24 max-w-sm text-center"><p className="font-extrabold text-slate-800">Start the conversation</p><p className="mt-1 text-sm text-slate-400">Send a message to {partnerName}.</p></div>}
                </div>

                <form className="border-t border-slate-200 bg-white p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); if (!sendMutation.isPending && composer.trim() && !interactionBlocked) sendMutation.mutate(); }}>
                  {mutationError && <p className="mb-2 text-xs font-semibold text-red-600">{getFriendlyErrorMessage(mutationError, "Message action failed.")}</p>}
                  <div className="flex items-end gap-2"><textarea value={composer} onChange={(event) => setComposer(event.target.value)} rows={1} maxLength={4000} disabled={interactionBlocked} placeholder={interactionBlocked ? "Messaging unavailable" : `Message ${partnerName}`} className="min-h-11 max-h-32 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-normal text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60 disabled:cursor-not-allowed disabled:opacity-50" /><button type="submit" disabled={!composer.trim() || sendMutation.isPending || interactionBlocked} className="yapster-button yapster-button--primary min-h-11 disabled:cursor-not-allowed disabled:opacity-50">{sendMutation.isPending ? "Sending..." : "Send"}</button></div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog open={deleteMessageId != null} title="Delete message?" description="This message will be replaced with “Message deleted” for both people. This cannot be undone." confirmLabel="Delete message" isPending={deleteMessageMutation.isPending} onCancel={() => setDeleteMessageId(null)} onConfirm={() => deleteMessageMutation.mutate()} />
      <ConfirmDialog open={deleteChatOpen} title="Delete chat from your inbox?" description="This hides the conversation for you only. It does not delete the other person’s copy. If a new message arrives later, the conversation can appear again." confirmLabel="Delete chat" isPending={deleteChatMutation.isPending} onCancel={() => setDeleteChatOpen(false)} onConfirm={() => deleteChatMutation.mutate()} />
    </main>
  );
};
