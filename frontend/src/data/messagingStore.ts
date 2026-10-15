import type { Role } from "@/lib/roles";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const MESSAGING_API_BASE = API_BASE_URL;

const parseApiError = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json();
    if (payload?.message) {
      if (Array.isArray(payload.message)) return payload.message.join(", ");
      return payload.message as string;
    }
  } catch {
    // ignore
  }
  return fallback;
};

export type ConversationType = "direct" | "group";
export type SystemGroupType = "leaders" | "alumni";
export type MessageKind = "text" | "system";

export type ConversationPeer = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type ConversationLastMessage = {
  id: string;
  body: string;
  senderId: string | null;
  senderName: string | null;
  createdAt: string;
  type: MessageKind;
};

export type Conversation = {
  id: string;
  type: ConversationType;
  name: string | null;
  isSystem: boolean;
  systemGroupType: SystemGroupType | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  peer: ConversationPeer | null;
  participantsCount: number;
  lastMessage: ConversationLastMessage | null;
  unreadCount: number;
  lastReadAt: string | null;
};

export type MessageAttachment = {
  url: string;
  type: string;
  name: string;
  size: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string | null;
  senderRole: Role | null;
  type: MessageKind;
  body: string;
  attachment: MessageAttachment | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.mp3";
export const ATTACHMENT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
  "audio/mpeg",
  "audio/mp3",
]);

export type AllowedUser = {
  id: string;
  display_name: string;
  email: string;
  role: Role;
};

const authHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export const fetchConversations = async (token: string): Promise<Conversation[]> => {
  const res = await fetch(`${API_BASE_URL}/messaging/conversations`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to load conversations"));
  const data = (await res.json()) as { items: Conversation[] };
  return data.items;
};

export const fetchConversation = async (token: string, id: string): Promise<Conversation> => {
  const res = await fetch(`${API_BASE_URL}/messaging/conversations/${id}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to load conversation"));
  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
};

export const fetchMessages = async (
  token: string,
  conversationId: string,
  options?: { before?: string; limit?: number },
): Promise<ChatMessage[]> => {
  const params = new URLSearchParams();
  if (options?.before) params.set("before", options.before);
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/messaging/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to load messages"));
  const data = (await res.json()) as { items: ChatMessage[] };
  return data.items;
};

export const sendMessage = async (
  token: string,
  conversationId: string,
  payload: { body?: string; attachment?: MessageAttachment | null },
): Promise<ChatMessage> => {
  const res = await fetch(`${API_BASE_URL}/messaging/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      body: payload.body ?? "",
      attachment: payload.attachment ?? undefined,
    }),
  });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to send message"));
  const data = (await res.json()) as { message: ChatMessage };
  return data.message;
};

export const editMessage = async (
  token: string,
  messageId: string,
  body: string,
): Promise<ChatMessage> => {
  const res = await fetch(`${API_BASE_URL}/messaging/messages/${messageId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to edit message"));
  const data = (await res.json()) as { message: ChatMessage };
  return data.message;
};

export const deleteMessage = async (
  token: string,
  messageId: string,
): Promise<ChatMessage> => {
  const res = await fetch(`${API_BASE_URL}/messaging/messages/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to delete message"));
  const data = (await res.json()) as { message: ChatMessage };
  return data.message;
};

export const uploadAttachment = async (
  token: string,
  file: File,
): Promise<MessageAttachment> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/messaging/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to upload attachment"));
  const data = (await res.json()) as { attachment: MessageAttachment };
  return data.attachment;
};

export const markConversationRead = async (
  token: string,
  conversationId: string,
): Promise<{ lastReadAt: string }> => {
  const res = await fetch(`${API_BASE_URL}/messaging/conversations/${conversationId}/read`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to mark read"));
  return (await res.json()) as { lastReadAt: string };
};

export const startDirectChat = async (token: string, userId: string): Promise<Conversation> => {
  const res = await fetch(`${API_BASE_URL}/messaging/direct`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to start chat"));
  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
};

export const fetchAllowedUsers = async (
  token: string,
  search?: string,
): Promise<AllowedUser[]> => {
  const qs = search ? `?q=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${API_BASE_URL}/messaging/users/allowed${qs}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await parseApiError(res, "Failed to load users"));
  const data = (await res.json()) as { items: AllowedUser[] };
  return data.items;
};

export const fetchUnreadTotal = async (token: string): Promise<number> => {
  const res = await fetch(`${API_BASE_URL}/messaging/unread-total`, { headers: authHeaders(token) });
  if (!res.ok) return 0;
  const data = (await res.json()) as { total: number };
  return data.total;
};
