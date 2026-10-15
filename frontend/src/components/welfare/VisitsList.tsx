import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginationFooter } from "@/components/PaginationFooter";
import { Calendar, CheckCircle2, MapPin, Trash2, Users, XCircle } from "lucide-react";
import { Visit, listVisits, updateVisit as updateVisitApi, deleteVisit as deleteVisitApi, toggleVisitAttendee as toggleVisitAttendeeApi } from "@/data/welfareStore";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

type MemberSummary = {
  id: string;
  memberNo: string;
  fullName: string;
};

const statusStyles: Record<Visit["status"], string> = {
  planned: "bg-info/15 text-info border-info/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export const VisitsList = ({ refreshKey, onRefresh }: { refreshKey?: number; onRefresh?: () => void }) => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const canManage = hasRolePermission(role, "welfare.manage");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    void Promise.all([
      listVisits(accessToken),
      fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/members`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error("Failed to load members.");
        return response.json() as Promise<MemberSummary[]>;
      }),
    ])
      .then(([visitItems, memberItems]) => {
        if (!cancelled) {
          setVisits(visitItems);
          setMembers(memberItems);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const [filter, setFilter] = useState<string>("all");
  const [reportDraft, setReportDraft] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const filtered = useMemo(() => {
    const now = Date.now();
    const ql = query.trim().toLowerCase();
    return [...visits]
      .filter((v) => {
        if (filter === "all") return true;
        if (filter === "upcoming") return v.status === "planned" && new Date(v.scheduledFor).getTime() >= now - 86400000;
        if (filter === "completed") return v.status === "completed";
        if (filter === "cancelled") return v.status === "cancelled";
        return true;
      })
      .filter((v) => {
        if (!ql) return true;
        const member = members.find((item) => item.id === v.memberId);
        return (
          v.memberId.toLowerCase().includes(ql) ||
          member?.fullName.toLowerCase().includes(ql) ||
          member?.memberNo.toLowerCase().includes(ql) ||
          v.location.toLowerCase().includes(ql) ||
          v.purpose.toLowerCase().includes(ql)
        );
      })
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  }, [visits, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search visits or members"
            className="sm:max-w-xs"
          />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming & today</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="all">All visits</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} visit(s)</span>
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No visits to show.</CardContent></Card>
      )}

      <div className="space-y-3">
        {paged.map((v) => {
            const visited = memberById.get(v.memberId);
          const when = new Date(v.scheduledFor);
          const isExpanded = expanded === v.id;
          const draft = reportDraft[v.id] ?? v.report ?? "";
          return (
            <Card key={v.id} className="overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-base font-semibold">
                      {visited ? `${visited.fullName} (${visited.memberNo})` : "Unknown member"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.location}</span>
                    </div>
                  </div>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize", statusStyles[v.status])}>{v.status}</span>
                </div>

                <p className="text-sm text-foreground/85">{v.purpose}</p>

                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Assignees ({v.assigneeIds.length}) · Attended ({v.attendedIds.length}/{v.assigneeIds.length})
                  </div>
                  {v.assigneeIds.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">No assignees set.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {v.assigneeIds.map((id) => {
                        const m = memberById.get(id);
                        const attended = v.attendedIds.includes(id);
                        return (
                          <button
                            key={id}
                            disabled={!canManage}
                            onClick={() => { if (accessToken) void toggleVisitAttendeeApi(accessToken, v.id, id).then(() => onRefresh?.()).catch(() => toast.error("Failed")); }}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-base",
                              attended ? "border-success/40 bg-success/10 text-success" : "border-border bg-background hover:bg-muted",
                              !canManage && "cursor-default"
                            )}
                          >
                            {m ? `${m.fullName} (${m.memberNo})` : "Unknown member"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManage && v.status === "planned" && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setExpanded(isExpanded ? null : v.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Add report & complete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (accessToken) void updateVisitApi(accessToken, v.id, { status: "cancelled" }).then(() => { toast.success("Visit cancelled"); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    </>
                  )}
                  {v.report && (
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(isExpanded ? null : v.id)}>
                      {isExpanded ? "Hide report" : "View report"}
                    </Button>
                  )}
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => { if (accessToken) void deleteVisitApi(accessToken, v.id).then(() => { toast.success("Visit removed"); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {isExpanded && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <Textarea
                      rows={3}
                      value={draft}
                      onChange={(e) => setReportDraft({ ...reportDraft, [v.id]: e.target.value })}
                      placeholder="Visit report — what happened, follow-ups needed..."
                      className="text-sm"
                      disabled={!canManage}
                    />
                    {canManage && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { if (accessToken) void updateVisitApi(accessToken, v.id, { report: draft, status: "completed" }).then(() => { toast.success("Visit completed"); setExpanded(null); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>
                          Save & mark completed
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { if (accessToken) void updateVisitApi(accessToken, v.id, { report: draft }).then(() => { toast.success("Report saved"); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>
                          Save report only
                        </Button>
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
