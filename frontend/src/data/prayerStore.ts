const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type FollowUpStatus = "new" | "assigned" | "in_progress" | "closed";

export type PrayerRequest = {
  id: string;
  requester: string;
  title: string;
  message: string;
  isPrivate: boolean;
  createdAt: string;
  status: FollowUpStatus;
  assignedTo?: string;
};

export type CounselingRequest = {
  id: string;
  requester: string;
  summary: string;
  preferredDate?: string;
  createdAt: string;
  status: FollowUpStatus;
  counselor?: string;
};

export type Testimony = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
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

// ---------- Prayer Requests ----------

export const listPrayerRequests = async (accessToken: string): Promise<PrayerRequest[]> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/prayers`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load prayer requests."));
  const payload = (await response.json()) as { items: PrayerRequest[] };
  return payload.items;
};

export const createPrayerRequest = async (
  accessToken: string,
  input: Omit<PrayerRequest, "id" | "createdAt" | "status" | "requester">,
): Promise<PrayerRequest> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/prayers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create prayer request."));
  const payload = (await response.json()) as { request: PrayerRequest };
  return payload.request;
};

export const updatePrayerStatus = async (
  accessToken: string,
  id: string,
  input: { status: FollowUpStatus; assignedTo?: string },
): Promise<PrayerRequest> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/prayers/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update prayer status."));
  const payload = (await response.json()) as { request: PrayerRequest };
  return payload.request;
};

export const deletePrayerRequest = async (
  accessToken: string,
  id: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/prayers/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete prayer request."));
};

// ---------- Counseling ----------

export const listCounselingRequests = async (accessToken: string): Promise<CounselingRequest[]> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/counseling`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load counseling requests."));
  const payload = (await response.json()) as { items: CounselingRequest[] };
  return payload.items;
};

export const createCounselingRequest = async (
  accessToken: string,
  input: Omit<CounselingRequest, "id" | "createdAt" | "status" | "requester">,
): Promise<CounselingRequest> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/counseling`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create counseling request."));
  const payload = (await response.json()) as { request: CounselingRequest };
  return payload.request;
};

export const updateCounselingStatus = async (
  accessToken: string,
  id: string,
  input: { status: FollowUpStatus; counselor?: string },
): Promise<CounselingRequest> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/counseling/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update counseling status."));
  const payload = (await response.json()) as { request: CounselingRequest };
  return payload.request;
};

export const deleteCounselingRequest = async (
  accessToken: string,
  id: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/counseling/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete counseling request."));
};

// ---------- Testimonies ----------

export const listTestimonies = async (accessToken: string): Promise<Testimony[]> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/testimonies`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load testimonies."));
  const payload = (await response.json()) as { items: Testimony[] };
  return payload.items;
};

export const createTestimony = async (
  accessToken: string,
  body: string,
): Promise<Testimony> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/testimonies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create testimony."));
  const payload = (await response.json()) as { testimony: Testimony };
  return payload.testimony;
};

export const deleteTestimony = async (
  accessToken: string,
  id: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/prayer-center/testimonies/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete testimony."));
};
