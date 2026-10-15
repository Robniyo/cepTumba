const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const ANNOUNCEMENT_CATEGORIES = [
  "urgent",
  "spiritual",
  "finance",
  "social",
  "academic",
  "general",
] as const;

export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "archived",
] as const;

export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export type AnnouncementRecord = {
  id: string;
  authorUserId: string | null;
  title: string;
  body: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  scheduledFor: string | null;
  expiresAt: string | null;
  author: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type ListAnnouncementsResponse = {
  items: AnnouncementRecord[];
  total: number;
};

type CreateAnnouncementResponse = {
  announcement: AnnouncementRecord;
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

export const listAnnouncements = async (
  accessToken: string,
  options?: {
    category?: AnnouncementCategory;
    status?: AnnouncementStatus;
    includeUnpublished?: boolean;
    offset?: number;
    limit?: number;
  },
): Promise<ListAnnouncementsResponse> => {
  const query = new URLSearchParams();
  if (options?.category) {
    query.set("category", options.category);
  }
  if (options?.status) {
    query.set("status", options.status);
  }
  if (typeof options?.includeUnpublished === "boolean") {
    query.set("includeUnpublished", String(options.includeUnpublished));
  }
  if (typeof options?.offset === "number" && options.offset > 0) {
    query.set("offset", String(options.offset));
  }
  if (typeof options?.limit === "number" && options.limit > 0) {
    query.set("limit", String(options.limit));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/announcements${suffix}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to load announcements."));
  }

  return (await response.json()) as ListAnnouncementsResponse;
};

export const publishAnnouncement = async (
  accessToken: string,
  input: {
    title: string;
    body: string;
    category: AnnouncementCategory;
    status?: AnnouncementStatus;
    scheduledFor?: string;
    expiresAt?: string;
    audienceType?: 'all' | 'leaders_only' | 'role_based';
    audienceRoles?: string[];
    pinned?: boolean;
  },
): Promise<AnnouncementRecord> => {
  const response = await fetch(`${API_BASE_URL}/announcements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to publish announcement."));
  }

  const payload = (await response.json()) as CreateAnnouncementResponse;
  return payload.announcement;
};

export const updateAnnouncementStatus = async (
  accessToken: string,
  announcementId: string,
  input: {
    status: AnnouncementStatus;
    scheduledFor?: string;
  },
): Promise<AnnouncementRecord> => {
  const response = await fetch(`${API_BASE_URL}/announcements/${announcementId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to update announcement status."));
  }

  const payload = (await response.json()) as CreateAnnouncementResponse;
  return payload.announcement;
};

export const setAnnouncementPinned = async (
  accessToken: string,
  announcementId: string,
  pinned: boolean,
): Promise<AnnouncementRecord> => {
  const endpoint = pinned ? "pin" : "unpin";

  const response = await fetch(`${API_BASE_URL}/announcements/${announcementId}/${endpoint}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to update pinned state."));
  }

  const payload = (await response.json()) as CreateAnnouncementResponse;
  return payload.announcement;
};

export const updateAnnouncement = async (
  accessToken: string,
  announcementId: string,
  input: {
    title?: string;
    body?: string;
    category?: AnnouncementCategory;
  },
): Promise<AnnouncementRecord> => {
  const response = await fetch(`${API_BASE_URL}/announcements/${announcementId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to update announcement."));
  }

  const payload = (await response.json()) as CreateAnnouncementResponse;
  return payload.announcement;
};

export const deleteAnnouncement = async (
  accessToken: string,
  announcementId: string,
): Promise<{ deletedAnnouncementId: string }> => {
  const response = await fetch(`${API_BASE_URL}/announcements/${announcementId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to delete announcement."));
  }

  return (await response.json()) as { deletedAnnouncementId: string };
};
