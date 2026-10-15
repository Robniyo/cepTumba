import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Transaction, FUNDS, TX_TYPE_LABEL, PAYMENT_LABEL, fmtRwf, listTransactions } from "@/data/financeStore";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Printer, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const statusIcon = {
  approved: CheckCircle2,
  pending: Clock,
  rejected: XCircle,
};

const Receipt = () => {
  const { id } = useParams();
  const { role } = useRole();
  const { user, accessToken, isReady } = useAuth();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !accessToken || !id) { setLoading(false); return; }
    let cancelled = false;
    void listTransactions(accessToken).then(res => {
      if (!cancelled) { setTx(res.items.find(t => t.id === id) ?? null); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, isReady, id]);

  if (!tx) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16">
          <h2 className="font-display text-xl font-bold">Receipt not found</h2>
          <p className="text-sm text-muted-foreground mt-2">This transaction may have been removed.</p>
          <Link to="/finance"><Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" />Back to Finance</Button></Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>;
  }

  const fund = FUNDS.find(f => f.id === tx.fundId)!;
  const member = { fullName: tx.memberId, memberNo: "" };
  const StatusIcon = statusIcon[tx.status];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/finance" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Finance
        </Link>
        <Button onClick={() => window.print()} className="gradient-primary text-primary-foreground border-0 hover:opacity-90">
          <Printer className="h-4 w-4 mr-2" /> Print receipt
        </Button>
      </div>

      <Card className="overflow-hidden shadow-elevated print:shadow-none">
        {/* Header */}
        <div className="gradient-hero text-primary-foreground p-6 sm:p-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest opacity-80">CEP Tumba College Association</div>
              <div className="font-display text-2xl font-bold mt-1">Official Receipt</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest opacity-80">Reference</div>
              <div className="font-mono text-lg font-bold mt-1">{tx.reference}</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Badge variant="outline" className={cn(
              "border-0 capitalize text-xs px-2.5 py-1",
              tx.status === "approved" && "bg-success/15 text-success",
              tx.status === "pending" && "bg-warning/15 text-warning",
              tx.status === "rejected" && "bg-destructive/15 text-destructive",
            )}>
              <StatusIcon className="h-3 w-3 mr-1" /> {tx.status}
            </Badge>
            <div className="text-sm text-muted-foreground">{format(new Date(tx.date), "EEEE, MMMM d, yyyy")}</div>
          </div>

          <div className="rounded-xl bg-secondary/40 p-5 text-center">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Amount {tx.direction === "in" ? "received" : "paid"}</div>
            <div className={cn("font-display text-4xl font-bold mt-1", tx.direction === "in" ? "text-success" : "text-foreground")}>
              {tx.direction === "in" ? "+" : "-"}{fmtRwf(tx.amount)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{TX_TYPE_LABEL[tx.type]}</div>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Fund" value={fund.name} />
            <Field label="Payment method" value={PAYMENT_LABEL[tx.paymentMethod]} />
            <Field label="Member" value={member?.fullName ?? "—"} />
            <Field label="Member No." value={member?.memberNo ?? "—"} />
            <Field label="Recorded by" value={tx.recordedBy} />
            <Field label="Direction" value={tx.direction === "in" ? "Money in" : "Money out"} />
          </dl>

          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Description</div>
            <div className="mt-1 text-sm leading-relaxed">{tx.description}</div>
          </div>

          <div className="border-t border-border pt-4 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <div className="font-semibold text-foreground">Issued by</div>
              <div>CEP Tumba College Treasury</div>
              <div>{tx.recordedBy}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-foreground">Signature</div>
              <div className="mt-6 border-t border-dashed border-border pt-1">_________________</div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center pt-2 border-t border-dashed border-border">
            Thank you. May the Lord bless your faithful giving. — Philippians 4:19
          </p>
        </div>
      </Card>
    </div>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 font-medium">{value}</dd>
  </div>
);

export default Receipt;
