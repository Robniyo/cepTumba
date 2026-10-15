const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type CaseType = "illness" | "bereavement" | "financial" | "academic" | "spiritual" | "celebration" | "other";
export type CaseStatus = "open" | "in_progress" | "resolved" | "closed";
export type Urgency = "low" | "medium" | "high" | "critical";

export type CaseNote = { id: string; author: string; body: string; at: string };

export type WelfareCase = {
  id: string;
  memberId: string;
  type: CaseType;
  title: string;
  description: string;
  urgency: Urgency;
  status: CaseStatus;
  openedAt: string;
  openedBy: string;
  closedAt?: string;
  notes: CaseNote[];
};

export type Visit = {
  id: string;
  caseId?: string;
  memberId: string;
  scheduledFor: string; // ISO datetime
  location: string;
  purpose: string;
  status: "planned" | "completed" | "cancelled";
  assigneeIds: string[]; // member ids attending the visit
  attendedIds: string[]; // who actually came
  report?: string;
  createdBy: string;
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

// ---------- Cases ----------

export const listCases = async (accessToken: string): Promise<WelfareCase[]> => {
  const response = await fetch(`${API_BASE_URL}/welfare/cases`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load welfare cases."));
  const payload = (await response.json()) as { items: WelfareCase[] };
  return payload.items;
};

export const createCase = async (
  accessToken: string,
  input: Omit<WelfareCase, "id" | "openedAt" | "notes" | "openedBy">,
): Promise<WelfareCase> => {
  const response = await fetch(`${API_BASE_URL}/welfare/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create case."));
  const payload = (await response.json()) as { case: WelfareCase };
  return payload.case;
};

export const updateCase = async (
  accessToken: string,
  caseId: string,
  input: Partial<WelfareCase>,
): Promise<WelfareCase> => {
  const response = await fetch(`${API_BASE_URL}/welfare/cases/${caseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update case."));
  const payload = (await response.json()) as { case: WelfareCase };
  return payload.case;
};

export const deleteCase = async (accessToken: string, caseId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/welfare/cases/${caseId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete case."));
};

export const addCaseNote = async (
  accessToken: string,
  caseId: string,
  body: string,
): Promise<CaseNote> => {
  const response = await fetch(`${API_BASE_URL}/welfare/cases/${caseId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to add case note."));
  const payload = (await response.json()) as { note: CaseNote };
  return payload.note;
};

// ---------- Visits ----------

export const listVisits = async (accessToken: string): Promise<Visit[]> => {
  const response = await fetch(`${API_BASE_URL}/welfare/visits`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load visits."));
  const payload = (await response.json()) as { items: Visit[] };
  return payload.items;
};

export const createVisit = async (
  accessToken: string,
  input: Omit<Visit, "id" | "attendedIds" | "createdBy">,
): Promise<Visit> => {
  const response = await fetch(`${API_BASE_URL}/welfare/visits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create visit."));
  const payload = (await response.json()) as { visit: Visit };
  return payload.visit;
};

export const updateVisit = async (
  accessToken: string,
  visitId: string,
  input: Partial<Visit>,
): Promise<Visit> => {
  const response = await fetch(`${API_BASE_URL}/welfare/visits/${visitId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update visit."));
  const payload = (await response.json()) as { visit: Visit };
  return payload.visit;
};

export const deleteVisit = async (accessToken: string, visitId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/welfare/visits/${visitId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete visit."));
};

export const toggleVisitAttendee = async (
  accessToken: string,
  visitId: string,
  memberId: string,
): Promise<Visit> => {
  const response = await fetch(`${API_BASE_URL}/welfare/visits/${visitId}/attendees/${memberId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to toggle attendee."));
  const payload = (await response.json()) as { visit: Visit };
  return payload.visit;
};
