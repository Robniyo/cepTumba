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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRole } from "@/context/RoleContext";
import {
  AssociationRequest,
  REQUEST_TYPE_LABEL,
  RequestStatus,
  RequestType,
  listRequests,
  createRequest,
  updateRequestStatus,
} from "@/data/requestsStore";
import { useAuth } from "@/context/AuthContext";
import { fmtRwf } from "@/data/financeStore";
import { CheckCircle2, ClipboardList, Clock3, Plus, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RolePermission, hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const MEMBER_REQUEST_TYPES: RequestType[] = ["prayer_support", "welfare_help", "financial_aid", "leader_apology"];

const statusStyles: Record<RequestStatus, string> = {
  pending: "bg-warning/15 text-warning",
  in_review: "bg-info/15 text-info",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};

const REVIEW_PERMISSION_BY_TYPE: Record<RequestType, RolePermission> = {
  prayer_support: "requests.review.spiritual",
  welfare_help: "requests.review.social",
  financial_aid: "requests.review.financial",
  budget_request: "requests.review.financial",
  reimbursement: "requests.review.financial",
  event_approval: "requests.review.admin",
  leader_apology: "requests.review.admin",
};

const Requests = () => {
  const { role } = useRole();
  const { user, accessToken, isReady } = useAuth();
  const currentName = user?.name ?? "Current User";

  const [requests, setRequests] = useState<AssociationRequest[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    void listRequests(accessToken).then(r => { if (!cancelled) setRequests(r); }).catch((err) => {
      if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load requests.");
    });
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const canReviewType = (type: RequestType) => hasRolePermission(role, REVIEW_PERMISSION_BY_TYPE[type]);
  const allowedTypes = role === "member"
    ? MEMBER_REQUEST_TYPES
    : (Object.keys(REQUEST_TYPE_LABEL) as RequestType[]);
  const visibleRequests = role === "member"
    ? requests.filter((r) => r.requesterName === currentName || (currentName === "Current User" && r.requesterName === "Current User"))
    : requests.filter((r) => canReviewType(r.type) || r.requesterName === currentName);

  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [draft, setDraft] = useState({
    type: "prayer_support" as RequestType,
    title: "",
    description: "",
    amount: "",
  });

  const filtered = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return visibleRequests.filter((r) => {
      const matchesQuery =
        !ql ||
        r.title.toLowerCase().includes(ql) ||
        r.description.toLowerCase().includes(ql) ||
        r.requesterName.toLowerCase().includes(ql) ||
        r.requesterRole.toLowerCase().includes(ql) ||
        REQUEST_TYPE_LABEL[r.type].toLowerCase().includes(ql);
      const matchesType = typeFilter === "all" || r.type === typeFilter;
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [visibleRequests, typeFilter, statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const pending = visibleRequests.filter((r) => r.status === "pending" || r.status === "in_review").length;
  const approved = visibleRequests.filter((r) => r.status === "approved").length;
  const rejected = visibleRequests.filter((r) => r.status === "rejected").length;

  const submit = async () => {
    if (!draft.title.trim() || !draft.description.trim() || !accessToken) return;
    const amount = Number(draft.amount);
    setIsSubmitting(true);
    try {
      await createRequest(accessToken, {
        type: draft.type,
        title: draft.title.trim(),
        description: draft.description.trim(),
        amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      });
      toast.success("Request submitted");
      setDraft({ type: "prayer_support", title: "", description: "", amount: "" });
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Requests & Approvals" subtitle="Track support requests and handle approvals transparently">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit request</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Type</div>
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as RequestType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedTypes.map((k) => (
                      <SelectItem key={k} value={k}>{REQUEST_TYPE_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Request title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <Textarea
                placeholder="Explain your request"
                rows={4}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Amount (optional)"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Pending" value={pending} icon={Clock3} variant="accent" trend="awaiting review" />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} variant="success" trend="fulfilled" />
        <StatCard label="Rejected" value={rejected} icon={XCircle} variant="info" trend="logged decisions" />
      </div>

      <Card className="p-4 shadow-elegant">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            placeholder="Search requests, members, or types"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:col-span-2 lg:col-span-1"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {allowedTypes.map((k) => (
                <SelectItem key={k} value={k}>{REQUEST_TYPE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_review">In review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="space-y-3">
        {paged.map((r) => (
          <Card key={r.id} className="p-4 shadow-elegant">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{r.title}</h3>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusStyles[r.status])}>
                    {r.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {REQUEST_TYPE_LABEL[r.type]} · {r.requesterName} ({r.requesterRole})
                </div>
                <p className="mt-2 text-sm text-foreground/90">{r.description}</p>
                <div className="mt-2 text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                  {r.amount ? ` · ${fmtRwf(r.amount)}` : ""}
                </div>
                {r.reviewNote && (
                  <div className="mt-2 rounded-md bg-secondary/50 px-3 py-2 text-xs">
                    <span className="font-medium">Review note:</span> {r.reviewNote}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {canReviewType(r.type) && r.status !== "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-success hover:bg-success/10"
                    onClick={() => { if (accessToken) void updateRequestStatus(accessToken, r.id, { status: "approved", reviewNote: "Approved for execution" }).then(() => { toast.success("Approved"); refresh(); }).catch(() => toast.error("Failed")); }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                )}
                {canReviewType(r.type) && r.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => { if (accessToken) void updateRequestStatus(accessToken, r.id, { status: "rejected", reviewNote: "Rejected after review" }).then(() => { toast.success("Rejected"); refresh(); }).catch(() => toast.error("Failed")); }}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                )}
                {canReviewType(r.type) && r.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { if (accessToken) void updateRequestStatus(accessToken, r.id, { status: "in_review", reviewNote: "Review in progress" }).then(() => { toast.success("In review"); refresh(); }).catch(() => toast.error("Failed")); }}
                  >
                    <ClipboardList className="h-3.5 w-3.5 mr-1" /> Review
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}

        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No requests match these filters.
          </Card>
        )}
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
};

export default Requests;
