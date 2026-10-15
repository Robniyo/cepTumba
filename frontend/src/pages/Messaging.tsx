import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Send,
  Plus,
  MessageSquare,
  Users,
  ShieldCheck,
  ArrowLeft,
  X,
  Paperclip,
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { ROLE_SHORT } from "@/lib/roles";
import {
  Conversation,
  ChatMessage,
  AllowedUser,
  MessageAttachment,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ALLOWED_MIME,
  ATTACHMENT_MAX_BYTES,
  fetchConversations,
  fetchMessages,
  sendMessage,
  markConversationRead,
  startDirectChat,
  fetchAllowedUsers,
  uploadAttachment,
  editMessage as apiEditMessage,
  deleteMessage as apiDeleteMessage,
} from "@/data/messagingStore";
import { useMessagingSocket } from "@/hooks/useMessagingSocket";
import { toast } from "sonner";

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const conversationTitle = (c: Conversation): string => {
  if (c.isSystem) return c.name ?? (c.systemGroupType === "leaders" ? "Leaders Group" : "Alumni Group");
  if (c.type === "direct") return c.peer?.name ?? "Direct chat";
  return c.name ?? "Group";
};

const conversationSubtitle = (c: Conversation): string => {
  if (c.isSystem) return `${c.participantsCount} members`;
  if (c.type === "direct" && c.peer) return ROLE_SHORT[c.peer.role] ?? c.peer.role;
  return `${c.participantsCount} members`;
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
};

