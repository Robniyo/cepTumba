import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Transaction, FUNDS, fundBalance, fmtRwf, totalIn, totalOut, isInPeriod, listTransactions } from "@/data/financeStore";
import { useAuth } from "@/context/AuthContext";
import { ArrowDownRight, ArrowUpRight, FileText, TrendingUp, Wallet, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { StatCard } from "@/components/StatCard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const FinanceOverview = ({ refreshKey }: { refreshKey?: number }) => {
  const { accessToken, isReady } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !accessToken) { setIsLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await listTransactions(accessToken);
        if (!cancelled) setTransactions(res.items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load transactions.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  // Current month period like "YYYY-MM"
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTxs = transactions.filter(t => isInPeriod(t.date, month));

  const totalCash = FUNDS.reduce((s, f) => s + Math.max(0, fundBalance(transactions, f.id)), 0);
  const monthIn = totalIn(monthTxs);
  const monthOut = totalOut(monthTxs);
  const pending = transactions.filter(t => t.status === "pending").length;

  const recent = [...transactions]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total cash" value={fmtRwf(totalCash)} icon={Wallet} variant="success" trend="across all funds" />
        <StatCard label="Income (this month)" value={fmtRwf(monthIn)} icon={ArrowDownRight} variant="primary" />
        <StatCard label="Expenses (this month)" value={fmtRwf(monthOut)} icon={ArrowUpRight} variant="accent" />
        <StatCard label="Pending approvals" value={pending} icon={ClipboardList} variant="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fund balances */}
        <Card className="lg:col-span-2 p-6 shadow-elegant">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-bold">Fund balances</h3>
              <p className="text-sm text-muted-foreground">Approved transactions only</p>
            </div>
            <Badge className="bg-success/15 text-success border-0">
              <TrendingUp className="h-3 w-3 mr-1" /> Healthy
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FUNDS.map(f => {
              const balance = fundBalance(transactions, f.id);
              const dotCls: Record<string, string> = {
                primary: "bg-primary",
                success: "bg-success",
                accent: "bg-accent",
                info: "bg-info",
                warning: "bg-warning",
                destructive: "bg-destructive",
              };
              return (
                <div key={f.id} className="rounded-xl border border-border/60 p-4 transition-base hover:shadow-md hover:-translate-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.name}</div>
                    <div className={cn("h-2 w-2 rounded-full", dotCls[f.color])} />
                  </div>
                  <div className="mt-1.5 font-display text-lg font-bold">{fmtRwf(balance)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{f.description}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Quick stats */}
        <Card className="p-6 shadow-elegant">
          <h3 className="font-display text-lg font-bold">This month</h3>
          <div className="mt-4 space-y-3">
            <RatioBar label="Income" value={monthIn} max={Math.max(monthIn, monthOut, 1)} cls="bg-success" />
            <RatioBar label="Expense" value={monthOut} max={Math.max(monthIn, monthOut, 1)} cls="bg-destructive" />
          </div>
          <div className="mt-5 rounded-xl bg-primary/10 text-primary p-4">
            <div className="text-[11px] uppercase tracking-wider opacity-80">Net result</div>
            <div className="font-display text-2xl font-bold mt-1">{fmtRwf(monthIn - monthOut)}</div>
            <div className="text-[11px] mt-1 opacity-80">{monthTxs.length} transactions</div>
          </div>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card className="p-6 shadow-elegant">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold">Recent activity</h3>
        </div>
        <div className="space-y-1">
          {recent.map(t => {
            const fund = FUNDS.find(f => f.id === t.fundId)!;
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-secondary/50 transition-base">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  t.direction === "in" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
                )}>
                  {t.direction === "in" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.description}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {format(new Date(t.date), "MMM d, yyyy")} · {fund.name} · {t.reference}
                  </div>
                </div>
                <div className={cn("font-semibold text-sm", t.direction === "in" ? "text-success" : "text-foreground")}>
                  {t.direction === "in" ? "+" : "-"}{fmtRwf(t.amount)}
                </div>
                <Link to={`/finance/receipts/${t.id}`}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex" aria-label="Receipt">
                    <FileText className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

const RatioBar = ({ label, value, max, cls }: { label: string; value: number; max: number; cls: string }) => (
  <div>
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{fmtRwf(value)}</span>
    </div>
    <div className="h-2 rounded-full bg-secondary overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", cls)} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  </div>
);
