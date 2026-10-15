import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Shuffle, Trash2, Users, UserCog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationFooter } from "@/components/PaginationFooter";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import {
  AssignmentMode,
  AssignmentResult,
  AssignmentRunSummary,
  Family,
  FamilyDetail,
  FamilyReportSummary,
  createFamily,
  deleteFamily,
  getFamily,
  getFamilyReport,
  listAssignmentRuns,
  listFamilies,
  moveMember,
  runAssignment,
  selectParents,
} from "@/data/familiesStore";

type CreateDraft = { familyName: string };

const Families = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();

  const canManage = hasRolePermission(role, "families.manage");
  const canAssign = hasRolePermission(role, "families.assign");

  const [families, setFamilies] = useState<Family[]>([]);
  const [report, setReport] = useState<FamilyReportSummary | null>(null);
  const [runs, setRuns] = useState<AssignmentRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [familyQuery, setFamilyQuery] = useState("");
  const [familyPage, setFamilyPage] = useState(1);
  const familyPageSize = 10;

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ familyName: "" });

  // Detail dialog
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Assignment preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<AssignmentResult | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("unassigned_only");

  // ---------- Loaders ----------
  const refresh = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [f, r, h] = await Promise.all([
        listFamilies(accessToken),
        getFamilyReport(accessToken),
        listAssignmentRuns(accessToken),
      ]);
      setFamilies(f);
      setReport(r);
      setRuns(h);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load families.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isReady || !accessToken) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isReady]);

  const filteredFamilies = useMemo(() => {
    const ql = familyQuery.trim().toLowerCase();
    if (!ql) return families;
    return families.filter((f) => {
      const daddy = f.daddy?.fullName ?? "";
      const mummy = f.mummy?.fullName ?? "";
      return (
        f.familyName.toLowerCase().includes(ql) ||
        f.familyCode.toLowerCase().includes(ql) ||
        daddy.toLowerCase().includes(ql) ||
        mummy.toLowerCase().includes(ql)
      );
    });
  }, [families, familyQuery]);

  const familyTotalPages = Math.max(1, Math.ceil(filteredFamilies.length / familyPageSize));

  useEffect(() => {
    setFamilyPage((current) => Math.min(current, familyTotalPages));
  }, [familyTotalPages]);

  const pagedFamilies = useMemo(() => {
    const start = (familyPage - 1) * familyPageSize;
    return filteredFamilies.slice(start, start + familyPageSize);
  }, [filteredFamilies, familyPage, familyPageSize]);

  // ---------- Family CRUD ----------
  const handleCreate = async () => {
    if (!accessToken) return;
    const name = createDraft.familyName.trim();
    if (name.length < 2) {
      toast.error("Family name is required.");
      return;
    }
    setBusy(true);
    try {
      await createFamily(accessToken, { familyName: name });
      toast.success("Family created.");
      setCreateOpen(false);
      setCreateDraft({ familyName: "" });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create family.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (family: Family) => {
    if (!accessToken) return;
    if (family.totalMembers > 0) {
      toast.error("Reassign or remove members before deleting this family.");
      return;
    }
    if (!window.confirm(`Delete family "${family.familyName}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteFamily(accessToken, family.id);
      toast.success("Family deleted.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete family.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- Detail / parents / move ----------
  const openDetail = async (familyId: string) => {
    if (!accessToken) return;
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const data = await getFamily(accessToken, familyId);
      setDetail(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load family detail.");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSetParent = async (role: "daddy" | "mummy", memberId: string | null) => {
    if (!accessToken || !detail) return;
    setBusy(true);
    try {
      const updated = await selectParents(accessToken, detail.id, {
        [role === "daddy" ? "daddyMemberId" : "mummyMemberId"]: memberId,
      });
      setDetail(updated);
      toast.success("Parents updated.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update parents.");
    } finally {
      setBusy(false);
    }
  };

  const handleMoveMember = async (memberId: string, targetFamilyId: string) => {
    if (!accessToken || !detail) return;
    if (targetFamilyId === detail.id) return;
    setBusy(true);
    try {
      await moveMember(accessToken, { memberId, targetFamilyId });
      toast.success("Member moved.");
      // Reload current family detail since the member has left it
      const refreshed = await getFamily(accessToken, detail.id);
      setDetail(refreshed);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move member.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- Assignment ----------
  const handlePreview = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const result = await runAssignment(accessToken, { mode: assignmentMode, preview: true });
      setPreview(result);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build preview.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      await runAssignment(accessToken, { mode: assignmentMode, preview: false });
      toast.success("Assignment completed.");
      setPreviewOpen(false);
      setPreview(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run assignment.");
    } finally {
      setBusy(false);
    }
  };

  const totals = report?.totals;

  const otherFamiliesForMove = useMemo(
    () => families.filter((f) => f.id !== detail?.id && f.status === "active"),
    [families, detail?.id],
  );

  // ---------- Render ----------
  return (
    <>
      <PageHeader
        title="Families"
        subtitle="Predefined social families used for fellowship, mentorship, and pastoral care."
      >
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading || busy}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New family
          </Button>
        )}
        {canAssign && (
          <Button size="sm" variant="secondary" onClick={handlePreview} disabled={busy || families.length === 0}>
            <Shuffle className="mr-2 h-4 w-4" />
            Run assignment
          </Button>
        )}
      </PageHeader>

      {/* Summary tiles */}
      {totals && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Active families" value={totals.activeFamilies} />
          <SummaryTile label="Members assigned" value={totals.totalAssignedMembers} />
          <SummaryTile
            label="Unassigned active members"
            value={totals.unassignedActiveMembers}
            tone={totals.unassignedActiveMembers > 0 ? "warning" : "default"}
          />
          <SummaryTile
            label="Missing parents"
            value={totals.familiesMissingDaddy + totals.familiesMissingMummy}
            tone={totals.familiesMissingDaddy + totals.familiesMissingMummy > 0 ? "warning" : "default"}
          />
        </div>
      )}

      <Tabs defaultValue="families" className="w-full">
        <TabsList>
          <TabsTrigger value="families">Families</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="runs">Assignment history</TabsTrigger>
        </TabsList>

        <TabsContent value="families">
          <Card>
            <CardHeader>
              <CardTitle>All families</CardTitle>
              <CardDescription>
                {loading
                  ? "Loading…"
                  : familyQuery
                    ? `${filteredFamilies.length} of ${families.length} families`
                    : `${families.length} families`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredFamilies.length === 0 && !loading && (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {familyQuery
                    ? "No families match your search."
                    : (canManage
                      ? "No families yet. Create one to get started."
                      : "No families have been created yet.")}
                </div>
              )}
              {filteredFamilies.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Input
                      value={familyQuery}
                      onChange={(e) => setFamilyQuery(e.target.value)}
                      placeholder="Search families, codes, or parents"
                      className="sm:max-w-xs"
                    />
                    <div className="text-xs text-muted-foreground">
                      {filteredFamilies.length} result{filteredFamilies.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Family</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead className="text-center">Members</TableHead>
                        <TableHead className="text-center">M / F</TableHead>
                        <TableHead>Daddy</TableHead>
                        <TableHead>Mummy</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedFamilies.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.familyName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{f.familyCode}</Badge>
                          </TableCell>
                          <TableCell className="text-center">{f.totalMembers}</TableCell>
                          <TableCell className="text-center">
                            {f.maleCount} / {f.femaleCount}
                          </TableCell>
                          <TableCell>
                            {f.daddy ? (
                              f.daddy.fullName
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {f.mummy ? (
                              f.mummy.fullName
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={f.status === "active" ? "default" : "secondary"}>
                              {f.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => openDetail(f.id)}>
                                <Users className="mr-2 h-3.5 w-3.5" />
                                View
                              </Button>
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(f)}
                                  disabled={busy}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <PaginationFooter
                    page={familyPage}
                    totalPages={familyTotalPages}
                    totalItems={filteredFamilies.length}
                    pageSize={familyPageSize}
                    onPageChange={setFamilyPage}
                    className="pt-3"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Composition report</CardTitle>
              <CardDescription>
                Per-family balance and parent coverage at a glance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!report ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Family</TableHead>
                        <TableHead className="text-center">Members</TableHead>
                        <TableHead className="text-center">M / F</TableHead>
                        <TableHead>Daddy</TableHead>
                        <TableHead>Mummy</TableHead>
                        <TableHead>Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.perFamily.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.familyName}</TableCell>
                          <TableCell className="text-center">{row.totalMembers}</TableCell>
                          <TableCell className="text-center">
                            {row.maleCount} / {row.femaleCount}
                          </TableCell>
                          <TableCell>
                            {row.hasDaddy ? (
                              <Badge variant="default">OK</Badge>
                            ) : (
                              <Badge variant="secondary">Missing</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.hasMummy ? (
                              <Badge variant="default">OK</Badge>
                            ) : (
                              <Badge variant="secondary">Missing</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.balanced ? (
                              <Badge variant="default">Balanced</Badge>
                            ) : (
                              <Badge variant="secondary">Off by &gt; 1</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Assignment history</CardTitle>
              <CardDescription>Most recent random assignment runs.</CardDescription>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No assignment runs yet.
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead className="text-center">Members</TableHead>
                        <TableHead className="text-center">Families</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            {r.assignmentType === "reassign_all" ? "Reassign all" : "Unassigned only"}
                          </TableCell>
                          <TableCell className="text-center">{r.totalMembersAssigned}</TableCell>
                          <TableCell className="text-center">{r.totalFamilies}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "completed" ? "default" : "secondary"}>
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create dialog (President) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create family</DialogTitle>
            <DialogDescription>
              Predefined social families. Members are assigned later by the VP-Social.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="family-name">Family name</Label>
              <Input
                id="family-name"
                value={createDraft.familyName}
                onChange={(e) => setCreateDraft((d) => ({ ...d, familyName: e.target.value }))}
                placeholder="e.g. Family of Ruth"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A family code is generated automatically from the family name.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.familyName ?? "Family"}</DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.totalMembers} members · ${detail.maleCount} male · ${detail.femaleCount} female`
                : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading family…
            </div>
          ) : (
            <div className="space-y-5">
              {/* Parents */}
              <div className="grid gap-3 sm:grid-cols-2">
                <ParentSlot
                  label="Daddy (male)"
                  selectedMemberId={detail.daddy?.memberId ?? null}
                  candidates={detail.members.filter((m) => m.gender === "male")}
                  disabled={!canAssign || busy}
                  onChange={(id) => handleSetParent("daddy", id)}
                />
                <ParentSlot
                  label="Mummy (female)"
                  selectedMemberId={detail.mummy?.memberId ?? null}
                  candidates={detail.members.filter((m) => m.gender === "female")}
                  disabled={!canAssign || busy}
                  onChange={(id) => handleSetParent("mummy", id)}
                />
              </div>

              {/* Members */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4" /> Members
                </h3>
                {detail.members.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No members assigned yet.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Member #</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Role</TableHead>
                          {canAssign && <TableHead className="text-right">Move to…</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.members.map((m) => (
                          <TableRow key={m.membershipId}>
                            <TableCell className="font-medium">{m.fullName}</TableCell>
                            <TableCell>{m.memberNo}</TableCell>
                            <TableCell>{m.gender ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={m.roleInFamily === "member" ? "outline" : "default"}>
                                {m.roleInFamily}
                              </Badge>
                            </TableCell>
                            {canAssign && (
                              <TableCell className="text-right">
                                <Select
                                  onValueChange={(value) => handleMoveMember(m.memberId, value)}
                                  disabled={busy || otherFamiliesForMove.length === 0}
                                >
                                  <SelectTrigger className="ml-auto h-8 w-[180px]">
                                    <SelectValue placeholder="Choose family" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {otherFamiliesForMove.map((target) => (
                                      <SelectItem key={target.id} value={target.id}>
                                        {target.familyName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assignment preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" /> Assignment preview
            </DialogTitle>
            <DialogDescription>
              Review the proposed distribution. Nothing is saved until you confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Label className="text-sm">Mode</Label>
            <Select
              value={assignmentMode}
              onValueChange={(v) => setAssignmentMode(v as AssignmentMode)}
              disabled={busy}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned_only">Unassigned members only</SelectItem>
                <SelectItem value="reassign_all">Reassign everyone</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handlePreview} disabled={busy}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-shuffle preview
            </Button>
          </div>

          {!preview ? (
            <div className="text-sm text-muted-foreground">Building preview…</div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Family</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Male</TableHead>
                    <TableHead className="text-center">Female</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.families.map((row) => (
                    <TableRow key={row.familyId}>
                      <TableCell className="font-medium">{row.familyName}</TableCell>
                      <TableCell className="text-center">{row.total}</TableCell>
                      <TableCell className="text-center">{row.maleCount}</TableCell>
                      <TableCell className="text-center">{row.femaleCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAssignment} disabled={busy || !preview}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm &amp; save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const SummaryTile = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning";
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 font-display text-2xl font-bold " +
          (tone === "warning" ? "text-amber-600" : "")
        }
      >
        {value}
      </div>
    </CardContent>
  </Card>
);

const ParentSlot = ({
  label,
  selectedMemberId,
  candidates,
  disabled,
  onChange,
}: {
  label: string;
  selectedMemberId: string | null;
  candidates: Array<{ memberId: string; fullName: string }>;
  disabled: boolean;
  onChange: (memberId: string | null) => void;
}) => (
  <div className="rounded-md border p-3">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <Select
      value={selectedMemberId ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Not selected —</SelectItem>
        {candidates.map((c) => (
          <SelectItem key={c.memberId} value={c.memberId}>
            {c.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {candidates.length === 0 && (
      <p className="mt-2 text-xs text-muted-foreground">
        No eligible members in this family yet.
      </p>
    )}
  </div>
);

export default Families;
