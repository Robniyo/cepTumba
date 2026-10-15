import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FUNDS, FundId, TX_TYPE_LABEL, TxType, Transaction, createTransaction } from "@/data/financeStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { todayLocalISODate } from "@/lib/dateUtils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: Partial<Pick<Transaction, "type" | "fundId" | "memberId" | "direction">>;
  onCreated?: () => void;
}

const inTypes: TxType[] = ["offering", "tithe", "contribution", "savings_deposit", "other_income"];
const outTypes: TxType[] = ["expense", "savings_withdraw"];

export const NewTransactionDialog = ({ open, onOpenChange, defaults, onCreated }: Props) => {
  const { role } = useRole();
  const { accessToken } = useAuth();
  const canManageFinance = hasRolePermission(role, "finance.manage");
  const today = todayLocalISODate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [type, setType] = useState<TxType>(defaults?.type ?? "offering");
  const [direction, setDirection] = useState<"in" | "out">(defaults?.direction ?? "in");
  const [fundId, setFundId] = useState<FundId>(defaults?.fundId ?? "tithe");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [memberId, setMemberId] = useState<string | undefined>(defaults?.memberId);
  const [paymentMethod, setPaymentMethod] = useState<Transaction["paymentMethod"]>("momo");

  // Sync type → direction
  useEffect(() => {
    if (inTypes.includes(type)) setDirection("in");
    if (outTypes.includes(type)) setDirection("out");
    if (type === "savings_deposit" || type === "savings_withdraw") setFundId("savings");
  }, [type]);

  const reset = () => {
    setType(defaults?.type ?? "offering");
    setFundId(defaults?.fundId ?? "tithe");
    setAmount(""); setDescription(""); setDate(today);
    setMemberId(defaults?.memberId); setPaymentMethod("momo");
  };

  const submit = async () => {
    if (!canManageFinance || !accessToken) {
      toast.error("You do not have permission to record transactions.");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!description.trim()) { toast.error("Add a short description"); return; }
    if ((type === "savings_deposit" || type === "savings_withdraw") && !memberId) {
      toast.error("Select the member"); return;
    }

    setIsSubmitting(true);
    try {
      const created = await createTransaction(accessToken, {
        type, fundId, amount: amt, direction, description: description.trim(),
        date, memberId, paymentMethod,
      });
      toast.success(`Recorded ${created.reference}`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const allTypes: TxType[] = [...inTypes, ...outTypes];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TxType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allTypes.map(t => <SelectItem key={t} value={t}>{TX_TYPE_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select
                value={fundId}
                onValueChange={(v) => setFundId(v as FundId)}
                disabled={type === "savings_deposit" || type === "savings_withdraw"}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUNDS.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amt">Amount (Rwf)</Label>
              <Input id="amt" type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dt">Date</Label>
              <Input id="dt" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Member ID (optional)</Label>
              <Input value={memberId ?? ""} onChange={e => setMemberId(e.target.value || undefined)} placeholder="Enter member ID" />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as Transaction["paymentMethod"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="momo">MTN MoMo</SelectItem>
                    <SelectItem value="airtel_money">Airtel Money</SelectItem>
                    <SelectItem value="mpesa">M-Pesa (legacy)</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this for?" />
          </div>

          <div className="rounded-lg border border-border p-3 text-xs flex items-center justify-between">
            <span className="text-muted-foreground">Direction</span>
            <span className={`font-semibold ${direction === "in" ? "text-success" : "text-destructive"}`}>
              {direction === "in" ? "Money IN" : "Money OUT"}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canManageFinance || isSubmitting} onClick={() => void submit()} className="gradient-primary text-primary-foreground border-0 hover:opacity-90">
            {isSubmitting ? "Saving..." : "Save transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
