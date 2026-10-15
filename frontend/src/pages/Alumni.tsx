import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtRwf } from "@/data/financeStore";
import { addContribution as addAlumniContribution, createAlumni, listAlumni, updateAlumni, type Alumni } from "@/data/alumniStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission } from "@/lib/roles";
import { GraduationCap, HandHeart, Pencil, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

const Alumni = () => {
  const { role } = useRole();
  const { accessToken, isReady } = useAuth();
  const canManage = hasRolePermission(role, "alumni.manage");

  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editing, setEditing] = useState<Alumni | null>(null);
  const [contributionOpen, setContributionOpen] = useState(false);
  const [contributionTarget, setContributionTarget] = useState<Alumni | null>(null);
  const [contributionAmount, setContributionAmount] = useState("1000");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    graduationYear: String(new Date().getFullYear()),
    email: "",
    phone: "",
    currentRole: "",
    mentorAvailable: false,
  });
  const [editDraft, setEditDraft] = useState({
    name: "",
    graduationYear: String(new Date().getFullYear()),
    email: "",
    phone: "",
    currentRole: "",
    mentorAvailable: false,
  });

  useEffect(() => {
    if (!isReady) return;
    if (!accessToken) {
      setAlumni([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const items = await listAlumni(accessToken);
        if (!cancelled) setAlumni(items);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load alumni.");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return alumni.filter((a) => `${a.name} ${a.email} ${a.currentRole}`.toLowerCase().includes(q));
  }, [alumni, query]);

  const mentors = alumni.filter((a) => a.mentorAvailable).length;
  const totalContrib = alumni.reduce((sum, a) => sum + a.contributionTotal, 0);

  const openEditDialog = (target: Alumni) => {
    setEditing(target);
    setEditDraft({
      name: target.name,
      graduationYear: String(target.graduationYear),
      email: target.email ?? "",
      phone: target.phone ?? "",
      currentRole: target.currentRole ?? "",
      mentorAvailable: target.mentorAvailable,
    });
    setEditOpen(true);
  };

  const openContributionDialog = (target: Alumni) => {
    setContributionTarget(target);
    setContributionAmount("1000");
    setContributionOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Alumni Network" subtitle="Track graduates, mentorship, and alumni support to the fellowship">
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Add alumni</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register alumni</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Full name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="number" placeholder="Graduation year" value={draft.graduationYear} onChange={(e) => setDraft({ ...draft, graduationYear: e.target.value })} />
                  <Input placeholder="Current role/profession" value={draft.currentRole} onChange={(e) => setDraft({ ...draft, currentRole: e.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="email" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                  <Input placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.mentorAvailable}
                    onCheckedChange={(v) => setDraft({ ...draft, mentorAvailable: Boolean(v) })}
                  />
                  Available for mentorship
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    if (!draft.name.trim() || !draft.email.trim()) return;
                    if (!accessToken) {
                      toast.error("Session token is missing. Please sign in again.");
                      return;
                    }

                    setIsSaving(true);
                    void createAlumni(accessToken, {
                      name: draft.name,
                      graduationYear: Number(draft.graduationYear) || new Date().getFullYear(),
                      email: draft.email,
                      phone: draft.phone,
                      currentRole: draft.currentRole,
                      mentorAvailable: draft.mentorAvailable,
                    })
                      .then((created) => {
                        setAlumni((prev) => [created, ...prev]);
                        setDraft({ name: "", graduationYear: String(new Date().getFullYear()), email: "", phone: "", currentRole: "", mentorAvailable: false });
                        setOpen(false);
                        toast.success("Alumni added.");
                      })
                      .catch((err) => {
                        toast.error(err instanceof Error ? err.message : "Failed to add alumni.");
                      })
                      .finally(() => setIsSaving(false));
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      {canManage && (
        <Dialog
          open={editOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setEditOpen(false);
              setEditing(null);
            } else {
              setEditOpen(true);
            }
          }}
        >
          <DialogContent>
            <DialogHeader><DialogTitle>Edit alumni</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Full name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="number" placeholder="Graduation year" value={editDraft.graduationYear} onChange={(e) => setEditDraft({ ...editDraft, graduationYear: e.target.value })} />
                <Input placeholder="Current role/profession" value={editDraft.currentRole} onChange={(e) => setEditDraft({ ...editDraft, currentRole: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="email" placeholder="Email" value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} />
                <Input placeholder="Phone" value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={editDraft.mentorAvailable}
                  onCheckedChange={(v) => setEditDraft({ ...editDraft, mentorAvailable: Boolean(v) })}
                />
                Available for mentorship
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditOpen(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={isUpdating}
                onClick={() => {
                  if (!editing) return;
                  if (!editDraft.name.trim()) {
                    toast.error("Full name is required.");
                    return;
                  }
                  if (!accessToken) {
                    toast.error("Session token is missing. Please sign in again.");
                    return;
                  }

                  const nextYear = Number(editDraft.graduationYear) || editing.graduationYear;
                  const nextEmail = editDraft.email.trim();
                  const nextPhone = editDraft.phone.trim();
                  const nextRole = editDraft.currentRole.trim();

                  setIsUpdating(true);
                  void updateAlumni(accessToken, editing.id, {
                    name: editDraft.name.trim(),
                    graduationYear: nextYear,
                    email: nextEmail ? nextEmail : undefined,
                    phone: nextPhone ? nextPhone : undefined,
                    currentRole: nextRole ? nextRole : undefined,
                    mentorAvailable: editDraft.mentorAvailable,
                  })
                    .then((updated) => {
                      setAlumni((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                      setEditOpen(false);
                      setEditing(null);
                      toast.success("Alumni updated.");
                    })
                    .catch((err) => {
                      toast.error(err instanceof Error ? err.message : "Failed to update alumni.");
                    })
                    .finally(() => setIsUpdating(false));
                }}
              >
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canManage && (
        <Dialog
          open={contributionOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setContributionOpen(false);
              setContributionTarget(null);
            } else {
              setContributionOpen(true);
            }
          }}
        >
          <DialogContent>
            <DialogHeader><DialogTitle>Record contribution</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Input
                type="number"
                min="1"
                placeholder="Amount (Rwf)"
                value={contributionAmount}
                onChange={(e) => setContributionAmount(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setContributionOpen(false);
                  setContributionTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!contributionTarget) return;
                  if (!accessToken) {
                    toast.error("Session token is missing. Please sign in again.");
                    return;
                  }

                  const amount = Number(contributionAmount);
                  if (!Number.isFinite(amount) || amount <= 0) {
                    toast.error("Amount must be a positive number.");
                    return;
                  }
                  if (!Number.isInteger(amount)) {
                    toast.error("Amount must be a whole number.");
                    return;
                  }

                  void addAlumniContribution(accessToken, contributionTarget.id, amount)
                    .then((updated) => {
                      setAlumni((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                      setContributionOpen(false);
                      setContributionTarget(null);
                      toast.success("Contribution recorded.");
                    })
                    .catch((err) => {
                      toast.error(err instanceof Error ? err.message : "Failed to record contribution.");
                    });
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Alumni" value={alumni.length} icon={GraduationCap} variant="primary" trend="in database" />
        <StatCard label="Mentors" value={mentors} icon={Users} variant="info" trend="available to guide" />
        <StatCard label="Contributions" value={fmtRwf(totalContrib)} icon={HandHeart} variant="success" trend="total support" />
      </div>

      <Card className="p-4 shadow-elegant">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search alumni..." className="pl-9" />
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((a) => (
          <Card key={a.id} className="p-4 shadow-elegant">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{a.name}</h3>
                <div className="text-xs text-muted-foreground">Class of {a.graduationYear} · {a.currentRole}</div>
                <div className="mt-1 text-xs text-muted-foreground">{a.email} · {a.phone}</div>
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Edit ${a.name}`}
                    onClick={() => openEditDialog(a)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${a.mentorAvailable ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {a.mentorAvailable ? "Mentor" : "No mentor"}
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Contribution total</div>
                <div className="font-semibold">{fmtRwf(a.contributionTotal)}</div>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    openContributionDialog(a);
                  }}
                >
                  Record contribution
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Alumni;
