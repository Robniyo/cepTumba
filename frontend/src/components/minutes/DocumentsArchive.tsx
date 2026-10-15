import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginationFooter } from "@/components/PaginationFooter";
import { ChevronDown, ChevronUp, Download, FileText, History, Plus, Search, Tag, Trash2, Upload } from "lucide-react";
import { DocCategory, DocumentRecord, fmtFileSize, listDocuments, removeDocument as removeDocumentApi, removeDocumentVersion as removeVersionApi } from "@/data/minutesStore";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { NewDocumentDialog, NewVersionDialog } from "./DocumentDialogs";
import { toast } from "sonner";

const catStyles: Record<DocCategory, string> = {
  constitution: "bg-primary/10 text-primary border-primary/30",
  handover: "bg-info/15 text-info border-info/30",
  policy: "bg-accent/15 text-accent-foreground border-accent/30",
  report: "bg-success/15 text-success border-success/30",
  sermon: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  form: "bg-muted text-muted-foreground border-border",
  other: "bg-muted text-muted-foreground border-border",
};

export const DocumentsArchive = ({ refreshKey, onRefresh }: { refreshKey?: number; onRefresh?: () => void }) => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const canManage = hasRolePermission(role, "documents.manage");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    void listDocuments(accessToken).then(d => { if (!cancelled) setDocuments(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return documents
      .filter((d) => {
        const matches = !ql || d.title.toLowerCase().includes(ql) || d.description.toLowerCase().includes(ql) || d.tags.some((t) => t.toLowerCase().includes(ql));
        return matches && (cat === "all" || d.category === cat);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [documents, q, cat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const download = (url: string | undefined, fileName: string) => {
    if (!url) { toast.info("Seed document — file not attached in this demo"); return; }
    const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, description or tags..." className="pl-9" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(["constitution", "handover", "policy", "report", "sermon", "form", "other"] as DocCategory[]).map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <NewDocumentDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Add document</Button>} />
        )}
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No documents match your filters.</CardContent></Card>
      )}

      <div className="space-y-3">
        {paged.map((d) => {
          const versions = [...d.versions].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
          const latest = versions[0];
          const isOpen = expanded === d.id;
          return (
            <Card key={d.id} className="overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-base font-semibold truncate">{d.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Owner: {d.ownerRole} · Latest <b className="text-foreground">{latest.version}</b> by {latest.uploadedBy} · {new Date(latest.uploadedAt).toLocaleDateString()}
                      </div>
                      {d.description && <p className="mt-1 text-sm text-foreground/85">{d.description}</p>}
                      {d.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.tags.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              <Tag className="h-2.5 w-2.5" />{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize shrink-0", catStyles[d.category])}>{d.category}</span>
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download(latest.url, latest.fileName)}>
                    <Download className="h-3.5 w-3.5" /> Download {latest.version}
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setExpanded(isOpen ? null : d.id)}>
                    <History className="h-3.5 w-3.5" /> {versions.length} version{versions.length === 1 ? "" : "s"}
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  {canManage && (
                    <>
                      <NewVersionDialog docId={d.id} trigger={<Button size="sm" variant="ghost" className="gap-1.5"><Upload className="h-3.5 w-3.5" />New version</Button>} />
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this document and all versions?") && accessToken) { void removeDocumentApi(accessToken, d.id).then(() => { toast.success("Document removed"); onRefresh?.(); }).catch(() => toast.error("Failed")); } }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>

                {isOpen && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version history</div>
                    {versions.map((v, idx) => (
                      <div key={v.id} className="flex flex-wrap items-start justify-between gap-2 rounded border bg-background p-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", idx === 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                              {v.version}{idx === 0 && " · LATEST"}
                            </span>
                            <span className="text-xs text-muted-foreground">by {v.uploadedBy} · {new Date(v.uploadedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-foreground/85">{v.changeNote}</div>
                          <div className="text-[11px] text-muted-foreground">{v.fileName} · {fmtFileSize(v.fileSize)}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" onClick={() => download(v.url, v.fileName)}><Download className="h-3.5 w-3.5" /></Button>
                          {canManage && versions.length > 1 && (
                            <Button size="icon" variant="ghost" onClick={() => { if (accessToken) void removeVersionApi(accessToken, d.id, v.id).then(() => { toast.success("Version removed"); onRefresh?.(); }).catch(() => toast.error("Failed")); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
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
