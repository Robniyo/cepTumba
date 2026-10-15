import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaginationFooter } from "@/components/PaginationFooter";
import { Transaction, fmtRwf, memberSavings, memberSavingsTransactions, listTransactions } from "@/data/financeStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { Search, ArrowDownRight, ArrowUpRight, Plus } from "lucide-react";
import { format } from "date-fns";
import { NewTransactionDialog } from "./NewTransactionDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const MemberSavings = ({ refreshKey }: { refreshKey?: number }) => {
  const { role } = useRole();
  const { accessToken, isReady } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const canManageSavings = hasRolePermission(role, "finance.manage");
  const [q, setQ] = useState("");
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [tx, setTx] = useState<{ open: boolean; memberId?: string; type?: "savings_deposit" | "savings_withdraw" }>({ open: false });
  const [page, setPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await listTransactions(accessToken, { fundId: "savings" as any });
        if (!cancelled) setTransactions(res.items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load savings.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  // Get unique members from transactions
  const memberIds = useMemo(() => {
    const ids = new Set<string>();
    transactions.forEach(t => { if (t.memberId) ids.add(t.memberId); });
    return Array.from(ids);
  }, [transactions]);

  const accounts = useMemo(() => {
    const filtered = memberIds.filter(id => id.toLowerCase().includes(q.toLowerCase()));
    return filtered.map(id => {
      const balance = memberSavings(transactions, id);
      const recent = memberSavingsTransactions(transactions, id);
      const lastDate = recent[0]?.date;
      return { memberId: id, balance, lastDate, count: recent.length };
    }).sort((a, b) => b.balance - a.balance);
  }, [q, transactions, memberIds]);

  const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedAccounts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return accounts.slice(start, start + pageSize);
  }, [accounts, page, pageSize]);

  const totalSavings = accounts.reduce((s, a) => s + a.balance, 0);
  const activeAccounts = accounts.filter(a => a.balance > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 shadow-elegant">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total in savings pool</div>
          <div className="mt-1 font-display text-2xl font-bold text-primary">{fmtRwf(totalSavings)}</div>
        </Card>
        <Card className="p-4 shadow-elegant">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Active accounts</div>
          <div className="mt-1 font-display text-2xl font-bold">{activeAccounts}<span className="text-base text-muted-foreground font-medium"> / {memberIds.length}</span></div>
        </Card>
        <Card className="p-4 shadow-elegant">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Average balance</div>
          <div className="mt-1 font-display text-2xl font-bold">{fmtRwf(activeAccounts ? Math.round(totalSavings / activeAccounts) : 0)}</div>
        </Card>
      </div>

      <Card className="p-4 shadow-elegant">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search member…" className="pl-9" />
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {pagedAccounts.map(({ memberId, balance, lastDate, count }) => {
          const expanded = openMember === memberId;
          const history = memberSavingsTransactions(transactions, memberId);
          return (
            <Card key={memberId} className="overflow-hidden shadow-elegant">
              <button
                onClick={() => setOpenMember(expanded ? null : memberId)}
                className="w-full text-left p-4 flex items-center gap-3 hover:bg-secondary/40 transition-base"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  {memberId.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{memberId}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {count} {count === 1 ? "txn" : "txns"}
                    {lastDate && ` · last ${format(new Date(lastDate), "MMM d")}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</div>
                  <div className={cn("font-display font-bold", balance > 0 ? "text-primary" : "text-muted-foreground")}>
                    {fmtRwf(balance)}
                  </div>
                </div>
              </button>

              {expanded && (
                <div className="border-t border-border bg-secondary/20 px-4 py-3 space-y-3 animate-fade-in">
                  {canManageSavings && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => setTx({ open: true, memberId, type: "savings_deposit" })}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Deposit
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => setTx({ open: true, memberId, type: "savings_withdraw" })}
                      >
                        Withdraw
                      </Button>
                    </div>
                  )}

                  {history.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No transactions yet.</div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Statement</div>
                      {history.slice(0, 6).map(t => (
                        <div key={t.id} className="flex items-center gap-2 text-xs bg-card rounded-md px-2 py-1.5">
                          <div className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full",
                            t.direction === "in" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
                          )}>
                            {t.direction === "in" ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{t.description}</div>
                            <div className="text-[10px] text-muted-foreground">{format(new Date(t.date), "MMM d, yyyy")} · {t.reference}</div>
                          </div>
                          <div className={cn("font-semibold", t.direction === "in" ? "text-success" : "text-foreground")}>
                            {t.direction === "in" ? "+" : "-"}{fmtRwf(t.amount)}
                          </div>
                          <Badge variant="outline" className="text-[9px] capitalize">{t.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        totalItems={accounts.length}
        pageSize={pageSize}
        onPageChange={setPage}
      />

      <NewTransactionDialog
        open={tx.open}
        onOpenChange={(o) => setTx({ ...tx, open: o })}
        defaults={{ type: tx.type, memberId: tx.memberId, fundId: "savings" }}
      />
    </div>
  );
};
