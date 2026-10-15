import { getDownloadName } from "@/lib/download";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type ExportFormat = "csv" | "xlsx";

export type FundId = "welfare" | "evangelism" | "social" | "project" | "tithe" | "savings";

export type Fund = {
  id: FundId;
  name: string;
  color: "primary" | "success" | "accent" | "info" | "warning" | "destructive";
  description: string;
};

export type TxType = "offering" | "tithe" | "contribution" | "savings_deposit" | "savings_withdraw" | "expense" | "other_income";

export type TxStatus = "approved" | "pending" | "rejected";

export type Transaction = {
  id: string;
  date: string;            // yyyy-MM-dd
  type: TxType;
  fundId: FundId;
  amount: number;          // Rwf, positive
  direction: "in" | "out";
  description: string;
  memberId?: string;
  reference: string;       // human-readable receipt no
  status: TxStatus;
  recordedBy: string;
  paymentMethod:
    | "cash"
    | "mpesa"
    | "momo"
    | "airtel_money"
    | "bank"
    | "card"
    | "other";
};

export type MobileMoneyProvider = "momo" | "airtel_money";

export type MobileMoneyPaymentStatus = "pending" | "success" | "failed" | "expired" | "cancelled";

export type SavingsMobileMoneyPayment = {
  id: string;
  requestRef: string;
  memberId: string;
  initiatedByUserId: string;
  provider: MobileMoneyProvider;
  phone: string;
  amount: number;
  note: string | null;
  message: string | null;
  description: string | null;
  status: MobileMoneyPaymentStatus;
  externalTransactionId: string | null;
  failureReason: string | null;
  reconcileAttempts: number;
  financeTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
};

export type Budget = {
  id: string;
  period: string;          // e.g. "2026-Q2"
  label: string;           // "Q2 2026"
  fundId: FundId;
  category: string;
  budgeted: number;
};

export const FUNDS: Fund[] = [
  { id: "welfare",    name: "Welfare",     color: "success",  description: "Member care, hospital visits, bereavement" },
  { id: "evangelism", name: "Evangelism",  color: "primary",  description: "Outreach, missions, tracts, transport" },
  { id: "social",     name: "Social",      color: "accent",   description: "Fellowships, retreats, hospitality" },
  { id: "project",    name: "Project",     color: "info",     description: "Capital projects & equipment" },
  { id: "tithe",      name: "Tithes",      color: "warning",  description: "Tithes contributions" },
  { id: "savings",    name: "Savings",     color: "primary",  description: "Member savings pool" },
];

export const TX_TYPE_LABEL: Record<TxType, string> = {
  offering: "Offering",
  tithe: "Tithe",
  contribution: "Contribution",
  savings_deposit: "Savings deposit",
  savings_withdraw: "Savings withdrawal",
  expense: "Expense",
  other_income: "Other income",
};

export const PAYMENT_LABEL: Record<Transaction["paymentMethod"], string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  momo: "MTN MoMo",
  airtel_money: "Airtel Money",
  bank: "Bank",
  card: "Card",
  other: "Other",
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

type ListTransactionsOptions = {
  fundId?: FundId;
  type?: TxType;
  status?: TxStatus;
  memberId?: string;
  direction?: "in" | "out";
  offset?: number;
  limit?: number;
};

type ListTransactionsResponse = {
  items: Transaction[];
  total: number;
};

