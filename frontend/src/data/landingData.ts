const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface PublicEvent {
  id: string;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string | null;
  recurring: boolean;
  weekday: number | null;
  location: string;
  description: string | null;
  type: string;
}

export interface PublicAnnouncement {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  body: string;
}

export interface Leader {
  id: string;
  fullName: string;
  role: string;
  description: string;
}

export interface PublicStats {
  membersCount: number;
  weeklyActivities: number;
  yearsStrong: number;
}

export async function fetchPublicEvents(limit: number = 6): Promise<PublicEvent[]> {
  const response = await fetch(`${API_BASE_URL}/events/public?limit=${limit}`);
  if (!response.ok) {
    throw new Error("Failed to fetch events");
  }
  const data = await response.json();
  return data.items.map((item: any) => ({
    id: item.id,
    title: item.title,
    startDate: item.startDate,
    startTime: item.startTime,
    endDate: item.endDate ?? null,
    recurring: Boolean(item.recurring),
    weekday: typeof item.weekday === "number" ? item.weekday : null,
    location: item.location,
    description: item.description,
    type: item.type,
  }));
}

export async function fetchPublicAnnouncements(limit: number = 10): Promise<PublicAnnouncement[]> {
  const response = await fetch(`${API_BASE_URL}/announcements/public?limit=${limit}`);
  if (!response.ok) {
    throw new Error("Failed to fetch announcements");
  }
  const data = await response.json();
  return data.items.map((item: any) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    createdAt: item.createdAt,
    body: item.body,
  }));
}

export async function fetchPublicLeadership(): Promise<Leader[]> {
  const response = await fetch(`${API_BASE_URL}/members/public/leadership`);
  if (!response.ok) {
    throw new Error("Failed to fetch leadership");
  }
  const data = await response.json();
  return data.map((item: any) => ({
    id: item.id,
    fullName: item.fullName,
    role: item.role,
    description: item.description,
  }));
}

export async function fetchVerseOfTheDay() {
  // Verse of the day doesn't require auth for public landing page
  const response = await fetch(`${API_BASE_URL}/devotions/verse-of-the-day`);
  if (!response.ok) {
    throw new Error("Failed to fetch verse of the day");
  }
  return response.json();
}

export async function fetchPublicStats(): Promise<PublicStats> {
  const response = await fetch(`${API_BASE_URL}/public/stats`);
  if (!response.ok) {
    throw new Error("Failed to fetch public stats");
  }

  const data = await response.json();
  return {
    membersCount: Number(data.membersCount ?? 0),
    weeklyActivities: Number(data.weeklyActivities ?? 0),
    yearsStrong: Number(data.yearsStrong ?? 0),
  };
}
