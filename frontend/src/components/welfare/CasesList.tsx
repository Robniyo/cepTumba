import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginationFooter } from "@/components/PaginationFooter";
import { Search, MessageSquarePlus, Trash2, HeartPulse, GraduationCap, HandCoins, BookOpen, Cake, HeartCrack, MoreHorizontal } from "lucide-react";
import { CaseStatus, CaseType, Urgency, WelfareCase, listCases, updateCase as updateCaseApi, deleteCase as deleteCaseApi, addCaseNote as addCaseNoteApi } from "@/data/welfareStore";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { ROLE_SHORT, hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";
import { NewVisitDialog } from "./NewVisitDialog";
import { Calendar } from "lucide-react";

type MemberSummary = { id: string; memberNo: string; fullName: string };

const typeIcons: Record<CaseType, React.ComponentType<{ className?: string }>> = {
  illness: HeartPulse, bereavement: HeartCrack, financial: HandCoins, academic: GraduationCap, spiritual: BookOpen, celebration: Cake, other: MoreHorizontal,
};

const urgencyStyles: Record<Urgency, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-info/15 text-info border-info/30",
  high: "bg-accent/15 text-accent-foreground border-accent/40",
  critical: "bg-destructive/15 text-destructive border-destructive/40",
};

const statusStyles: Record<CaseStatus, string> = {
  open: "bg-accent/15 text-accent-foreground border-accent/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  resolved: "bg-success/15 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const STATUSES: CaseStatus[] = ["open", "in_progress", "resolved", "closed"];

export const CasesList = ({ refreshKey, onRefresh }: { refreshKey?: number; onRefresh?: () => void }) => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const me = ROLE_SHORT[role];
  const canManage = hasRolePermission(role, "welfare.manage");
  const canReview = hasRolePermission(role, "welfare.review");
  const canComment = canManage || canReview;

  const [cases, setCases] = useState<WelfareCase[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [urgencyF, setUrgencyF] = useState<string>("all");
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    void Promise.all([
      listCases(accessToken),
      fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/members`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => { if (!r.ok) throw new Error("Failed to load members"); return r.json() as Promise<MemberSummary[]>; })
    ])
      .then(([casesData, membersData]) => { if (!cancelled) { setCases(casesData); setMembers(membersData); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return cases
      .filter((c) => {
        const matches = !ql || c.title.toLowerCase().includes(ql) || c.description.toLowerCase().includes(ql) || c.memberId.toLowerCase().includes(ql);
        return matches && (statusF === "all" || c.status === statusF) && (urgencyF === "all" || c.urgency === urgencyF);
      })
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }, [cases, q, statusF, urgencyF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases or members..." className="pl-9" />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={urgencyF} onValueChange={setUrgencyF}>
          <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All urgency</SelectItem>
            {(["low", "medium", "high", "critical"] as Urgency[]).map((u) => (<SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No welfare cases match.</CardContent></Card>
      )}

      <div className="space-y-3">
        {paged.map((c) => {
          const member = memberById.get(c.memberId) ?? { fullName: c.memberId, memberNo: "" };
          const Icon = typeIcons[c.type];
          const isOpen = openCase === c.id;
          return (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-base font-semibold">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {member?.fullName ?? "Unknown"} • {member?.memberNo} • opened {new Date(c.openedAt).toLocaleDateString()} by {c.openedBy}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize", urgencyStyles[c.urgency])}>{c.urgency}</span>
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize", statusStyles[c.status])}>{c.status.replace("_", " ")}</span>
                  </div>
                </div>

                {c.description && <p className="text-sm text-foreground/85 leading-relaxed">{c.description}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                  {canManage && (
                    <Select value={c.status} onValueChange={(v) => { if (accessToken) void updateCaseApi(accessToken, c.id, { status: v as CaseStatus }).then(() => { toast.success("Status updated"); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>
                      <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((s) => (<SelectItem key={s} value={s} className="capitalize text-xs">{s.replace("_", " ")}</SelectItem>))}</SelectContent>
                    </Select>
                  )}
                  {canManage && (
                    <NewVisitDialog
                      defaultCaseId={c.id}
                      defaultMemberId={c.memberId}
                      trigger={<Button size="sm" variant="outline" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Plan visit</Button>}
                    />
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setOpenCase(isOpen ? null : c.id)} className="gap-1.5">
                    <MessageSquarePlus className="h-3.5 w-3.5" /> Notes ({c.notes.length})
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => { if (accessToken) void deleteCaseApi(accessToken, c.id).then(() => { toast.success("Case removed"); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    {c.notes.length === 0 && <p className="text-xs italic text-muted-foreground">No notes yet.</p>}
                    {c.notes.map((n) => (
                      <div key={n.id} className="text-sm">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{n.author}</span>
                          <span>{new Date(n.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="mt-0.5">{n.body}</p>
                      </div>
                    ))}
                    {canComment && (
                      <div className="flex gap-2">
                        <Textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder={`Add a follow-up as ${me}...`} className="text-sm" />
                        <Button size="sm" onClick={() => { if (!noteDraft.trim() || !accessToken) return; void addCaseNoteApi(accessToken, c.id, noteDraft.trim()).then(() => { setNoteDraft(""); toast.success("Note added"); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>Add</Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

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
