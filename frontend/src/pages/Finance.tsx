import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { FinanceOverview } from "@/components/finance/FinanceOverview";
import { TransactionsLedger } from "@/components/finance/TransactionsLedger";
import { MemberSavings } from "@/components/finance/MemberSavings";
import { BudgetsReports } from "@/components/finance/BudgetsReports";
import { NewTransactionDialog } from "@/components/finance/NewTransactionDialog";
import { PaginationFooter } from "@/components/PaginationFooter";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import {
  fmtRwf,
  Transaction,
  SavingsMobileMoneyPayment,
  listTransactions,
  getMySavings,
  getSavingsMobileMoneyPayment,
  initiateSavingsMobileMoneyPayment,
} from "@/data/financeStore";
import { Role, hasRolePermission } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

const Finance = () => {
  const { role } = useRole();

  if (role === "member") {
    return <MemberFinancePortal />;
  }

  return <LeadershipFinancePortal role={role} />;
};

const LeadershipFinancePortal = ({ role }: { role: Role }) => {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const canRecordTransaction = hasRolePermission(role, "finance.manage");
  const canViewSensitive = hasRolePermission(role, "finance.view_sensitive");

  return (
    <div className="space-y-6">
      <PageHeader title="Finance" subtitle="Funds, savings, contributions and budgets in one place">
        {canRecordTransaction && (
          <Button
            onClick={() => setOpen(true)}
            className="gradient-primary text-primary-foreground border-0 hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> Record transaction
          </Button>
        )}
      </PageHeader>

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canViewSensitive && <TabsTrigger value="ledger">Transactions</TabsTrigger>}
          {canViewSensitive && <TabsTrigger value="savings">Member savings</TabsTrigger>}
          {canViewSensitive && <TabsTrigger value="budgets">Budgets & reports</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="mt-5"><FinanceOverview refreshKey={refreshKey} /></TabsContent>
        {canViewSensitive && <TabsContent value="ledger" className="mt-5"><TransactionsLedger refreshKey={refreshKey} onRefresh={refresh} /></TabsContent>}
        {canViewSensitive && <TabsContent value="savings" className="mt-5"><MemberSavings refreshKey={refreshKey} /></TabsContent>}
        {canViewSensitive && <TabsContent value="budgets" className="mt-5"><BudgetsReports refreshKey={refreshKey} onRefresh={refresh} /></TabsContent>}
      </Tabs>

      {canRecordTransaction && <NewTransactionDialog open={open} onOpenChange={setOpen} onCreated={refresh} />}
    </div>
  );
};

