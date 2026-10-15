const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type RequestType =
  | "prayer_support"
  | "financial_aid"
  | "welfare_help"
  | "budget_request"
  | "event_approval"
  | "reimbursement"
  | "leader_apology"
  | "savings_withdrawal";

export type RequestStatus = "pending" | "in_review" | "approved" | "rejected";

export type AssociationRequest = {
  id: string;
  type: RequestType;
  title: string;
  description: string;
  requesterName: string;
  requesterRole: string;
  memberId?: string;
  amount?: number;
  memberSavingsBalanceRwf?: number;
  createdAt: string;
  status: RequestStatus;
  reviewedBy?: string;
  reviewNote?: string;
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

export const listRequests = async (accessToken: string): Promise<AssociationRequest[]> => {
  const response = await fetch(`${API_BASE_URL}/requests`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load requests."));
  const payload = (await response.json()) as { items: AssociationRequest[] };
  return payload.items;
};

export const createRequest = async (
  accessToken: string,
  input: Omit<AssociationRequest, "id" | "createdAt" | "status" | "requesterName" | "requesterRole">,
): Promise<AssociationRequest> => {
  const response = await fetch(`${API_BASE_URL}/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create request."));
  const payload = (await response.json()) as { request: AssociationRequest };
  return payload.request;
};

export const updateRequestStatus = async (
  accessToken: string,
  id: string,
  input: { status: RequestStatus; reviewNote?: string },
): Promise<AssociationRequest> => {
  const response = await fetch(`${API_BASE_URL}/requests/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update request status."));
  const payload = (await response.json()) as { request: AssociationRequest };
  return payload.request;
};

export const deleteRequest = async (
  accessToken: string,
  id: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/requests/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete request."));
};

export const createSavingsWithdrawalRequest = async (
  accessToken: string,
  input: {
    memberId: string;
    amount: number;
    reason: string;
    additionalDetails?: string;
  },
): Promise<AssociationRequest> => {
  const response = await fetch(`${API_BASE_URL}/requests/savings-withdrawal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create savings withdrawal request."));
  const payload = (await response.json()) as { request: AssociationRequest };
  return payload.request;
};

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  prayer_support: "Prayer Support",
  financial_aid: "Financial Aid",
  welfare_help: "Welfare Help",
  budget_request: "Budget Request",
  event_approval: "Event Approval",
  reimbursement: "Reimbursement",
  leader_apology: "Leader Apology",
  savings_withdrawal: "Savings Withdrawal",
};
