import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, FileEdit, Files, FileText, Plus, Search, Vote, Clock3 } from "lucide-react";
import { Minute, DocumentRecord, listMinutes, listDocuments } from "@/data/minutesStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { cn } from "@/lib/utils";
import { NewMinuteDialog } from "@/components/minutes/NewMinuteDialog";
import { MinuteEditor } from "@/components/minutes/MinuteEditor";
import { DocumentsArchive } from "@/components/minutes/DocumentsArchive";
import { hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const statusStyles: Record<Minute["status"], string> = {
  draft: "bg-muted text-muted-foreground border-border",
  circulated: "bg-info/15 text-info border-info/30",
  approved: "bg-success/15 text-success border-success/30",
};

const Minutes = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const canCreate = hasRolePermission(role, "minutes.manage");

  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [m, d] = await Promise.all([listMinutes(accessToken), listDocuments(accessToken)]);
        if (!cancelled) { setMinutes(m); setDocuments(d); }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load minutes.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return minutes
      .filter((m) => (!ql || m.title.toLowerCase().includes(ql) || m.location.toLowerCase().includes(ql)) && (statusF === "all" || m.status === statusF))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [minutes, q, statusF]);

  useEffect(() => {
    if (!selected || !filtered.some((m) => m.id === selected)) {
      setSelected(filtered[0]?.id ?? null);
    }
  }, [filtered, selected]);

  const current = minutes.find((m) => m.id === selected) ?? filtered[0];

  const totalResolutions = minutes.reduce((s, m) => s + m.resolutions.length, 0);
  const openActions = minutes.reduce((s, m) => s + m.actions.filter((a) => !a.done).length, 0);
  const pendingPublication = minutes.filter((m) => m.status === "draft" || m.status === "circulated").length;

  return (
    <div className="py-6 sm:py-8">
      <PageHeader title="Minutes & Documents" subtitle="Records, accountability, and continuity for the fellowship">
        {canCreate && (
          <NewMinuteDialog
            trigger={<Button className="gap-2"><Plus className="h-4 w-4" />New minutes</Button>}
            onCreated={(id) => { setSelected(id); refresh(); }}
          />
        )}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Meeting minutes" value={minutes.length} icon={FileEdit} variant="primary" trend={`${minutes.filter((m) => m.status === "approved").length} approved`} />
        <StatCard label="Resolutions" value={totalResolutions} icon={Vote} variant="success" trend="recorded" />
        <StatCard label="Open actions" value={openActions} icon={CheckCircle2} variant="accent" trend="pending follow-up" />
        <StatCard label="Pending publication" value={pendingPublication} icon={Clock3} variant="info" trend={`${documents.length} docs archived`} />
      </div>

      <Tabs defaultValue="minutes" className="space-y-6">
        <Card className="p-3 shadow-elegant">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Records Workspace</h2>
              <p className="text-xs text-muted-foreground">Manage meeting minutes, action tracking, and archival documentation.</p>
            </div>
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
              <TabsTrigger value="minutes" className="gap-2"><FileEdit className="h-4 w-4" />Minutes</TabsTrigger>
              <TabsTrigger value="documents" className="gap-2"><Files className="h-4 w-4" />Documents</TabsTrigger>
            </TabsList>
          </div>
        </Card>

        <TabsContent value="minutes" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="p-3 shadow-elegant">
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or location" className="pl-9 h-9" />
                  </div>
                  <Select value={statusF} onValueChange={setStatusF}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="circulated">Circulated</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
                  <span>Sorted by latest</span>
                </div>
                <div className="space-y-2 max-h-[66vh] overflow-y-auto pr-1">
                  {filtered.length === 0 && (
                    <Card><CardContent className="p-6 text-xs text-center text-muted-foreground">No minutes match these filters.</CardContent></Card>
                  )}
                  {filtered.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelected(m.id)}
                      className={cn(
                        "w-full text-left rounded-lg border p-3 transition-base",
                        current?.id === m.id ? "border-primary bg-primary/5 shadow-sm" : "bg-background hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{m.title}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">{m.meetingType === "agm" ? "AGM" : m.meetingType} · {new Date(m.date).toLocaleDateString()}</div>
                        </div>
                        <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize shrink-0", statusStyles[m.status])}>{m.status}</span>
                      </div>
                      <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                        <span>{m.attendees.length} present</span>
                        <span>{m.resolutions.length} resolution{m.resolutions.length === 1 ? "" : "s"}</span>
                        <span>{m.actions.filter((a) => !a.done).length} open</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <div>
              {current ? (
                <MinuteEditor minute={current} onRefresh={refresh} />
              ) : (
                <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
                  <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  No minutes yet. {canCreate ? "Create one to start." : "Leaders will publish minutes here."}
                </CardContent></Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents"><DocumentsArchive refreshKey={refreshKey} onRefresh={refresh} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Minutes;
