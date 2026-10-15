import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createVisit, listCases, type WelfareCase } from "@/data/welfareStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { formatLocalDateTimeInput } from "@/lib/dateUtils";
import { toast } from "sonner";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type MemberView = {
  id: string;
  memberNo: string;
  fullName: string;
};

export const NewVisitDialog = ({ trigger, defaultCaseId, defaultMemberId, onCreated }: { trigger: React.ReactNode; defaultCaseId?: string; defaultMemberId?: string; onCreated?: () => void }) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const canManage = hasRolePermission(role, "welfare.manage");
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [caseId, setCaseId] = useState<string>(defaultCaseId ?? "");
  const [memberId, setMemberId] = useState(defaultMemberId ?? "");
  const [caseInput, setCaseInput] = useState<string>("");
  const [memberInput, setMemberInput] = useState<string>("");
  const [cases, setCases] = useState<WelfareCase[]>([]);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0);
    return formatLocalDateTimeInput(d);
  });
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeQuery, setAssigneeQuery] = useState("");

  // Load cases and members when dialog opens
  useEffect(() => {
    if (!open || !accessToken) return;
    const load = async () => {
      try {
        const [casesData, membersResponse] = await Promise.all([
          listCases(accessToken),
          fetch(`${API_BASE_URL}/members`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);
        
        if (!membersResponse.ok) {
          throw new Error("Failed to load members");
        }
        
        const membersData = (await membersResponse.json()) as Array<{ id: string; memberNo: string; fullName: string }>;
        setCases(casesData);
        setMembers(membersData);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load data");
      }
    };
    void load();
  }, [open, accessToken]);

  const handleCaseSelection = (selected: WelfareCase | null) => {
    if (selected) {
      setCaseId(selected.id);
      setCaseInput(`${selected.title}`);
    }
  };

  const handleMemberSelection = (selected: MemberView | null) => {
    if (selected) {
      setMemberId(selected.id);
      setMemberInput(`${selected.fullName} (${selected.memberNo})`);
    }
  };

  const filteredMembers = members.filter((member) => {
    const query = assigneeQuery.trim().toLowerCase();
    if (!query) return true;
    return `${member.fullName} ${member.memberNo}`.toLowerCase().includes(query);
  });

  const toggleAssignee = (id: string) => {
    setAssigneeIds((current) => (
      current.includes(id)
        ? current.filter((assigneeId) => assigneeId !== id)
        : [...current, id]
    ));
  };

  const submit = async () => {
    if (!canManage || !accessToken) {
      toast.error("You do not have permission to schedule visits.");
      return;
    }
    if (!memberId || !location.trim() || !purpose.trim()) {
      toast.error("Member, location and purpose are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await createVisit(accessToken, {
        caseId: caseId || undefined,
        memberId,
        scheduledFor: new Date(scheduledFor).toISOString(),
        location: location.trim(),
        purpose: purpose.trim(),
        status: "planned",
        assigneeIds,
      });
      toast.success("Visit planned");
      setOpen(false);
      setLocation(""); setPurpose(""); setAssigneeIds([]); setAssigneeQuery("");
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to plan visit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setAssigneeQuery("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Plan a visit</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Case (optional)</Label>
              <input
                list="cases-list"
                value={caseInput}
                onChange={(e) => {
                  setCaseInput(e.target.value);
                  const match = cases.find(c => `${c.title}` === e.target.value);
                  handleCaseSelection(match || null);
                }}
                placeholder="Search case..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <datalist id="cases-list">
                {cases.map(c => (
                  <option key={c.id} value={`${c.title}`} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label>Member being visited</Label>
              <input
                list="members-list"
                value={memberInput}
                onChange={(e) => {
                  setMemberInput(e.target.value);
                  const match = members.find(m => `${m.fullName} (${m.memberNo})` === e.target.value);
                  handleMemberSelection(match || null);
                }}
                placeholder="Search member..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <datalist id="members-list">
                {members.map(m => (
                  <option key={m.id} value={`${m.fullName} (${m.memberNo})`} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>When</Label>
              <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hospital, hostel, town..." />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Purpose</Label>
            <Textarea rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Encouragement, prayer, condolences..." />
          </div>
          <div className="grid gap-2">
            <Label>Assignees</Label>
            <Input
              value={assigneeQuery}
              onChange={(e) => setAssigneeQuery(e.target.value)}
              placeholder="Search members to add..."
            />
            {assigneeIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {assigneeIds.map((id) => {
                  const member = members.find((item) => item.id === id);
                  return member ? (
                    <div key={id} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                      <span>{member.fullName}</span>
                      <button
                        type="button"
                        onClick={() => toggleAssignee(id)}
                        className="ml-1 font-bold text-primary hover:text-primary/80"
                        aria-label={`Remove ${member.fullName}`}
                      >
                        ×
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}
            <div className="max-h-56 overflow-y-auto rounded-md border border-input bg-background">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => {
                  const selected = assigneeIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleAssignee(member.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{member.fullName}</span>
                        <span className="block text-xs text-muted-foreground">{member.memberNo}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {selected ? "Selected" : "Add"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">No members match your search.</div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Schedule visit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
