const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type ResolutionStatus = "proposed" | "passed" | "rejected" | "tabled";

export type Resolution = {
  id: string;
  text: string;
  movedBy: string;
  secondedBy: string;
  status: ResolutionStatus;
  votesFor?: number;
  votesAgainst?: number;
  votesAbstain?: number;
};

export type AgendaItem = {
  id: string;
  title: string;
  notes: string;
  presenter?: string;
};

export type ActionItem = {
  id: string;
  task: string;
  ownerId: string; // member id or free text
  due: string; // yyyy-mm-dd
  done: boolean;
};

export type Minute = {
  id: string;
  title: string;
  meetingType: "executive" | "general" | "advisors" | "committee" | "agm";
  date: string; // yyyy-mm-dd
  startTime: string;
  endTime: string;
  location: string;
  chair: string;
  secretary: string;
  attendees: string[]; // member ids
  apologies: string[]; // member ids
  agenda: AgendaItem[];
  resolutions: Resolution[];
  actions: ActionItem[];
  status: "draft" | "circulated" | "approved";
  createdAt: string;
};

export type DocCategory = "constitution" | "handover" | "policy" | "report" | "sermon" | "form" | "other";

export type DocVersion = {
  id: string;
  version: string; // e.g. "v1", "v2.1"
  uploadedAt: string;
  uploadedBy: string;
  changeNote: string;
  fileName: string;
  fileSize: number; // bytes
  mimeType: string;
  url?: string; // public URL for download
};

export type DocumentRecord = {
  id: string;
  title: string;
  category: DocCategory;
  description: string;
  ownerRole: string;
  tags: string[];
  versions: DocVersion[];
  createdAt: string;
};

export type DocumentUpload = {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
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

// ---------- Minutes ----------

export const listMinutes = async (accessToken: string): Promise<Minute[]> => {
  const response = await fetch(`${API_BASE_URL}/minutes`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load minutes."));
  const payload = (await response.json()) as { items: Minute[] };
  return payload.items;
};

export const createMinute = async (
  accessToken: string,
  input: Omit<Minute, "id" | "createdAt" | "agenda" | "resolutions" | "actions"> & { attendees?: string[]; apologies?: string[] },
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create minute."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const updateMinute = async (
  accessToken: string,
  id: string,
  input: Partial<Minute>,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update minute."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const deleteMinute = async (accessToken: string, id: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete minute."));
};

export const addAgendaItem = async (
  accessToken: string,
  minuteId: string,
  input: Omit<AgendaItem, "id">,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/agenda`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to add agenda item."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const removeAgendaItem = async (
  accessToken: string,
  minuteId: string,
  itemId: string,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/agenda/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to remove agenda item."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const addResolution = async (
  accessToken: string,
  minuteId: string,
  input: Omit<Resolution, "id">,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/resolutions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to add resolution."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const updateResolution = async (
  accessToken: string,
  minuteId: string,
  resolutionId: string,
  input: Partial<Resolution>,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/resolutions/${resolutionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update resolution."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const removeResolution = async (
  accessToken: string,
  minuteId: string,
  resolutionId: string,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/resolutions/${resolutionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to remove resolution."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const addAction = async (
  accessToken: string,
  minuteId: string,
  input: Omit<ActionItem, "id">,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to add action item."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const toggleAction = async (
  accessToken: string,
  minuteId: string,
  actionId: string,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/actions/${actionId}/toggle`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to toggle action."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

export const removeAction = async (
  accessToken: string,
  minuteId: string,
  actionId: string,
): Promise<Minute> => {
  const response = await fetch(`${API_BASE_URL}/minutes/${minuteId}/actions/${actionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to remove action item."));
  const payload = (await response.json()) as { minute: Minute };
  return payload.minute;
};

// ---------- Documents ----------

export const listDocuments = async (accessToken: string): Promise<DocumentRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load documents."));
  const payload = (await response.json()) as { items: DocumentRecord[] };
  return payload.items;
};

export const uploadDocumentFile = async (
  accessToken: string,
  file: File,
): Promise<DocumentUpload> => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to upload document file."));
  const payload = (await response.json()) as { file: DocumentUpload };
  return payload.file;
};

export const createDocument = async (
  accessToken: string,
  input: Omit<DocumentRecord, "id" | "createdAt" | "versions"> & { initialVersion: Omit<DocVersion, "id" | "uploadedAt"> },
): Promise<DocumentRecord> => {
  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create document."));
  const payload = (await response.json()) as { document: DocumentRecord };
  return payload.document;
};

export const addDocumentVersion = async (
  accessToken: string,
  docId: string,
  input: Omit<DocVersion, "id" | "uploadedAt">,
): Promise<DocumentRecord> => {
  const response = await fetch(`${API_BASE_URL}/documents/${docId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to add version."));
  const payload = (await response.json()) as { document: DocumentRecord };
  return payload.document;
};

export const removeDocument = async (accessToken: string, docId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/documents/${docId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete document."));
};

export const removeDocumentVersion = async (
  accessToken: string,
  docId: string,
  versionId: string,
): Promise<DocumentRecord> => {
  const response = await fetch(`${API_BASE_URL}/documents/${docId}/versions/${versionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to remove version."));
  const payload = (await response.json()) as { document: DocumentRecord };
  return payload.document;
};

export const fmtFileSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};