const Messaging = () => {
  const { accessToken, user, isReady } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const refreshConversations = useCallback(async () => {
    if (!accessToken) return;
    try {
      const items = await fetchConversations(accessToken);
      setConversations(items);
    } catch (err) {
      console.error("Failed to load conversations", err);
    }
  }, [accessToken]);

  // Initial conversation load
  useEffect(() => {
    if (!isReady || !accessToken) return;
    void refreshConversations();
  }, [isReady, accessToken, refreshConversations]);

  // Load messages for active conversation
  useEffect(() => {
    if (!accessToken || !activeId) return;
    let cancelled = false;
    setLoadingMessages(true);
    (async () => {
      try {
        const items = await fetchMessages(accessToken, activeId, { limit: 100 });
        if (!cancelled) setMessages(items);
        await markConversationRead(accessToken, activeId);
        if (!cancelled) {
          setConversations((prev) =>
            prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)),
          );
        }
      } catch (err) {
        console.error("Failed to load messages", err);
        if (!cancelled) toast.error("Failed to load messages");
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  // Realtime
  const { emitTyping } = useMessagingSocket(accessToken, {
    onMessage: (msg) => {
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessage: {
                  id: msg.id,
                  body: msg.body,
                  senderId: msg.senderId,
                  senderName: msg.senderName,
                  createdAt: msg.createdAt,
                  type: msg.type,
                },
                lastMessageAt: msg.createdAt,
                unreadCount:
                  msg.conversationId === activeId || msg.senderId === user?.id
                    ? c.unreadCount
                    : c.unreadCount + 1,
              }
            : c,
        );
        // Move conversation to top
        next.sort(
          (a, b) =>
            new Date(b.lastMessageAt ?? b.createdAt).getTime() -
            new Date(a.lastMessageAt ?? a.createdAt).getTime(),
        );
        return next;
      });
      if (msg.conversationId === activeId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (accessToken) void markConversationRead(accessToken, msg.conversationId);
      }
    },
    onMessageUpdate: (msg) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId && c.lastMessage?.id === msg.id
            ? { ...c, lastMessage: { ...c.lastMessage, body: msg.body } }
            : c,
        ),
      );
    },
    onMessageDelete: (msg) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId && c.lastMessage?.id === msg.id
            ? { ...c, lastMessage: { ...c.lastMessage, body: "Message deleted" } }
            : c,
        ),
      );
    },
    onTyping: (p) => {
      if (p.conversationId !== activeId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (p.isTyping) next[p.userId] = Date.now();
        else delete next[p.userId];
        return next;
      });
    },
  });

  // Cleanup stale typing
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const next: Record<string, number> = {};
        const now = Date.now();
        for (const [uid, ts] of Object.entries(prev)) {
          if (now - ts < 4000) next[uid] = ts;
        }
        return next;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleFilePicked = async (file: File | null) => {
    if (!file || !accessToken) return;
    if (!ATTACHMENT_ALLOWED_MIME.has(file.type)) {
      toast.error("Only JPG, PNG, PDF, and MP3 files are allowed");
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast.error("File exceeds the 5MB limit");
      return;
    }
    setUploading(true);
    try {
      const att = await uploadAttachment(accessToken, file);
      setPendingAttachment(att);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload attachment");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleEditMessage = async (messageId: string, body: string) => {
    if (!accessToken) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      const msg = await apiEditMessage(accessToken, messageId, trimmed);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setEditingId(null);
      setEditingDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to edit message");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!accessToken) return;
    if (!confirm("Delete this message? This cannot be undone.")) return;
    try {
      const msg = await apiDeleteMessage(accessToken, messageId);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete message");
    }
  };

  const handleSend = async () => {
    if (!accessToken || !activeId) return;
    const body = draft.trim();
    if (!body && !pendingAttachment) return;
    setSending(true);
    try {
      const msg = await sendMessage(accessToken, activeId, {
        body,
        attachment: pendingAttachment,
      });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setDraft("");
      setPendingAttachment(null);
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                lastMessage: {
                  id: msg.id,
                  body: msg.body,
                  senderId: msg.senderId,
                  senderName: msg.senderName,
                  createdAt: msg.createdAt,
                  type: msg.type,
                },
                lastMessageAt: msg.createdAt,
              }
            : c,
        );
        next.sort(
          (a, b) =>
            new Date(b.lastMessageAt ?? b.createdAt).getTime() -
            new Date(a.lastMessageAt ?? a.createdAt).getTime(),
        );
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // Allowed users for new chat
  useEffect(() => {
    if (!accessToken || !newChatOpen) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const items = await fetchAllowedUsers(accessToken, newChatSearch);
        if (!cancelled) setAllowedUsers(items);
      } catch {
        if (!cancelled) setAllowedUsers([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [accessToken, newChatOpen, newChatSearch]);

  const handleStartDirect = async (targetId: string) => {
    if (!accessToken) return;
    try {
      const conv = await startDirectChat(accessToken, targetId);
      setNewChatOpen(false);
      setNewChatSearch("");
      await refreshConversations();
      setActiveId(conv.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start chat");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const title = conversationTitle(c).toLowerCase();
      const last = c.lastMessage?.body.toLowerCase() ?? "";
      return title.includes(q) || last.includes(q);
    });
  }, [conversations, search]);

  const systemGroups = filtered.filter((c) => c.isSystem);
  const directs = filtered.filter((c) => !c.isSystem);

  // Group messages by day
  const grouped = useMemo(() => {
    const groups: { day: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === label) last.items.push(m);
      else groups.push({ day: label, items: [m] });
    }
    return groups;
  }, [messages]);

  const participantIdsForActive = useMemo(() => {
    if (!activeConversation) return [] as string[];
    if (activeConversation.peer) return [activeConversation.peer.id];
    return []; // group participant IDs would require an extra fetch; typing optional for groups
  }, [activeConversation]);

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 sm:-my-8 h-[calc(100vh-4rem)]">
      <div className="flex h-full overflow-hidden border-y border-border bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex w-full flex-col border-r border-border bg-card md:w-80 lg:w-96",
            activeId && "hidden md:flex",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="font-display text-lg font-bold">Messages</h2>
            <Button size="sm" variant="ghost" onClick={() => setNewChatOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats..."
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {systemGroups.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    System Groups
                  </div>
                  {systemGroups.map((c) => (
                    <ConversationItem
                      key={c.id}
                      conversation={c}
                      active={c.id === activeId}
                      onClick={() => setActiveId(c.id)}
                    />
                  ))}
                </div>
              )}
              <div>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Direct Chats
                </div>
                {directs.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No conversations yet.
                  </div>
                )}
                {directs.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onClick={() => setActiveId(c.id)}
                  />
                ))}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Main panel */}
        <section className={cn("flex flex-1 flex-col bg-muted/30", !activeId && "hidden md:flex")}> 
          {!activeConversation ? (
            <EmptyState />
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
                <button
                  className="md:hidden"
                  onClick={() => setActiveId(null)}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <ConversationAvatar conversation={activeConversation} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display font-semibold">
                      {conversationTitle(activeConversation)}
                    </h3>
                    {activeConversation.isSystem && (
                      <Badge variant="secondary" className="text-[10px]">System</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Object.keys(typingUsers).length > 0
                      ? "typing..."
                      : conversationSubtitle(activeConversation)}
                  </div>
                </div>
              </header>

              <ScrollArea className="flex-1">
                <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
                  {loadingMessages ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" />
                      ))}
                    </div>
                  ) : grouped.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground">
                      No messages yet. Say hello!
                    </div>
                  ) : (
                    grouped.map((group) => (
                      <div key={group.day} className="space-y-2">
                        <div className="my-3 flex items-center justify-center">
                          <span className="rounded-full bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
                            {group.day}
                          </span>
                        </div>
                        {group.items.map((m) => (
                          <MessageBubble
                            key={m.id}
                            message={m}
                            isOwn={m.senderId === user?.id}
                            showSender={activeConversation.type === "group" || activeConversation.isSystem}
                            isEditing={editingId === m.id}
                            editingDraft={editingDraft}
                            onStartEdit={() => {
                              setEditingId(m.id);
                              setEditingDraft(m.body);
                            }}
                            onCancelEdit={() => {
                              setEditingId(null);
                              setEditingDraft("");
                            }}
                            onChangeEdit={setEditingDraft}
                            onSaveEdit={() => void handleEditMessage(m.id, editingDraft)}
                            onDelete={() => void handleDeleteMessage(m.id)}
                          />
                        ))}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <footer className="border-t border-border bg-card p-3">
                <div className="mx-auto max-w-3xl space-y-2">
                  {pendingAttachment && (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
                      <AttachmentPreviewChip attachment={pendingAttachment} />
                      <button
                        type="button"
                        onClick={() => setPendingAttachment(null)}
                        className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      className="hidden"
                      onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      disabled={uploading || sending}
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Attach file"
                    >
                      <Paperclip className={cn("h-4 w-4", uploading && "animate-pulse")} />
                    </Button>
                    <Input
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (activeId && participantIdsForActive.length > 0) {
                          emitTyping(activeId, participantIdsForActive, e.target.value.length > 0);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder={pendingAttachment ? "Add a caption (optional)..." : "Type a message..."}
                      disabled={sending}
                      className="rounded-full"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={sending || (!draft.trim() && !pendingAttachment)}
                      size="icon"
                      className="rounded-full"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a new chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={newChatSearch}
                onChange={(e) => setNewChatSearch(e.target.value)}
                placeholder="Search by name or email"
                className="pl-9"
              />
            </div>
            <ScrollArea className="max-h-80">
              <div className="space-y-1">
                {allowedUsers.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No users found.
                  </div>
                ) : (
                  allowedUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleStartDirect(u.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initialsOf(u.display_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{u.display_name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {ROLE_SHORT[u.role] ?? u.role} · {u.email}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const EmptyState = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      <MessageSquare className="h-8 w-8" />
    </div>
    <h3 className="font-display text-lg font-semibold">Your fellowship messages</h3>
    <p className="max-w-md text-sm text-muted-foreground">
      Select a conversation on the left or start a new chat. Use the Leaders or Alumni groups for
      community-wide announcements.
    </p>
  </div>
);

interface ConversationItemProps {
  conversation: Conversation;
  active: boolean;
  onClick: () => void;
}

const ConversationItem = ({ conversation, active, onClick }: ConversationItemProps) => {
  const title = conversationTitle(conversation);
  const preview = conversation.lastMessage?.body ?? "No messages yet";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <ConversationAvatar conversation={conversation} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {conversation.lastMessageAt && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatTime(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{preview}</span>
          {conversation.unreadCount > 0 && (
            <Badge className="h-5 min-w-[1.25rem] justify-center rounded-full px-1.5 text-[10px]">
              {conversation.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
};

const ConversationAvatar = ({ conversation }: { conversation: Conversation }) => {
  if (conversation.isSystem) {
    const Icon = conversation.systemGroupType === "leaders" ? ShieldCheck : Users;
    return (
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          conversation.systemGroupType === "leaders"
            ? "bg-primary/10 text-primary"
            : "bg-emerald-500/10 text-emerald-600",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
    );
  }
  const name = conversation.peer?.name ?? conversation.name ?? "?";
  return (
    <Avatar className="h-10 w-10">
      <AvatarFallback>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
};

interface BubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showSender: boolean;
  isEditing: boolean;
  editingDraft: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageType = (type: string) => type.startsWith("image/");
const isAudioType = (type: string) => type.startsWith("audio/");
const isPdfType = (type: string) => type === "application/pdf";

const AttachmentPreviewChip = ({ attachment }: { attachment: MessageAttachment }) => {
  const Icon = isImageType(attachment.type)
    ? FileText
    : isAudioType(attachment.type)
      ? FileText
      : FileText;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {isImageType(attachment.type) ? (
        <img
          src={attachment.url}
          alt={attachment.name}
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{attachment.name}</div>
        <div className="text-xs text-muted-foreground">{formatBytes(attachment.size)}</div>
      </div>
    </div>
  );
};

const AttachmentBlock = ({
  attachment,
  isOwn,
}: {
  attachment: MessageAttachment;
  isOwn: boolean;
}) => {
  if (isImageType(attachment.type)) {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-72 w-full rounded-lg object-cover"
        />
      </a>
    );
  }
  if (isAudioType(attachment.type)) {
    return (
      <audio
        controls
        src={attachment.url}
        className="w-full"
        preload="metadata"
      />
    );
  }
  // PDF / fallback
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
        isOwn
          ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20"
          : "border-border bg-muted/40 hover:bg-muted",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md",
          isOwn ? "bg-primary-foreground/20" : "bg-primary/10 text-primary",
        )}
      >
        {isPdfType(attachment.type) ? <FileText className="h-5 w-5" /> : <Paperclip className="h-5 w-5" />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{attachment.name}</div>
        <div className={cn("text-xs", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {formatBytes(attachment.size)}
        </div>
      </div>
    </a>
  );
};

const MessageBubble = ({
  message,
  isOwn,
  showSender,
  isEditing,
  editingDraft,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onDelete,
}: BubbleProps) => {
  const isDeleted = !!message.deletedAt;
  return (
    <div className={cn("group flex gap-2", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && (
        <Avatar className="h-8 w-8 self-end">
          <AvatarFallback className="text-[10px]">
            {initialsOf(message.senderName ?? "?")}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="relative max-w-[75%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-2 shadow-sm",
            isOwn
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-card text-foreground",
            isDeleted && "italic opacity-70",
          )}
        >
          {!isOwn && showSender && message.senderName && (
            <div className="mb-0.5 text-[11px] font-semibold text-primary">{message.senderName}</div>
          )}

          {isDeleted ? (
            <div className="text-sm">This message was deleted</div>
          ) : isEditing ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={editingDraft}
                onChange={(e) => onChangeEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSaveEdit();
                  } else if (e.key === "Escape") {
                    onCancelEdit();
                  }
                }}
                className="w-full resize-none rounded-md border border-primary-foreground/30 bg-primary-foreground/10 p-2 text-sm text-primary-foreground placeholder:text-primary-foreground/60 focus:outline-none"
                rows={2}
              />
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={onCancelEdit}
                  className="rounded-md px-2 py-1 text-[11px] text-primary-foreground/80 hover:bg-primary-foreground/10"
                >
                  Cancel
                </button>
                <button
                  onClick={onSaveEdit}
                  className="flex items-center gap-1 rounded-md bg-primary-foreground/20 px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary-foreground/30"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.attachment && (
                <div className="mb-1.5">
                  <AttachmentBlock attachment={message.attachment} isOwn={isOwn} />
                </div>
              )}
              {message.body && (
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {message.body}
                </div>
              )}
            </>
          )}

          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {message.editedAt && !isDeleted && <span>edited</span>}
            <span>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>

        {isOwn && !isDeleted && !isEditing && (
          <div className="absolute -top-2 right-1 opacity-0 transition-opacity group-hover:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full bg-card p-1 shadow-sm hover:bg-accent"
                  aria-label="Message actions"
                >
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!message.attachment && (
                  <DropdownMenuItem onClick={onStartEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messaging;
