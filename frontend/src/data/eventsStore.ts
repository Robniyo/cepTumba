import { getDownloadName } from "@/lib/download";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type ExportFormat = "csv" | "xlsx";

export type EventType = "prayer" | "study" | "service" | "social" | "outreach" | "meeting";
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun

export type Material = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
};

export type MaterialUpload = {
  url: string;
  name: string;
  type: string;
  size: number;
};

export type AttendanceRecord = {
  memberId: string;
  status: "present" | "late" | "absent";
  checkedInAt: string;
  method: "manual" | "qr" | "self";
};

export type FellowshipEvent = {
  id: string;
  title: string;
  type: EventType;
  description?: string;
  location: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  speaker?: string;
  // recurrence
  recurring: boolean;
  weekday?: Weekday; // when recurring
  startDate: string; // yyyy-MM-dd (anchor / one-off date)
  endDate?: string;  // optional cap for recurrence
  materials: Material[];
  notes?: string; // sermon notes (text)
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

export const listEvents = async (accessToken: string): Promise<FellowshipEvent[]> => {
  const response = await fetch(`${API_BASE_URL}/events`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load events."));
  const payload = (await response.json()) as { items: FellowshipEvent[] };
  return payload.items;
};

export const exportEvents = async (
  accessToken: string,
  format: ExportFormat,
): Promise<{ blob: Blob; fileName: string }> => {
  const response = await fetch(`${API_BASE_URL}/events/export?format=${format}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to export events."));

  const blob = await response.blob();
  const fileName = getDownloadName(
    response.headers.get("content-disposition"),
    `events.${format}`,
  );
  return { blob, fileName };
};

export const createEvent = async (
  accessToken: string,
  input: Omit<FellowshipEvent, "id" | "materials">,
): Promise<FellowshipEvent> => {
  const response = await fetch(`${API_BASE_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create event."));
  const payload = (await response.json()) as { event: FellowshipEvent };
  return payload.event;
};

export const updateEvent = async (
  accessToken: string,
  eventId: string,
  input: Partial<FellowshipEvent>,
): Promise<FellowshipEvent> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update event."));
  const payload = (await response.json()) as { event: FellowshipEvent };
  return payload.event;
};

export const deleteEvent = async (
  accessToken: string,
  eventId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete event."));
};

export const setEventNotes = async (
  accessToken: string,
  eventId: string,
  notes: string,
): Promise<FellowshipEvent> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ notes }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to set notes."));
  const payload = (await response.json()) as { event: FellowshipEvent };
  return payload.event;
};

export const listAttendance = async (
  accessToken: string,
  eventId: string,
): Promise<AttendanceRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/attendance`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load attendance."));
  const payload = (await response.json()) as { items: AttendanceRecord[] };
  return payload.items;
};

export const markAttendance = async (
  accessToken: string,
  eventId: string,
  input: { date: string; memberId: string; status: AttendanceRecord["status"]; method: AttendanceRecord["method"] },
): Promise<AttendanceRecord> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to mark attendance."));
  const payload = (await response.json()) as { attendance: AttendanceRecord };
  return payload.attendance;
};

export const removeAttendance = async (
  accessToken: string,
  eventId: string,
  date: string,
  memberId: string,
): Promise<void> => {
  const query = new URLSearchParams({ date, memberId });
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/attendance?${query}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to remove attendance."));
};

export const uploadEventMaterial = async (
  accessToken: string,
  eventId: string,
  file: File,
): Promise<MaterialUpload> => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/materials/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to upload material."));
  const payload = (await response.json()) as { file: MaterialUpload };
  return payload.file;
};

export const addMaterial = async (
  accessToken: string,
  eventId: string,
  input: { name: string; url: string; type?: string; size?: number },
): Promise<Material> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to add material."));
  const payload = (await response.json()) as { material: Material };
  return payload.material;
};

export const removeMaterial = async (
  accessToken: string,
  eventId: string,
  materialId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/materials/${materialId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to remove material."));
};

// ---------- Helpers ----------

export const TYPE_META: Record<EventType, { label: string; cls: string; dot: string }> = {
  prayer:   { label: "Prayer",   cls: "bg-primary/15 text-primary",    dot: "bg-primary" },
  study:    { label: "Study",    cls: "bg-info/15 text-info",          dot: "bg-info" },
  service:  { label: "Service",  cls: "bg-accent/20 text-accent",      dot: "bg-accent" },
  social:   { label: "Social",   cls: "bg-success/15 text-success",    dot: "bg-success" },
  outreach: { label: "Outreach", cls: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
  meeting:  { label: "Meeting",  cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const getWeekStart = (anchor: Date) => {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

export const getWeekDates = (weekStart: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

export const formatISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Returns events occurring on the given date (resolving recurrences). */
export const eventsOnDate = (events: FellowshipEvent[], date: Date): FellowshipEvent[] => {
  const iso = formatISODate(date);
  return events.filter(e => {
    if (e.endDate && iso > e.endDate) return false;
    if (iso < e.startDate) return false;
    if (e.recurring) return e.weekday === date.getDay();
    return e.startDate === iso;
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
};
