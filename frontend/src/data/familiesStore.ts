const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type Gender = "male" | "female" | "other";
export type FamilyStatus = "active" | "inactive";
export type RoleInFamily = "daddy" | "mummy" | "member";
export type AssignmentMode = "unassigned_only" | "reassign_all";
export type AssignmentRunStatus = "completed" | "previewed" | "failed";

export type MemberStatus = "active" | "inactive" | "graduated" | "suspended";

export type FamilyMemberSummary = {
  membershipId: string;
  memberId: string;
  memberNo: string;
  fullName: string;
  gender: Gender | null;
  roleInFamily: RoleInFamily;
  yearOfStudy?: string | null;
  memberStatus?: MemberStatus;
};

export type Family = {
  id: string;
  familyName: string;
  familyCode: string;
  status: FamilyStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  totalMembers: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  daddy: FamilyMemberSummary | null;
  mummy: FamilyMemberSummary | null;
};

export type FamilyDetail = Family & { members: FamilyMemberSummary[] };

export type AssignmentPreviewFamily = {
  familyId: string;
  familyName: string;
  familyCode: string;
  members: Array<{
    memberId: string;
    memberNo: string;
    fullName: string;
    gender: Gender | null;
  }>;
  maleCount: number;
  femaleCount: number;
  total: number;
};

export type AssignmentRunSummary = {
  id: string;
  triggeredBy: string | null;
  totalMembersAssigned: number;
  totalFamilies: number;
  assignmentType: AssignmentMode;
  status: AssignmentRunStatus;
  createdAt: string;
};

export type AssignmentResult = {
  preview: boolean;
  mode: AssignmentMode;
  totalMembersAssigned: number;
  totalFamilies: number;
  unassignedCount: number;
  families: AssignmentPreviewFamily[];
  run: AssignmentRunSummary | null;
};

export type FamilyReportSummary = {
  totals: {
    totalFamilies: number;
    activeFamilies: number;
    inactiveFamilies: number;
    totalAssignedMembers: number;
    unassignedActiveMembers: number;
    familiesMissingDaddy: number;
    familiesMissingMummy: number;
  };
  perFamily: Array<{
    id: string;
    familyName: string;
    familyCode: string;
    totalMembers: number;
    maleCount: number;
    femaleCount: number;
    hasDaddy: boolean;
    hasMummy: boolean;
    balanced: boolean;
  }>;
  recentRuns: AssignmentRunSummary[];
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
): Promise<Response> =>
  fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

const handle = async <T>(response: Response, fallback: string): Promise<T> => {
  if (!response.ok) throw new Error(await parseApiError(response, fallback));
  return (await response.json()) as T;
};

// ---------- "My family" (any authenticated user) ----------
export const getMyFamily = async (token: string): Promise<FamilyDetail | null> => {
  const response = await authedFetch(token, "/families/me");
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load your family."));
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as FamilyDetail;
};

// ---------- Families CRUD (President) ----------
export const listFamilies = async (token: string): Promise<Family[]> =>
  handle(await authedFetch(token, "/families"), "Failed to load families.");

export const getFamily = async (token: string, id: string): Promise<FamilyDetail> =>
  handle(await authedFetch(token, `/families/${id}`), "Failed to load family.");

export const createFamily = async (
  token: string,
  input: { familyName: string; familyCode?: string; status?: FamilyStatus },
): Promise<Family> =>
  handle(
    await authedFetch(token, "/families", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    "Failed to create family.",
  );

export const updateFamily = async (
  token: string,
  id: string,
  input: Partial<{ familyName: string; familyCode: string; status: FamilyStatus }>,
): Promise<FamilyDetail> =>
  handle(
    await authedFetch(token, `/families/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
    "Failed to update family.",
  );

export const deleteFamily = async (token: string, id: string): Promise<void> => {
  const response = await authedFetch(token, `/families/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete family."));
};

// ---------- Assignment (VP-Social) ----------
export const runAssignment = async (
  token: string,
  input: { mode: AssignmentMode; preview?: boolean },
): Promise<AssignmentResult> =>
  handle(
    await authedFetch(token, "/families/assignments/run", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    "Failed to run assignment.",
  );

export const listAssignmentRuns = async (token: string): Promise<AssignmentRunSummary[]> =>
  handle(
    await authedFetch(token, "/families/assignments/runs"),
    "Failed to load assignment history.",
  );

// ---------- Manual move (VP-Social) ----------
export const moveMember = async (
  token: string,
  input: { memberId: string; targetFamilyId: string },
): Promise<FamilyDetail> =>
  handle(
    await authedFetch(token, "/families/memberships/move", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    "Failed to move member.",
  );

// ---------- Parents (VP-Social) ----------
export const selectParents = async (
  token: string,
  familyId: string,
  input: { daddyMemberId?: string | null; mummyMemberId?: string | null },
): Promise<FamilyDetail> =>
  handle(
    await authedFetch(token, `/families/${familyId}/parents`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
    "Failed to update parents.",
  );

// ---------- Reports ----------
export const getFamilyReport = async (token: string): Promise<FamilyReportSummary> =>
  handle(
    await authedFetch(token, "/families/reports/summary"),
    "Failed to load report.",
  );
