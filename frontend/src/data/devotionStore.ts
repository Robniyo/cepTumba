const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type ReactionKind = "amen" | "pray" | "love" | "fire";

export type Comment = {
  id: string;
  devotionId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type Devotion = {
  id: string;
  title: string;
  reference: string;
  verse: string;
  reflection: string;
  prayerPoints: string[];
  author: string;
  scheduledFor: string; // ISO date (yyyy-mm-dd)
  status: "draft" | "scheduled" | "published";
  createdAt: string;
  reactions: Record<ReactionKind, string[]>; // member names
};

const parseApiError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(", ");
    if (typeof payload.message === "string" && payload.message.trim().length > 0) return payload.message;
  } catch {
    // Ignore parse errors and use fallback.
  }
  return fallback;
};

// ---------- API functions ----------

export const listDevotions = async (
  accessToken: string,
  options?: { includeUnpublished?: boolean },
): Promise<Devotion[]> => {
  const query = new URLSearchParams();
  if (options?.includeUnpublished) query.set("includeUnpublished", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/devotions${suffix}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load devotions."));
  const payload = (await response.json()) as { items: Devotion[] };
  return payload.items;
};

export const getDevotion = async (
  accessToken: string,
  devotionId: string,
): Promise<Devotion> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load devotion."));
  const payload = (await response.json()) as { devotion: Devotion };
  return payload.devotion;
};

export const createDevotion = async (
  accessToken: string,
  input: Omit<Devotion, "id" | "createdAt" | "reactions" | "author">,
): Promise<Devotion> => {
  const response = await fetch(`${API_BASE_URL}/devotions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create devotion."));
  const payload = (await response.json()) as { devotion: Devotion };
  return payload.devotion;
};

export const updateDevotion = async (
  accessToken: string,
  devotionId: string,
  input: Partial<Devotion>,
): Promise<Devotion> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update devotion."));
  const payload = (await response.json()) as { devotion: Devotion };
  return payload.devotion;
};

export const deleteDevotion = async (
  accessToken: string,
  devotionId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete devotion."));
};

export const publishDevotion = async (
  accessToken: string,
  devotionId: string,
): Promise<Devotion> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}/publish`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to publish devotion."));
  const payload = (await response.json()) as { devotion: Devotion };
  return payload.devotion;
};

export const listComments = async (
  accessToken: string,
  devotionId: string,
): Promise<Comment[]> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}/comments`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load comments."));
  const payload = (await response.json()) as { items: Comment[] };
  return payload.items;
};

export const addComment = async (
  accessToken: string,
  devotionId: string,
  body: string,
): Promise<Comment> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to add comment."));
  const payload = (await response.json()) as { comment: Comment };
  return payload.comment;
};

export const deleteComment = async (
  accessToken: string,
  devotionId: string,
  commentId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}/comments/${commentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete comment."));
};

export const toggleReaction = async (
  accessToken: string,
  devotionId: string,
  kind: ReactionKind,
): Promise<{ toggled: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/devotions/${devotionId}/reactions/${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to toggle reaction."));
  return (await response.json()) as { toggled: boolean };
};

export const getVerseOfTheDay = async (
  accessToken: string,
): Promise<Devotion | null> => {
  const response = await fetch(`${API_BASE_URL}/devotions/verse-of-the-day`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load verse of the day."));
  const payload = (await response.json()) as { devotion: Devotion | null };
  return payload.devotion;
};

export const todayISODate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
