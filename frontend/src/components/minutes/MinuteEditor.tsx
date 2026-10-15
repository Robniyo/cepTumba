import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Vote, ListChecks, FileEdit, CheckCircle2, Send, Printer } from "lucide-react";
import {
  Minute, ResolutionStatus,
  updateMinute as updateMinuteApi, addAgendaItem as addAgendaItemApi, removeAgendaItem as removeAgendaItemApi,
  addResolution as addResolutionApi, updateResolution as updateResolutionApi, removeResolution as removeResolutionApi,
  addAction as addActionApi, toggleAction as toggleActionApi, removeAction as removeActionApi,
} from "@/data/minutesStore";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { formatDateOnlyForDisplay, formatLocalISODate, todayLocalISODate } from "@/lib/dateUtils";
import { toast } from "sonner";

const resStyles: Record<ResolutionStatus, string> = {
  proposed: "bg-info/15 text-info border-info/30",
  passed: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  tabled: "bg-muted text-muted-foreground border-border",
};

const statusStyles: Record<Minute["status"], string> = {
  draft: "bg-muted text-muted-foreground border-border",
  circulated: "bg-info/15 text-info border-info/30",
  approved: "bg-success/15 text-success border-success/30",
};

export const MinuteEditor = ({ minute, onRefresh }: { minute: Minute; onRefresh?: () => void }) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const canEdit = hasRolePermission(role, "minutes.manage");

  const [agendaTitle, setAgendaTitle] = useState("");
  const [agendaNotes, setAgendaNotes] = useState("");

  const [resText, setResText] = useState("");
  const [resMover, setResMover] = useState("");
  const [resSecond, setResSecond] = useState("");

  const [actText, setActText] = useState("");
  const [actOwner, setActOwner] = useState("");
  const [actDue, setActDue] = useState(formatLocalISODate(new Date(Date.now() + 7 * 86400000)));

  const api = <T,>(fn: Promise<T>) => fn.then(() => onRefresh?.()).catch((err) => toast.error(err instanceof Error ? err.message : "Action failed"));

  const toggleAttendee = (id: string, list: "attendees" | "apologies") => {
    if (!accessToken) return;
    const arr = minute[list];
    const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    void api(updateMinuteApi(accessToken, minute.id, { [list]: next } as Partial<Minute>));
  };

  const exportText = () => {
    const lines: string[] = [];
    lines.push(`MINUTES — ${minute.title.toUpperCase()}`);
    lines.push(`Date: ${minute.date} • Time: ${minute.startTime} – ${minute.endTime}`);
    lines.push(`Location: ${minute.location} • Chair: ${minute.chair} • Secretary: ${minute.secretary}`);
    lines.push(`Status: ${minute.status.toUpperCase()}`);
    lines.push("");
    lines.push("ATTENDEES:");
    minute.attendees.forEach((id) => lines.push(`  • ${id}`));
    if (minute.apologies.length) {
      lines.push("\nAPOLOGIES:");
      minute.apologies.forEach((id) => lines.push(`  • ${id}`));
    }
    lines.push("\nAGENDA & DELIBERATIONS:");
    minute.agenda.forEach((a, i) => {
      lines.push(`\n${i + 1}. ${a.title}${a.presenter ? ` (presenter: ${a.presenter})` : ""}`);
      if (a.notes) lines.push(`   ${a.notes}`);
    });
    if (minute.resolutions.length) {
      lines.push("\nRESOLUTIONS:");
      minute.resolutions.forEach((r, i) =>
        lines.push(`${i + 1}. [${r.status.toUpperCase()}] ${r.text} (Moved: ${r.movedBy}; Seconded: ${r.secondedBy})`)
      );
    }
    if (minute.actions.length) {
      lines.push("\nACTION ITEMS:");
      minute.actions.forEach((a) => {
        lines.push(`  ${a.done ? "[x]" : "[ ]"} ${a.task} — ${a.ownerId} (due ${a.due})`);
      });
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${minute.title.replace(/\s+/g, "_")}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as text file");
  };

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FileEdit className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-bold">{minute.title}</h2>
              <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize", statusStyles[minute.status])}>
                {minute.status}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatDateOnlyForDisplay(minute.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {minute.startTime}–{minute.endTime} · {minute.location}
            </div>
            <div className="text-xs text-muted-foreground">Chair: <span className="font-medium text-foreground">{minute.chair}</span> · Secretary: <span className="font-medium text-foreground">{minute.secretary}</span></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={exportText} className="gap-1.5"><Printer className="h-3.5 w-3.5" />Export</Button>
            {canEdit && minute.status === "draft" && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { if (accessToken) void api(updateMinuteApi(accessToken, minute.id, { status: "circulated" })); }}>
                <Send className="h-3.5 w-3.5" />Circulate
              </Button>
            )}
            {canEdit && minute.status !== "approved" && (
              <Button size="sm" className="gap-1.5" onClick={() => { if (accessToken) void api(updateMinuteApi(accessToken, minute.id, { status: "approved" })); }}>
                <CheckCircle2 className="h-3.5 w-3.5" />Approve
              </Button>
            )}
          </div>
        </div>

        {/* Attendees */}
        <div className="grid gap-4 sm:grid-cols-2">
          <AttendancePicker
            label={`Attendees (${minute.attendees.length})`}
            selected={minute.attendees}
            onToggle={(id) => canEdit && toggleAttendee(id, "attendees")}
            disabled={!canEdit}
          />
          <AttendancePicker
            label={`Apologies (${minute.apologies.length})`}
            selected={minute.apologies}
            onToggle={(id) => canEdit && toggleAttendee(id, "apologies")}
            disabled={!canEdit}
          />
        </div>

        {/* Agenda */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Agenda & deliberations</h3>
            <span className="text-xs text-muted-foreground">{minute.agenda.length} item(s)</span>
          </div>
          <div className="space-y-2">
            {minute.agenda.map((a, i) => (
              <div key={a.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{i + 1}. {a.title}{a.presenter && <span className="ml-1 text-xs font-normal text-muted-foreground">— {a.presenter}</span>}</div>
                    {a.notes && <p className="mt-1 text-sm text-foreground/85 whitespace-pre-wrap">{a.notes}</p>}
                  </div>
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => { if (accessToken) void api(removeAgendaItemApi(accessToken, minute.id, a.id)); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <Input value={agendaTitle} onChange={(e) => setAgendaTitle(e.target.value)} placeholder="Agenda item title" />
              <Textarea rows={2} value={agendaNotes} onChange={(e) => setAgendaNotes(e.target.value)} placeholder="Notes / deliberations..." />
              <Button size="sm" onClick={() => {
                if (!agendaTitle.trim() || !accessToken) { toast.error("Title required"); return; }
                void api(addAgendaItemApi(accessToken, minute.id, { title: agendaTitle.trim(), notes: agendaNotes.trim() }));
                setAgendaTitle(""); setAgendaNotes("");
              }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add agenda item
              </Button>
            </div>
          )}
        </section>

        {/* Resolutions */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold flex items-center gap-2"><Vote className="h-4 w-4" />Resolutions</h3>
            <span className="text-xs text-muted-foreground">{minute.resolutions.length} resolution(s)</span>
          </div>
          <div className="space-y-2">
            {minute.resolutions.map((r, i) => (
              <div key={r.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm flex-1"><span className="font-semibold">R{i + 1}.</span> {r.text}</div>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize shrink-0", resStyles[r.status])}>{r.status}</span>
                </div>
                <div className="text-xs text-muted-foreground">Moved by <b className="text-foreground">{r.movedBy}</b> · Seconded by <b className="text-foreground">{r.secondedBy}</b>
                  {(r.votesFor !== undefined) && <> · Votes: <span className="text-success">{r.votesFor} for</span> / <span className="text-destructive">{r.votesAgainst} against</span> / <span>{r.votesAbstain} abstain</span></>}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-1.5">
                    {(["proposed", "passed", "rejected", "tabled"] as ResolutionStatus[]).map((s) => (
                      <Button key={s} size="sm" variant={r.status === s ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => { if (accessToken) void api(updateResolutionApi(accessToken, minute.id, r.id, { status: s })); }}>
                        {s}
                      </Button>
                    ))}
                    <Button size="icon" variant="ghost" onClick={() => { if (accessToken) void api(removeResolutionApi(accessToken, minute.id, r.id)); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <Textarea rows={2} value={resText} onChange={(e) => setResText(e.target.value)} placeholder="Resolution text..." />
              <div className="grid grid-cols-2 gap-2">
                <Input value={resMover} onChange={(e) => setResMover(e.target.value)} placeholder="Moved by" />
                <Input value={resSecond} onChange={(e) => setResSecond(e.target.value)} placeholder="Seconded by" />
              </div>
              <Button size="sm" onClick={() => {
                if (!resText.trim() || !resMover.trim() || !resSecond.trim() || !accessToken) { toast.error("All fields required"); return; }
                void api(addResolutionApi(accessToken, minute.id, { text: resText.trim(), movedBy: resMover.trim(), secondedBy: resSecond.trim(), status: "proposed" }));
                setResText(""); setResMover(""); setResSecond("");
              }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add resolution
              </Button>
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold flex items-center gap-2"><ListChecks className="h-4 w-4" />Action items</h3>
            <span className="text-xs text-muted-foreground">{minute.actions.filter((a) => a.done).length}/{minute.actions.length} done</span>
          </div>
          <div className="space-y-2">
            {minute.actions.map((a) => {
              const owner = { fullName: a.ownerId };
              const overdue = !a.done && a.due < todayLocalISODate();
              return (
                <div key={a.id} className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
                  <Checkbox checked={a.done} onCheckedChange={() => { if (accessToken) void api(toggleActionApi(accessToken, minute.id, a.id)); }} disabled={!canEdit} className="mt-0.5" />
                  <div className="flex-1 text-sm">
                    <div className={cn(a.done && "line-through text-muted-foreground")}>{a.task}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {owner?.fullName ?? a.ownerId} · due {formatDateOnlyForDisplay(a.due)}
                      {overdue && <span className="ml-2 font-medium text-destructive">overdue</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => { if (accessToken) void api(removeActionApi(accessToken, minute.id, a.id)); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              );
            })}
          </div>
          {canEdit && (
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <Input value={actText} onChange={(e) => setActText(e.target.value)} placeholder="Action description" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={actOwner} onChange={(e) => setActOwner(e.target.value)} placeholder="Owner (member ID)" />
                <Input type="date" value={actDue} onChange={(e) => setActDue(e.target.value)} />
              </div>
              <Button size="sm" onClick={() => {
                if (!actText.trim() || !actOwner || !accessToken) { toast.error("Task and owner required"); return; }
                void api(addActionApi(accessToken, minute.id, { task: actText.trim(), ownerId: actOwner, due: actDue, done: false }));
                setActText(""); setActOwner("");
              }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add action
              </Button>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

const AttendancePicker = ({ label, selected, onToggle, disabled }: { label: string; selected: string[]; onToggle: (id: string) => void; disabled?: boolean }) => {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
            {id}
            {!disabled && <button onClick={() => onToggle(id)} className="hover:text-destructive">×</button>}
          </span>
        ))}
        {selected.length === 0 && <span className="text-xs italic text-muted-foreground">None</span>}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Member ID" className="h-8 text-xs" />
          <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => { if (draft.trim()) { onToggle(draft.trim()); setDraft(""); } }}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  );
};
