import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CaseStatus, CaseType, Urgency, createCase } from "@/data/welfareStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { ROLE_SHORT, hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type MemberSummary = {
  id: string;
  memberNo: string;
  fullName: string;
};

const TYPES: CaseType[] = ["illness", "bereavement", "financial", "academic", "spiritual", "celebration", "other"];
const URGENCIES: Urgency[] = ["low", "medium", "high", "critical"];
const STATUSES: CaseStatus[] = ["open", "in_progress", "resolved", "closed"];

export const NewCaseDialog = ({ trigger, onCreated }: { trigger: React.ReactNode; onCreated?: () => void }) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const canManage = hasRolePermission(role, "welfare.manage");
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [type, setType] = useState<CaseType>("illness");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [status, setStatus] = useState<CaseStatus>("open");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open || !accessToken) return;

    let cancelled = false;

    const loadMembers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/members`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          throw new Error("Failed to load members.");
        }

        const payload = (await response.json()) as MemberSummary[];
        if (!cancelled) {
          setMembers(payload);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load members.");
        }
      }
    };

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [accessToken, open]);

  const reset = () => {
    setMemberId(""); setMemberInput(""); setType("illness"); setUrgency("medium"); setStatus("open"); setTitle(""); setDescription("");
  };

  const submit = async () => {
    if (!canManage || !accessToken) {
      toast.error("You do not have permission to open welfare cases.");
      return;
    }
    if (!memberId || !title.trim()) {
      toast.error("Member and title are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await createCase(accessToken, { memberId, type, urgency, status, title: title.trim(), description: description.trim() });
      toast.success("Welfare case opened");
      reset();
      setOpen(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open case.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Open welfare case</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Member</Label>
            <Input
              list="member-options"
              value={memberInput}
              onChange={(e) => {
                const value = e.target.value;
                setMemberInput(value);
                const selected = members.find((member) => `${member.fullName} (${member.memberNo})` === value);
                setMemberId(selected?.id ?? "");
              }}
              placeholder="Search member..."
            />
            <datalist id="member-options">
              {members.map((member) => (
                <option key={member.id} value={`${member.fullName} (${member.memberNo})`} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CaseType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => (<SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Urgency</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{URGENCIES.map((u) => (<SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CaseStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hospital admission – malaria" />
          </div>
          <div className="grid gap-2">
            <Label>Details</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, what's needed, who's coordinating..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Open case"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
