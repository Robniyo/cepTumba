import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PaginationFooter } from "@/components/PaginationFooter";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Budget, Transaction, FUNDS, FundId, isInPeriod, fmtRwf, listBudgets, createBudget, deleteBudget, listTransactions } from "@/data/financeStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PERIODS = [
  { id: "2026-Q1", label: "Q1 2026" },
  { id: "2026-Q2", label: "Q2 2026" },
  { id: "2026-Q3", label: "Q3 2026" },
  { id: "2026-Q4", label: "Q4 2026" },
];

export const BudgetsReports = ({ refreshKey, onRefresh }: { refreshKey?: number; onRefresh?: () => void }) => {
  const { role } = useRole();
  const { accessToken, isReady } = useAuth();
  const canManageBudgets = hasRolePermission(role, "finance.manage");
  const [period, setPeriod] = useState("2026-Q2");
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<{ fundId: FundId; category: string; budgeted: string }>({
    fundId: "welfare", category: "", budgeted: "",
  });

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [b, t] = await Promise.all([
          listBudgets(accessToken),
          listTransactions(accessToken),
        ]);
        if (!cancelled) {
          setBudgets(b);
          setTransactions(t.items);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load budgets.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const periodLabel = PERIODS.find(p => p.id === period)?.label ?? period;
  const periodBudgets = budgets.filter(b => b.period === period);

  const rows = useMemo(() => {
    return periodBudgets.map(b => {
      const txs = transactions.filter(t =>
        t.fundId === b.fundId && t.status === "approved" && isInPeriod(t.date, period)
      );
      const treatAsIncome = b.fundId === "tithe";
      const actual = treatAsIncome
        ? txs.filter(t => t.direction === "in").reduce((s, t) => s + t.amount, 0)
        : txs.filter(t => t.direction === "out").reduce((s, t) => s + t.amount, 0);
      const variance = treatAsIncome ? actual - b.budgeted : b.budgeted - actual;
      const pct = b.budgeted > 0 ? Math.min(100, Math.round((actual / b.budgeted) * 100)) : 0;
      return { ...b, actual, variance, pct, treatAsIncome };
    });
  }, [periodBudgets, transactions, period]);

  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  const filteredRows = useMemo(() => {
    const ql = query.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((row) => {
      const fundName = FUNDS.find((f) => f.id === row.fundId)?.name ?? "";
      return row.category.toLowerCase().includes(ql) || fundName.toLowerCase().includes(ql);
    });
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const submit = async () => {
    if (!canManageBudgets || !accessToken) {
      toast.error("You do not have permission to edit budgets.");
      return;
    }
    const amt = Number(draft.budgeted);
    if (!draft.category.trim() || !amt || amt <= 0) {
      toast.error("Enter a category and amount");
      return;
    }
    setIsSubmitting(true);
    try {
      await createBudget(accessToken, { fundId: draft.fundId, category: draft.category.trim(), budgeted: amt, period, label: periodLabel });
      toast.success("Budget added");
      setDraft({ fundId: "welfare", category: "", budgeted: "" });
      setOpen(false);
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create budget.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-4 shadow-elegant space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Period</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          </div>

          {canManageBudgets && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground border-0 hover:opacity-90">
                  <Plus className="h-4 w-4 mr-2" /> Add budget line
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New budget line · {periodLabel}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Fund</Label>
                    <Select value={draft.fundId} onValueChange={(v) => setDraft({ ...draft, fundId: v as FundId })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FUNDS.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Outreach transport" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount (Rwf)</Label>
                    <Input type="number" value={draft.budgeted} onChange={e => setDraft({ ...draft, budgeted: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => void submit()} disabled={isSubmitting} className="gradient-primary text-primary-foreground border-0">{isSubmitting ? "Saving..." : "Save"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search budget lines or funds"
          className="sm:max-w-xs"
        />
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total budgeted" value={fmtRwf(totalBudgeted)} cls="text-primary" />
        <SummaryCard label="Total actual" value={fmtRwf(totalActual)} cls="text-foreground" />
        <SummaryCard
          label="Net variance"
          value={fmtRwf(totalBudgeted - totalActual)}
          cls={totalActual <= totalBudgeted ? "text-success" : "text-destructive"}
        />
      </div>

      <div className="space-y-3">
        {filteredRows.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground shadow-elegant">
            No budget lines for {periodLabel}. Click "Add budget line" to start.
          </Card>
        )}
        {pagedRows.map(row => {
          const fund = FUNDS.find(f => f.id === row.fundId)!;
          const over = !row.treatAsIncome && row.actual > row.budgeted;
          const under = row.treatAsIncome && row.actual < row.budgeted;
          const barCls = over
            ? "bg-destructive"
            : under
            ? "bg-warning"
            : row.treatAsIncome ? "bg-success" : "bg-primary";
          return (
            <Card key={row.id} className="p-5 shadow-elegant">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-display font-bold">{row.category}</h4>
                    <Badge variant="outline" className="text-[10px]">{fund.name}</Badge>
                    {row.treatAsIncome && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-0">Income target</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Actual {fmtRwf(row.actual)} of {fmtRwf(row.budgeted)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex items-center gap-1 text-sm font-semibold",
                    (over || under) ? "text-destructive" : "text-success"
                  )}>
                    {row.variance >= 0
                      ? <TrendingUp className="h-3.5 w-3.5" />
                      : <TrendingDown className="h-3.5 w-3.5" />}
                    {fmtRwf(Math.abs(row.variance))} {row.treatAsIncome
                      ? (row.variance >= 0 ? "above target" : "below target")
                      : (row.variance >= 0 ? "remaining" : "over budget")}
                  </div>
                  {canManageBudgets && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => { if (accessToken) void deleteBudget(accessToken, row.id).then(() => { toast.success("Budget removed"); onRefresh?.(); }).catch(() => toast.error("Failed to remove budget.")); }}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", barCls)}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                <span>{row.pct}% used</span>
                <span>Period: {row.label}</span>
              </div>
            </Card>
          );
        })}
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, cls }: { label: string; value: string; cls: string }) => (
  <Card className="p-4 shadow-elegant">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={cn("mt-1 font-display text-2xl font-bold", cls)}>{value}</div>
  </Card>
);
