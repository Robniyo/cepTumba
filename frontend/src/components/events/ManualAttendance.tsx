import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AttendanceRecord, markAttendance, removeAttendance } from "@/data/eventsStore";
import { useAuth } from "@/context/AuthContext";
import { Search, UserCheck, Clock, UserX, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  eventId: string;
  date: string;
  selfOnly?: boolean;
  selfMemberId?: string;
  readOnly?: boolean;
  attendance: AttendanceRecord[];
  onRefresh?: () => void;
}

type MemberSummary = { id: string; memberNo: string; fullName: string };

const statusMeta: Record<AttendanceRecord["status"], { label: string; cls: string; icon: typeof UserCheck }> = {
  present: { label: "Present", cls: "bg-success/15 text-success", icon: UserCheck },
  late:    { label: "Late",    cls: "bg-warning/15 text-warning", icon: Clock },
  absent:  { label: "Absent",  cls: "bg-destructive/15 text-destructive", icon: UserX },
};

export const ManualAttendance = ({ eventId, date, selfOnly = false, selfMemberId, readOnly = false, attendance, onRefresh }: Props) => {
  const { accessToken } = useAuth();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<MemberSummary[]>([]);

  const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/members`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) throw new Error("Failed to load members");
        const data = (await res.json()) as Array<{ id: string; fullName: string; memberNo?: string }>;
        if (!cancelled) setMembers(data.map(d => ({ id: d.id, fullName: d.fullName, memberNo: d.memberNo ?? "" })));
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken]);

  const recordsByMember = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendance.forEach(a => map.set(a.memberId, a));
    return map;
  }, [attendance]);

  const counts = {
    present: attendance.filter(a => a.status === "present").length,
    late:    attendance.filter(a => a.status === "late").length,
    absent:  attendance.filter(a => a.status === "absent").length,
  };

  const uniqueMembers = useMemo(() => {
    const seen = new Map<string, AttendanceRecord>();
    attendance.forEach(a => { if (!seen.has(a.memberId)) seen.set(a.memberId, a); });
    return Array.from(seen.values());
  }, [attendance]);

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const mark = async (memberId: string, memberName: string, status: AttendanceRecord["status"]) => {
    if (readOnly || !accessToken) return;
    try {
      await markAttendance(accessToken, eventId, { date, memberId, status, method: "manual" });
      toast.success(`${memberName} marked ${status}`);
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark attendance.");
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!accessToken) return;
    try {
      await removeAttendance(accessToken, eventId, date, memberId);
      toast.success("Attendance cleared");
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove attendance.");
    }
  };

  const rows = useMemo(() => {
    return uniqueMembers
      .filter(a => !q || (memberById.get(a.memberId)?.fullName ?? a.memberId).toLowerCase().includes(q.toLowerCase()))
      .map(a => {
        const member = memberById.get(a.memberId);
        return {
          ...a,
          label: member ? `${member.fullName} (${member.memberNo})` : a.memberId,
        };
      });
  }, [uniqueMembers, q, memberById]);

  return (
    <div className="space-y-4">
      {!selfOnly && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryPill label="Present" value={counts.present} cls="bg-success/15 text-success" />
          <SummaryPill label="Late" value={counts.late} cls="bg-warning/15 text-warning" />
          <SummaryPill label="Absent" value={counts.absent} cls="bg-destructive/15 text-destructive" />
        </div>
      )}

      {selfOnly && (
        <Card className="p-4 text-sm text-muted-foreground">Register your attendance for this event. Leaders will handle full attendance management.</Card>
      )}

      {selfOnly && selfMemberId && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm font-medium">Your attendance</div>
            {recordsByMember.has(selfMemberId) ? (
              <Badge variant="outline" className={cn("border-0 text-xs capitalize", statusMeta[recordsByMember.get(selfMemberId)!.status].cls)}>
                {statusMeta[recordsByMember.get(selfMemberId)!.status].label}
              </Badge>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-8 text-xs hover:bg-success/10 hover:text-success" onClick={() => void mark(selfMemberId, "You", "present")}>Check in</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs hover:bg-warning/10 hover:text-warning" onClick={() => void mark(selfMemberId, "You", "late")}>Late</Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {!selfOnly && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search members..." className="pl-9" />
          </div>

          <Card className="divide-y divide-border overflow-hidden">
            {rows.map(a => {
              const rec = recordsByMember.get(a.memberId);
              const initial = (memberById.get(a.memberId)?.fullName ?? a.memberId).slice(0,2).toUpperCase();
              return (
                <div key={a.memberId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">{initial}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{a.label}</div>
                  </div>
                  {rec ? (
                    readOnly ? (
                      <Badge variant="outline" className={cn("border-0 text-[10px] capitalize", statusMeta[rec.status].cls)}>{statusMeta[rec.status].label}</Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select value={rec.status} onValueChange={(v) => void mark(a.memberId, a.label, v as AttendanceRecord["status"])}>
                          <SelectTrigger className={cn("h-8 w-[110px] border-0 text-xs font-medium", statusMeta[rec.status].cls)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="late">Late</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => void handleRemove(a.memberId)} aria-label="Clear">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  ) : (
                    readOnly ? (
                      <Badge variant="outline" className="text-[10px]">Not marked</Badge>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-8 text-xs hover:bg-success/10 hover:text-success hover:border-success/40" onClick={() => void mark(a.memberId, a.label, "present")}>Present</Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs hidden sm:inline-flex hover:bg-warning/10 hover:text-warning hover:border-warning/40" onClick={() => void mark(a.memberId, a.label, "late")}>Late</Button>
                      </div>
                    )
                  )}
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No attendance records yet.</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

const SummaryPill = ({ label, value, cls }: { label: string; value: number; cls: string }) => (
  <div className={cn("rounded-lg p-3 text-center", cls)}>
    <div className="font-display text-2xl font-bold">{value}</div>
    <div className="text-[11px] uppercase tracking-wider opacity-80">{label}</div>
  </div>
);

export default ManualAttendance;
