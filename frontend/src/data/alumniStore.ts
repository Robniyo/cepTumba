const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type Alumni = {
  id: string;
  name: string;
  graduationYear: number;
  email: string | null;
  phone: string | null;
  currentRole: string;
  mentorAvailable: boolean;
  contributionTotal: number;
  lastEngagement: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAlumniInput = {
  name: string;
  graduationYear: number;
  email?: string;
  phone?: string;
  currentRole?: string;
  mentorAvailable?: boolean;
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

export const listAlumni = async (accessToken: string): Promise<Alumni[]> => {
  const response = await fetch(`${API_BASE_URL}/alumni`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load alumni."));
  const payload = (await response.json()) as { items: Alumni[] };
  return payload.items;
};

export const createAlumni = async (
  accessToken: string,
  input: CreateAlumniInput,
): Promise<Alumni> => {
  const response = await fetch(`${API_BASE_URL}/alumni`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      fullName: input.name,
      graduationYear: input.graduationYear,
      email: input.email,
      phone: input.phone,
      currentRoleTitle: input.currentRole,
      mentorAvailable: input.mentorAvailable,
    }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create alumni."));
  const payload = (await response.json()) as { alumni: Alumni };
  return payload.alumni;
};

export const updateAlumni = async (
  accessToken: string,
  id: string,
  input: Partial<CreateAlumniInput>,
): Promise<Alumni> => {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.fullName = input.name;
  if (input.graduationYear !== undefined) body.graduationYear = input.graduationYear;
  if (input.email !== undefined) body.email = input.email;
  if (input.phone !== undefined) body.phone = input.phone;
  if (input.currentRole !== undefined) body.currentRoleTitle = input.currentRole;
  if (input.mentorAvailable !== undefined) body.mentorAvailable = input.mentorAvailable;

  const response = await fetch(`${API_BASE_URL}/alumni/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update alumni."));
  const payload = (await response.json()) as { alumni: Alumni };
  return payload.alumni;
};

export const addContribution = async (
  accessToken: string,
  id: string,
  amount: number,
): Promise<Alumni> => {
  const response = await fetch(`${API_BASE_URL}/alumni/${id}/contributions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ amount }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to record contribution."));
  const payload = (await response.json()) as { alumni: Alumni };
  return payload.alumni;
};

export const deleteAlumni = async (
  accessToken: string,
  id: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/alumni/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete alumni."));
};