export const listTransactions = async (
  accessToken: string,
  options?: ListTransactionsOptions,
): Promise<ListTransactionsResponse> => {
  const query = new URLSearchParams();
  if (options?.fundId) query.set("fundId", options.fundId);
  if (options?.type) query.set("type", options.type);
  if (options?.status) query.set("status", options.status);
  if (options?.memberId) query.set("memberId", options.memberId);
  if (options?.direction) query.set("direction", options.direction);
  if (typeof options?.offset === "number" && options.offset > 0) query.set("offset", String(options.offset));
  if (typeof options?.limit === "number" && options.limit > 0) query.set("limit", String(options.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/finance/transactions${suffix}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load transactions."));
  return (await response.json()) as ListTransactionsResponse;
};

export const exportTransactions = async (
  accessToken: string,
  format: ExportFormat,
  options?: ListTransactionsOptions,
): Promise<{ blob: Blob; fileName: string }> => {
  const query = new URLSearchParams();
  if (options?.fundId) query.set("fundId", options.fundId);
  if (options?.type) query.set("type", options.type);
  if (options?.status) query.set("status", options.status);
  if (options?.memberId) query.set("memberId", options.memberId);
  const suffix = query.toString() ? `?${query.toString()}&format=${format}` : `?format=${format}`;
  const response = await fetch(`${API_BASE_URL}/finance/transactions/export${suffix}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to export transactions."));

  const blob = await response.blob();
  const fileName = getDownloadName(
    response.headers.get("content-disposition"),
    `finance_transactions.${format}`,
  );
  return { blob, fileName };
};

export const createTransaction = async (
  accessToken: string,
  input: Omit<Transaction, "id" | "reference" | "status" | "recordedBy"> & { status?: TxStatus; recordedBy?: string },
): Promise<Transaction> => {
  const response = await fetch(`${API_BASE_URL}/finance/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create transaction."));
  const payload = (await response.json()) as { transaction: Transaction };
  return payload.transaction;
};

export const initiateSavingsMobileMoneyPayment = async (
  accessToken: string,
  input: {
    amount: number;
    phone: string;
    note?: string;
    message?: string;
    description?: string;
  },
): Promise<SavingsMobileMoneyPayment> => {
  const response = await fetch(`${API_BASE_URL}/finance/savings/mobile-money/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to initiate mobile money payment."));
  }
  const payload = (await response.json()) as { payment: SavingsMobileMoneyPayment };
  return payload.payment;
};

export const getSavingsMobileMoneyPayment = async (
  accessToken: string,
  paymentId: string,
): Promise<SavingsMobileMoneyPayment> => {
  const response = await fetch(`${API_BASE_URL}/finance/savings/mobile-money/${paymentId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to load mobile money payment status."));
  }
  const payload = (await response.json()) as { payment: SavingsMobileMoneyPayment };
  return payload.payment;
};

export const updateTransactionStatus = async (
  accessToken: string,
  transactionId: string,
  status: TxStatus,
): Promise<Transaction> => {
  const response = await fetch(`${API_BASE_URL}/finance/transactions/${transactionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update transaction status."));
  const payload = (await response.json()) as { transaction: Transaction };
  return payload.transaction;
};

export const deleteTransaction = async (
  accessToken: string,
  transactionId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/finance/transactions/${transactionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete transaction."));
};

export const listBudgets = async (accessToken: string): Promise<Budget[]> => {
  const response = await fetch(`${API_BASE_URL}/finance/budgets`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load budgets."));
  const payload = (await response.json()) as { items: Budget[] };
  return payload.items;
};

export const createBudget = async (
  accessToken: string,
  input: Omit<Budget, "id">,
): Promise<Budget> => {
  const response = await fetch(`${API_BASE_URL}/finance/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create budget."));
  const payload = (await response.json()) as { budget: Budget };
  return payload.budget;
};

export const updateBudget = async (
  accessToken: string,
  budgetId: string,
  input: Partial<Budget>,
): Promise<Budget> => {
  const response = await fetch(`${API_BASE_URL}/finance/budgets/${budgetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update budget."));
  const payload = (await response.json()) as { budget: Budget };
  return payload.budget;
};

export const deleteBudget = async (
  accessToken: string,
  budgetId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/finance/budgets/${budgetId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete budget."));
};

export const getMySavings = async (
  accessToken: string,
): Promise<{ balance: number; transactions: Transaction[] }> => {
  const response = await fetch(`${API_BASE_URL}/finance/savings/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load savings."));
  return (await response.json()) as { balance: number; transactions: Transaction[] };
};

export const getMemberSavings = async (
  accessToken: string,
  memberId: string,
): Promise<{ balance: number; transactions: Transaction[] }> => {
  const response = await fetch(`${API_BASE_URL}/finance/savings/${memberId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load member savings."));
  return (await response.json()) as { balance: number; transactions: Transaction[] };
};

export const getFinanceSummary = async (
  accessToken: string,
): Promise<{ fundBalances: Record<string, number>; totalIn: number; totalOut: number }> => {
  const response = await fetch(`${API_BASE_URL}/finance/summary`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load finance summary."));
  return (await response.json()) as { fundBalances: Record<string, number>; totalIn: number; totalOut: number };
};

// ---------- Selectors / helpers ----------

export const fundBalance = (txs: Transaction[], fundId: FundId) =>
  txs
    .filter(t => t.fundId === fundId && t.status === "approved")
    .reduce((sum, t) => sum + (t.direction === "in" ? t.amount : -t.amount), 0);

export const memberSavings = (txs: Transaction[], memberId: string) =>
  txs
    .filter(t => t.memberId === memberId && t.fundId === "savings" && t.status === "approved")
    .reduce((sum, t) => sum + (t.direction === "in" ? t.amount : -t.amount), 0);

export const memberSavingsTransactions = (txs: Transaction[], memberId: string) =>
  txs
    .filter(t => t.memberId === memberId && t.fundId === "savings")
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

export const totalIn = (txs: Transaction[]) =>
  txs.filter(t => t.direction === "in" && t.status === "approved").reduce((s, t) => s + t.amount, 0);

export const totalOut = (txs: Transaction[]) =>
  txs.filter(t => t.direction === "out" && t.status === "approved").reduce((s, t) => s + t.amount, 0);

export const isInPeriod = (date: string, period: string) => {
  // period = "YYYY-Qn" or "YYYY-MM" or "YYYY"
  const [yearStr, qOrMonth] = period.split("-");
  const year = Number(yearStr);
  const d = new Date(date);
  if (d.getFullYear() !== year) return false;
  if (!qOrMonth) return true;
  if (qOrMonth.startsWith("Q")) {
    const q = Number(qOrMonth.slice(1));
    const month = d.getMonth() + 1;
    return month >= (q - 1) * 3 + 1 && month <= q * 3;
  }
  return d.getMonth() + 1 === Number(qOrMonth);
};

export const fmtRwf = (n: number) =>
  "Rwf " + new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(n);
