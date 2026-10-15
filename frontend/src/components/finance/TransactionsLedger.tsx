import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaginationFooter } from "@/components/PaginationFooter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import { Transaction, FUNDS, TX_TYPE_LABEL, TxType, FundId, TxStatus, fmtRwf, PAYMENT_LABEL, exportTransactions, listTransactions, updateTransactionStatus } from "@/data/financeStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { Search, ArrowDownRight, ArrowUpRight, FileText, CheckCircle2, XCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import { toast } from "sonner";

export const TransactionsLedger = ({ refreshKey, onRefresh }: { refreshKey?: number; onRefresh?: () => void }) => {
  const { role } = useRole();
  const { accessToken, isReady } = useAuth();
  const canApprove = hasRolePermission(role, "finance.approve");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await listTransactions(accessToken);
        if (!cancelled) setTransactions(res.items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load transactions.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const handleStatusUpdate = async (id: string, status: "approved" | "rejected") => {
    if (!accessToken) return;
    try {
      await updateTransactionStatus(accessToken, id, status);
      toast.success(status === "approved" ? "Approved" : "Rejected");
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.");
    }
  };
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [fundFilter, setFundFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const filtered = useMemo(() => {
    return transactions
      .filter(t => {
        const matches = `${t.description} ${t.reference} ${t.memberId ?? ""}`
          .toLowerCase().includes(q.toLowerCase());
        const tOk = typeFilter === "all" || t.type === typeFilter;
        const fOk = fundFilter === "all" || t.fundId === fundFilter;
        const sOk = statusFilter === "all" || t.status === statusFilter;
        const fromOk = !from || t.date >= from;
        const toOk = !to || t.date <= to;
        return matches && tOk && fOk && sOk && fromOk && toOk;
      })
      .sort((a, b) => +new Date(b.date) - +new Date(a.date) || b.id.localeCompare(a.id));
  }, [transactions, q, typeFilter, fundFilter, statusFilter, from, to]);

  const totalIn = filtered.filter(t => t.direction === "in" && t.status === "approved").reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter(t => t.direction === "out" && t.status === "approved").reduce((s, t) => s + t.amount, 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsExporting(true);
    try {
      const { blob, fileName } = await exportTransactions(accessToken, format, {
        fundId: fundFilter === "all" ? undefined : (fundFilter as FundId),
        type: typeFilter === "all" ? undefined : (typeFilter as TxType),
        status: statusFilter === "all" ? undefined : (statusFilter as TxStatus),
      });
      downloadBlob(blob, fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export transactions.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExport("csv")}>Export CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExport("xlsx")}>Export Excel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Card className="p-4 shadow-elegant">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ref, description, member…" className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(TX_TYPE_LABEL) as TxType[]).map(t => <SelectItem key={t} value={t}>{TX_TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fundFilter} onValueChange={setFundFilter}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Fund" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All funds</SelectItem>
              {FUNDS.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="md:col-span-1" aria-label="From" />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="md:col-span-1" aria-label="To" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Pill label="Money in" value={fmtRwf(totalIn)} cls="bg-success/10 text-success" />
          <Pill label="Money out" value={fmtRwf(totalOut)} cls="bg-destructive/10 text-destructive" />
          <Pill label="Net" value={fmtRwf(totalIn - totalOut)} cls="bg-primary/10 text-primary" />
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {paged.map(t => {
          const fund = FUNDS.find(f => f.id === t.fundId)!;
          return (
            <Card key={t.id} className="p-3 shadow-elegant">
              <div className="flex items-start gap-3">
                <Direction dir={t.direction} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{t.description}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(new Date(t.date), "MMM d, yyyy")} · {fund.name}{t.memberId ? ` · ${t.memberId}` : ""}
                      </div>
                    </div>
                    <div className={cn("text-sm font-bold", t.direction === "in" ? "text-success" : "text-foreground")}>
                      {t.direction === "in" ? "+" : "-"}{fmtRwf(t.amount)}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <StatusBadge status={t.status} />
                    <Badge variant="outline" className="text-[10px]">{PAYMENT_LABEL[t.paymentMethod]}</Badge>
                    <Link to={`/finance/receipts/${t.id}`} className="ml-auto">
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        <FileText className="h-3 w-3 mr-1" /> {t.reference}
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No transactions match.</Card>
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden shadow-elegant">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Reference</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Fund</th>
                <th className="text-left px-4 py-3 font-medium">Member</th>
                <th className="text-left px-4 py-3 font-medium">Method</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.map(t => {
                const fund = FUNDS.find(f => f.id === t.fundId)!;
                return (
                  <tr key={t.id} className="hover:bg-secondary/40 transition-base">
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{format(new Date(t.date), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 font-mono text-xs">{t.reference}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Direction dir={t.direction} small />
                        <span className="truncate">{t.description}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{TX_TYPE_LABEL[t.type]}</div>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{fund.name}</Badge></td>
                    <td className="px-4 py-3 text-xs">{t.memberId ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-xs">{PAYMENT_LABEL[t.paymentMethod]}</td>
                    <td className={cn("px-4 py-3 text-right font-semibold", t.direction === "in" ? "text-success" : "text-foreground")}>
                      {t.direction === "in" ? "+" : "-"}{fmtRwf(t.amount)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {t.status === "pending" && canApprove && (
                        <>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-success hover:bg-success/10"
                            onClick={() => void handleStatusUpdate(t.id, "approved")}
                            aria-label="Approve"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => void handleStatusUpdate(t.id, "rejected")}
                            aria-label="Reject"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Link to={`/finance/receipts/${t.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Receipt">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No transactions match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
};

const Direction = ({ dir, small }: { dir: "in" | "out"; small?: boolean }) => (
  <div className={cn(
    "flex items-center justify-center rounded-full",
    small ? "h-5 w-5" : "h-9 w-9",
    dir === "in" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
  )}>
    {dir === "in" ? <ArrowDownRight className={small ? "h-3 w-3" : "h-4 w-4"} /> : <ArrowUpRight className={small ? "h-3 w-3" : "h-4 w-4"} />}
  </div>
);

const StatusBadge = ({ status }: { status: "approved" | "pending" | "rejected" }) => {
  const map = {
    approved: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    rejected: "bg-destructive/15 text-destructive",
  };
  return <Badge variant="outline" className={cn(map[status], "border-0 capitalize text-[10px]")}>{status}</Badge>;
};

const Pill = ({ label, value, cls }: { label: string; value: string; cls: string }) => (
  <div className={cn("rounded-lg p-2.5", cls)}>
    <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
    <div className="font-display text-base font-bold">{value}</div>
  </div>
);