const MemberFinancePortal = () => {
  const { accessToken, isReady } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [savingsBalance, setSavingsBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activePayment, setActivePayment] = useState<SavingsMobileMoneyPayment | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    if (!isReady || !accessToken) { setIsLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [txnRes, savings] = await Promise.all([
          listTransactions(accessToken),
          getMySavings(accessToken),
        ]);
        if (!cancelled) {
          setTransactions(txnRes.items);
          setSavingsBalance(savings.balance ?? 0);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load finance data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const myTransactions = useMemo(
    () => [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const ql = query.trim().toLowerCase();
    if (!ql) return myTransactions;
    return myTransactions.filter((t) => {
      return (
        t.description.toLowerCase().includes(ql) ||
        t.reference.toLowerCase().includes(ql) ||
        t.status.toLowerCase().includes(ql) ||
        t.type.toLowerCase().includes(ql)
      );
    });
  }, [myTransactions, query]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, page, pageSize]);

  const approvedSavingsDeposits = myTransactions
    .filter((t) => t.direction === "in" && t.type === "savings_deposit" && t.status === "approved")
    .reduce((sum, t) => sum + t.amount, 0);

  useEffect(() => {
    const paymentId = activePayment?.id;
    const paymentStatus = activePayment?.status;
    if (!accessToken || !paymentId || paymentStatus !== "pending") {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const latest = await getSavingsMobileMoneyPayment(accessToken, paymentId);
        if (cancelled) return;

        setActivePayment(latest);

        if (latest.status === "pending") {
          timer = setTimeout(() => {
            void poll();
          }, 5000);
          return;
        }

        if (latest.status === "success") {
          toast.success("Savings payment completed and posted to your account.");
          setRefreshKey((k) => k + 1);
          return;
        }

        if (latest.status === "failed") {
          toast.error(latest.failureReason || "Mobile money payment failed.");
          return;
        }

        toast.error(latest.status === "cancelled" ? "Payment was cancelled." : "Payment window expired before confirmation.");
      } catch {
        if (cancelled) return;
        timer = setTimeout(() => {
          void poll();
        }, 8000);
      }
    };

    timer = setTimeout(() => {
      void poll();
    }, 5000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [accessToken, activePayment?.id, activePayment?.status]);

  const submitSavingsPayment = async () => {
    if (!accessToken) { toast.error("Please sign in again."); return; }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }

    if (phone.trim().length < 9) {
      toast.error("Enter a valid mobile-money number.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payment = await initiateSavingsMobileMoneyPayment(accessToken, {
        amount: parsedAmount,
        phone,
        note: note.trim() || undefined,
        description: note.trim() || "Savings deposit via mobile money",
      });
      setActivePayment(payment);
      if (payment.status === "pending") {
        toast.success("Payment prompt sent. Approve it on your phone.");
      } else if (payment.status === "success") {
        toast.success("Savings payment completed and posted to your account.");
        setRefreshKey((k) => k + 1);
      } else if (payment.status === "failed" || payment.status === "cancelled") {
        toast.error(payment.failureReason || "Mobile money payment failed.");
      } else {
        toast.error("Payment window expired before confirmation.");
      }
      setAmount("");
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to initiate savings payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Finance" subtitle="View your savings balance, pay savings via mobile money, and track your receipts" />

      {isLoading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Loading finance data...</Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-4 shadow-elegant">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Personal savings balance</div>
              <div className="mt-1 font-display text-2xl font-bold text-primary">{fmtRwf(savingsBalance)}</div>
            </Card>
            <Card className="p-4 shadow-elegant">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Approved savings deposits</div>
              <div className="mt-1 font-display text-2xl font-bold">{fmtRwf(approvedSavingsDeposits)}</div>
            </Card>
            <Card className="p-4 shadow-elegant">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">My savings transactions</div>
              <div className="mt-1 font-display text-2xl font-bold">{myTransactions.length}</div>
            </Card>
          </div>

          <Card className="p-5 shadow-elegant space-y-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Pay savings with mobile money</h2>
              <p className="text-xs text-muted-foreground">Use MTN MoMo (078/079) or Airtel Money (072/073). Your savings is posted automatically when payment succeeds.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="member-amount">Amount (Rwf)</Label>
                <Input
                  id="member-amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-phone">Phone number</Label>
                <Input
                  id="member-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XXXXXXXX"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="member-description">Note (optional)</Label>
                <Input
                  id="member-description"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a payment note"
                />
              </div>
            </div>

            <Button onClick={() => void submitSavingsPayment()} disabled={isSubmitting} className="gradient-primary text-primary-foreground border-0 hover:opacity-90">
              <Plus className="h-4 w-4 mr-2" /> {isSubmitting ? "Sending prompt..." : "Send payment prompt"}
            </Button>

            {activePayment && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">Ref: {activePayment.requestRef}</div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-0 capitalize text-[10px]",
                      activePayment.status === "success" && "bg-success/15 text-success",
                      activePayment.status === "pending" && "bg-warning/15 text-warning",
                      activePayment.status === "failed" && "bg-destructive/15 text-destructive",
                      activePayment.status === "cancelled" && "bg-muted text-muted-foreground",
                      activePayment.status === "expired" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {activePayment.status}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Provider: {activePayment.provider === "momo" ? "MTN MoMo" : "Airtel Money"} · Phone: {activePayment.phone} · Amount: {fmtRwf(activePayment.amount)}
                </div>
                {activePayment.failureReason && (
                  <div className="mt-2 text-xs text-destructive">{activePayment.failureReason}</div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5 shadow-elegant">
            <h2 className="font-display text-lg font-semibold">My transaction history</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search transactions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="sm:max-w-xs"
              />
              <div className="text-xs text-muted-foreground">
                {filteredTransactions.length} result{filteredTransactions.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {pagedTransactions.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(t.date), "MMM d, yyyy")} · {t.reference}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn("text-sm font-semibold", t.direction === "in" ? "text-success" : "text-foreground")}>
                      {t.direction === "in" ? "+" : "-"}{fmtRwf(t.amount)}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-0 capitalize text-[10px]",
                        t.status === "approved" && "bg-success/15 text-success",
                        t.status === "pending" && "bg-warning/15 text-warning",
                        t.status === "rejected" && "bg-destructive/15 text-destructive",
                      )}
                    >
                      {t.status}
                    </Badge>
                    <Link to={`/finance/receipts/${t.id}`}>
                      <Button variant="outline" size="sm">Receipt</Button>
                    </Link>
                  </div>
                </div>
              ))}

              {filteredTransactions.length === 0 && (
                <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
                  No personal transactions yet.
                </div>
              )}
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                totalItems={filteredTransactions.length}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default Finance;
