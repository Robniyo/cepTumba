const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type TermStatus = "upcoming" | "active" | "completed";

export type LeadershipTerm = {
  id: string;
  roleTitle: string;
  holderName: string;
  memberId: string | null;
  startDate: string;
  endDate: string;
  status: TermStatus;
  createdAt: string;
  updatedAt: string;
};

export type Committee = {
  id: string;
  name: string;
  lead: string;
  members: string[];
  academicYear: string;
  createdAt: string;
  updatedAt: string;
};

export type HandoverNote = {
  id: string;
  title: string;
  fromLeader: string;
  toLeader: string;
  summary: string;
  createdAt: string;
};

const parseApiError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(", ");
    if (typeof payload.message === "string" && payload.message.trim().length > 0) return payload.message;
  } catch {
    // ignore
  }
  return fallback;
};

const authedFetch = async (
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
};

// ---------- Terms ----------

export const listTerms = async (accessToken: string): Promise<LeadershipTerm[]> => {
  const response = await authedFetch(accessToken, "/leadership/terms");
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to load terms."));
  }
  const data = (await response.json()) as { items: LeadershipTerm[] };
  return data.items;
};

export const createTerm = async (
  accessToken: string,
  input: Omit<LeadershipTerm, "id" | "createdAt" | "updatedAt">,
): Promise<LeadershipTerm> => {
  const response = await authedFetch(accessToken, "/leadership/terms", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to create term."));
  }
  const data = (await response.json()) as { term: LeadershipTerm };
  return data.term;
};

export const updateTermStatus = async (
  accessToken: string,
  id: string,
  status: TermStatus,
): Promise<LeadershipTerm> => {
  const response = await authedFetch(accessToken, `/leadership/terms/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to update term."));
  }
  const data = (await response.json()) as { term: LeadershipTerm };
  return data.term;
};

export const deleteTerm = async (accessToken: string, id: string): Promise<void> => {
  const response = await authedFetch(accessToken, `/leadership/terms/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to delete term."));
  }
};

// ---------- Committees ----------

export const listCommittees = async (accessToken: string): Promise<Committee[]> => {
  const response = await authedFetch(accessToken, "/leadership/committees");
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to load committees."));
  }
  const data = (await response.json()) as { items: Committee[] };
  return data.items;
};

export const createCommittee = async (
  accessToken: string,
  input: Omit<Committee, "id" | "createdAt" | "updatedAt">,
): Promise<Committee> => {
  const response = await authedFetch(accessToken, "/leadership/committees", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to create committee."));
  }
  const data = (await response.json()) as { committee: Committee };
  return data.committee;
};

export const updateCommittee = async (
  accessToken: string,
  id: string,
  input: Partial<Omit<Committee, "id" | "createdAt" | "updatedAt">>,
): Promise<Committee> => {
  const response = await authedFetch(accessToken, `/leadership/committees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to update committee."));
  }
  const data = (await response.json()) as { committee: Committee };
  return data.committee;
};

export const deleteCommittee = async (accessToken: string, id: string): Promise<void> => {
  const response = await authedFetch(accessToken, `/leadership/committees/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to delete committee."));
  }
};

// ---------- Handovers ----------

export const listHandovers = async (accessToken: string): Promise<HandoverNote[]> => {
  const response = await authedFetch(accessToken, "/leadership/handovers");
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to load handovers."));
  }
  const data = (await response.json()) as { items: HandoverNote[] };
  return data.items;
};

export const createHandover = async (
  accessToken: string,
  input: Omit<HandoverNote, "id" | "createdAt">,
): Promise<HandoverNote> => {
  const response = await authedFetch(accessToken, "/leadership/handovers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to create handover."));
  }
  const data = (await response.json()) as { handover: HandoverNote };
  return data.handover;
};

export const deleteHandover = async (accessToken: string, id: string): Promise<void> => {
  const response = await authedFetch(accessToken, `/leadership/handovers/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to delete handover."));
  }
};
