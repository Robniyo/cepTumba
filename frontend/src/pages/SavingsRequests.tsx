import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaginationFooter } from "@/components/PaginationFooter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRole } from "@/context/RoleContext";
import {
  AssociationRequest,
  RequestStatus,
  createSavingsWithdrawalRequest,
  listRequests,
  updateRequestStatus,
} from "@/data/requestsStore";
import { useAuth } from "@/context/AuthContext";
import { fmtRwf, listTransactions } from "@/data/financeStore";
import { CheckCircle2, Clock3, Plus, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RolePermission, hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type ApiMember = {
  id: string;
  fullName: string;
  email: string | null;
};

const statusStyles: Record<RequestStatus, string> = {
  pending: "bg-warning/15 text-warning",
  in_review: "bg-info/15 text-info",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};

const statusIcons: Record<RequestStatus, React.ReactNode> = {
  pending: <Clock3 className="w-4 h-4" />,
  in_review: <AlertCircle className="w-4 h-4" />,
  approved: <CheckCircle2 className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
};

const fetchCurrentMember = async (accessToken: string, userEmail: string): Promise<ApiMember | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/members`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { items: ApiMember[] };
    // Find member by email
    return data.items.find((m) => m.email === userEmail) ?? null;
  } catch {
    return null;
  }
};

const SavingsRequests = () => {
  const { role } = useRole();
  const { user, accessToken, isReady } = useAuth();
  const currentName = user?.name ?? "User";

  const [requests, setRequests] = useState<AssociationRequest[]>([]);
  const [savingsBalance, setSavingsBalance] = useState<number>(0);
  const [currentMember, setCurrentMember] = useState<ApiMember | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const isAccountant = role === "accountant";
  const isMember = role === "member";

  // Fetch current member record
  useEffect(() => {
    if (!isReady || !accessToken || !user?.email) return;
    let cancelled = false;
    void fetchCurrentMember(accessToken, user.email)
      .then((member) => {
        if (!cancelled) setCurrentMember(member);
      })
      .catch(() => {
        if (!cancelled) setCurrentMember(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady, user?.email]);

  // Fetch savings balance for current member
  useEffect(() => {
    if (!isReady || !accessToken || !isMember) return;
    setIsLoadingBalance(true);
    let cancelled = false;
    void listTransactions(accessToken, { fundId: "savings" })
      .then((response) => {
        if (cancelled) return;
        const balance = response.items.reduce((acc, tx) => {
          if (tx.status !== "approved") return acc;
          return acc + (tx.direction === "in" ? tx.amount : -tx.amount);
        }, 0);
        setSavingsBalance(Math.max(0, balance));
      })
      .catch((err) => {
        if (!cancelled) toast.error("Failed to load savings balance");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBalance(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady, isMember, refreshKey]);

  // Fetch requests
  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    void listRequests(accessToken)
      .then((r) => {
        if (cancelled) return;
        // Filter only savings_withdrawal requests
        const savingsRequests = r.filter((req) => req.type === "savings_withdrawal");
        if (isMember) {
          // Members see only their own
          setRequests(savingsRequests.filter((req) => req.requesterName === currentName));
        } else if (isAccountant) {
          // Accountants see all
          setRequests(savingsRequests);
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load requests");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady, isMember, isAccountant, currentName, refreshKey]);

  const savingsRequests = useMemo(() => {
    return requests.filter((r) => r.type === "savings_withdrawal");
  }, [requests]);

  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [draft, setDraft] = useState({
    amount: "",
    reason: "",
    additionalDetails: "",
  });

  const [approvalDialog, setApprovalDialog] = useState<{
    requestId: string;
    action: "approve" | "reject";
    reviewNote: string;
  } | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const filtered = useMemo(() => {
    let result = savingsRequests;
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [savingsRequests, statusFilter]);

  const { items: itemsForPage, totalPages } = useMemo(() => {
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return { items: items, totalPages: Math.ceil(filtered.length / pageSize) };
  }, [filtered, page]);

  const handleCreateRequest = async () => {
    if (!accessToken) return;
    if (!draft.amount || !draft.reason) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!currentMember) {
      toast.error("Member information not loaded yet. Please try again.");
      return;
    }

    const amount = parseInt(draft.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (amount > savingsBalance) {
      toast.error("Request amount exceeds your savings balance");
      return;
    }

    setIsSubmitting(true);
    try {
      await createSavingsWithdrawalRequest(accessToken, {
        memberId: currentMember.id,
        amount,
        reason: draft.reason,
        additionalDetails: draft.additionalDetails || undefined,
      });
      toast.success("Savings withdrawal request created successfully");
      setOpenCreateDialog(false);
      setDraft({ amount: "", reason: "", additionalDetails: "" });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveReject = async () => {
    if (!accessToken || !approvalDialog) return;
    setIsApproving(true);
    try {
      await updateRequestStatus(accessToken, approvalDialog.requestId, {
        status: approvalDialog.action === "approve" ? "approved" : "rejected",
        reviewNote: approvalDialog.reviewNote || undefined,
      });
      toast.success(`Request ${approvalDialog.action}d successfully`);
      setApprovalDialog(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update request");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Savings Requests" subtitle="Manage your savings withdrawal requests" />

      {isMember && (
        <div className="grid md:grid-cols-2 gap-4">
          <StatCard
            label="Current Savings Balance"
            value={fmtRwf(savingsBalance)}
            icon={CheckCircle2}
            variant="info"
          />
          <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
            <DialogTrigger asChild>
              <Button className="w-full h-full text-lg font-semibold">
                <Plus className="w-5 h-5 mr-2" />
                Request Withdrawal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Savings Withdrawal</DialogTitle>
                <DialogDescription>
                  Available Balance: {fmtRwf(savingsBalance)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Amount (RWF)</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {draft.amount && parseInt(draft.amount) > savingsBalance && (
                    <p className="text-xs text-destructive mt-1">
                      Amount exceeds your savings balance
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Reason for Withdrawal</label>
                  <Textarea
                    placeholder="e.g., Emergency medical expenses, tuition payment..."
                    value={draft.reason}
                    onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                    maxLength={500}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {draft.reason.length}/500
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Additional Details (Optional)</label>
                  <Textarea
                    placeholder="Any additional information..."
                    value={draft.additionalDetails}
                    onChange={(e) => setDraft({ ...draft, additionalDetails: e.target.value })}
                    maxLength={1000}
                    disabled={isSubmitting}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {draft.additionalDetails.length}/1000
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreateDialog(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={handleCreateRequest} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isAccountant && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Pending Withdrawal Requests</h2>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {itemsForPage.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            No savings withdrawal requests found
          </Card>
        ) : (
          itemsForPage.map((req) => (
            <Card key={req.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{req.requesterName}</h3>
                    <span className={cn("text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1", statusStyles[req.status])}>
                      {statusIcons[req.status]}
                      {req.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-success">{fmtRwf(req.amount || 0)}</p>
                  <p className="text-xs text-muted-foreground">
                    Balance at request: {fmtRwf(req.memberSavingsBalanceRwf || 0)}
                  </p>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-sm">{req.description}</p>
              </div>

              {isAccountant && req.status === "pending" && (
                <div className="border-t pt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() =>
                      setApprovalDialog({
                        requestId: req.id,
                        action: "approve",
                        reviewNote: "",
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      setApprovalDialog({
                        requestId: req.id,
                        action: "reject",
                        reviewNote: "",
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              )}

              {req.reviewNote && (
                <div className="border-t pt-3 bg-muted/50 p-3 rounded text-sm">
                  <p className="font-medium text-muted-foreground">Reviewer Note:</p>
                  <p>{req.reviewNote}</p>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

      <AlertDialog open={!!approvalDialog} onOpenChange={(open) => !open && setApprovalDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {approvalDialog?.action === "approve" ? "Approve" : "Reject"} Withdrawal Request?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action will send a notification to the member about the decision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Review Note (Optional)</label>
              <Textarea
                placeholder="Add a note explaining your decision..."
                value={approvalDialog?.reviewNote || ""}
                onChange={(e) =>
                  setApprovalDialog((prev) => prev ? { ...prev, reviewNote: e.target.value } : null)
                }
                maxLength={500}
                disabled={isApproving}
              />
            </div>
          </div>
          <AlertDialogCancel disabled={isApproving}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleApproveReject} disabled={isApproving}>
            {isApproving ? "Processing..." : approvalDialog?.action === "approve" ? "Approve" : "Reject"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SavingsRequests;
