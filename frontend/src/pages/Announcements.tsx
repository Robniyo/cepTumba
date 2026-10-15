import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AnnouncementCategory,
  AnnouncementRecord,
  AnnouncementStatus,
  ANNOUNCEMENT_STATUSES,
  deleteAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  setAnnouncementPinned,
  updateAnnouncement,
  updateAnnouncementStatus,
} from "@/data/announcementsStore";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { hasRolePermission, Role, ROLE_LABELS } from "@/lib/roles";
import { format } from "date-fns";
import { Pin, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const categories: { value: AnnouncementCategory; label: string; cls: string }[] = [
  { value: "urgent", label: "Urgent", cls: "bg-destructive/15 text-destructive" },
  { value: "spiritual", label: "Spiritual", cls: "bg-primary/15 text-primary" },
  { value: "finance", label: "Finance", cls: "bg-success/15 text-success" },
  { value: "social", label: "Social", cls: "bg-accent/20 text-accent" },
  { value: "academic", label: "Academic", cls: "bg-info/15 text-info" },
  { value: "general", label: "General", cls: "bg-muted text-muted-foreground" },
];

const statusMeta: { value: AnnouncementStatus; label: string; cls: string }[] = [
  { value: "draft", label: "Draft", cls: "bg-muted text-muted-foreground" },
  { value: "scheduled", label: "Scheduled", cls: "bg-info/15 text-info" },
  { value: "published", label: "Published", cls: "bg-success/15 text-success" },
  { value: "archived", label: "Archived", cls: "bg-accent/20 text-accent" },
];

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

type AnnouncementAudienceType = "all" | "leaders_only" | "role_based";

const audienceOptions: { value: AnnouncementAudienceType; label: string; description: string }[] = [
  {
    value: "all",
    label: "Everyone",
    description: "Visible to all authenticated users when published.",
  },
  {
    value: "leaders_only",
    label: "Leaders only",
    description: "Visible only to leadership roles when published.",
  },
  {
    value: "role_based",
    label: "Selected roles",
    description: "Visible only to selected roles when published.",
  },
];

const audienceRoleOptions: Role[] = [
  "president",
  "vp_prayers",
  "vp_social",
  "advisor_prayers",
  "advisor_social",
  "accountant",
  "secretary",
  "member",
];

const createAnnouncementDraft = (isPresident: boolean) => ({
  title: "",
  body: "",
  category: "general" as AnnouncementCategory,
  status: (isPresident ? "published" : "draft") as AnnouncementStatus,
  scheduledFor: "",
  expiresAt: "",
  audienceType: "all" as AnnouncementAudienceType,
  audienceRoles: [] as Role[],
  pinned: false,
});

const emptyEditDraft = {
  title: "",
  body: "",
  category: "general" as AnnouncementCategory,
};

const PAGE_SIZE = 8;

const Announcements = () => {
  const { accessToken, isReady, user } = useAuth();
  const { role } = useRole();
  const [list, setList] = useState<AnnouncementRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<AnnouncementCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const [announcementPendingEdit, setAnnouncementPendingEdit] = useState<AnnouncementRecord | null>(null);
  const [isUpdatingAnnouncement, setIsUpdatingAnnouncement] = useState(false);
  const [editDraft, setEditDraft] = useState(emptyEditDraft);
  const [announcementPendingDelete, setAnnouncementPendingDelete] = useState<AnnouncementRecord | null>(null);
  const [isDeletingAnnouncement, setIsDeletingAnnouncement] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const canCreateAnnouncements = hasRolePermission(role, "announcements.publish");
  const canApproveAnnouncements = role === "president";
  const [draft, setDraft] = useState(createAnnouncementDraft(canApproveAnnouncements));
  const canPinManage = role === "president" || role === "secretary";
  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = total === 0 ? 0 : offset + list.length;

  const refreshAnnouncements = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const updateCategoryFilter = (nextFilter: AnnouncementCategory | "all") => {
    setFilter(nextFilter);
    setPage(1);
  };

  const updateStatusFilter = (nextFilter: AnnouncementStatus | "all") => {
    setStatusFilter(nextFilter);
    setPage(1);
  };

  const toggleAudienceRole = (targetRole: Role) => {
    setDraft((prev) => {
      const hasRole = prev.audienceRoles.includes(targetRole);
      return {
        ...prev,
        audienceRoles: hasRole
          ? prev.audienceRoles.filter((roleItem) => roleItem !== targetRole)
          : [...prev.audienceRoles, targetRole],
      };
    });
  };

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!accessToken) {
      setList([]);
      setTotal(0);
      setPage(1);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadAnnouncements = async () => {
      setIsLoading(true);
      try {
        const response = await listAnnouncements(accessToken, {
          category: filter === "all" ? undefined : filter,
          status: statusFilter === "all" ? undefined : statusFilter,
          includeUnpublished: canCreateAnnouncements,
          offset,
          limit: PAGE_SIZE,
        });
        if (!cancelled) {
          if (page > 1 && response.items.length === 0 && response.total > 0) {
            setList([]);
            setTotal(response.total);
            setPage((prev) => Math.max(1, prev - 1));
            return;
          }

          setList(response.items);
          setTotal(response.total);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "Unable to load announcements."));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadAnnouncements();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canCreateAnnouncements, filter, isReady, offset, page, refreshKey, statusFilter]);

  const submit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    if (!canCreateAnnouncements) {
      toast.error("You are not allowed to create announcements.");
      return;
    }

    if (!draft.title.trim() || !draft.body.trim()) return;

    const nextStatus = canApproveAnnouncements ? draft.status : "draft";

    if (nextStatus === "scheduled" && !draft.scheduledFor) {
      toast.error("Pick a schedule date and time for scheduled announcements.");
      return;
    }

    if (nextStatus === "scheduled" && !draft.expiresAt) {
      toast.error("Pick an expiry date and time for scheduled announcements.");
      return;
    }

    if (
      nextStatus === "scheduled" &&
      draft.scheduledFor &&
      draft.expiresAt &&
      new Date(draft.expiresAt).getTime() <= new Date(draft.scheduledFor).getTime()
    ) {
      toast.error("Expiry must be after the auto publish time.");
      return;
    }

    if (draft.audienceType === "role_based" && draft.audienceRoles.length === 0) {
      toast.error("Select at least one role for role-based targeting.");
      return;
    }

    setIsSubmitting(true);
    try {
      const announcement = await publishAnnouncement(accessToken, {
        title: draft.title.trim(),
        body: draft.body.trim(),
        category: draft.category,
        status: nextStatus,
        scheduledFor: nextStatus === "scheduled" ? new Date(draft.scheduledFor).toISOString() : undefined,
        expiresAt: nextStatus === "scheduled" ? new Date(draft.expiresAt).toISOString() : undefined,
        audienceType: draft.audienceType,
        audienceRoles: draft.audienceType === "role_based" ? draft.audienceRoles : undefined,
        pinned: canPinManage ? draft.pinned : undefined,
      });

      setPage(1);
      refreshAnnouncements();
      setDraft(createAnnouncementDraft(canApproveAnnouncements));
      setOpen(false);
      if (!canApproveAnnouncements) {
        toast.success("Announcement submitted for president approval.");
      } else if (nextStatus === "scheduled") {
        toast.success("Announcement scheduled successfully.");
      } else if (nextStatus === "published") {
        toast.success("Announcement published successfully.");
      } else {
        toast.success("Announcement saved successfully.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to publish announcement."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (announcement: AnnouncementRecord) => {
    setAnnouncementPendingEdit(announcement);
    setEditDraft({
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
    });
  };

  const closeEditDialog = () => {
    if (isUpdatingAnnouncement) {
      return;
    }

    setAnnouncementPendingEdit(null);
    setEditDraft(emptyEditDraft);
  };

  const saveEditedAnnouncement = async () => {
    if (!announcementPendingEdit) {
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    if (!editDraft.title.trim() || !editDraft.body.trim()) {
      toast.error("Title and body are required.");
      return;
    }

    setIsUpdatingAnnouncement(true);
    try {
      const updated = await updateAnnouncement(accessToken, announcementPendingEdit.id, {
        title: editDraft.title.trim(),
        body: editDraft.body.trim(),
        category: editDraft.category,
      });

      refreshAnnouncements();
      toast.success("Announcement updated.");
      closeEditDialog();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update announcement."));
    } finally {
      setIsUpdatingAnnouncement(false);
    }
  };

  const requestDeleteAnnouncement = (announcement: AnnouncementRecord) => {
    setAnnouncementPendingDelete(announcement);
  };

  const deleteSelectedAnnouncement = async () => {
    if (!announcementPendingDelete) {
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsDeletingAnnouncement(true);
    try {
      const payload = await deleteAnnouncement(accessToken, announcementPendingDelete.id);
      if (payload.deletedAnnouncementId) {
        refreshAnnouncements();
      }
      setAnnouncementPendingDelete(null);
      toast.success("Announcement deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to delete announcement."));
    } finally {
      setIsDeletingAnnouncement(false);
    }
  };

  const togglePinned = async (announcement: AnnouncementRecord) => {
    if (!accessToken || activeMutationId) {
      return;
    }

    setActiveMutationId(announcement.id);
    try {
      const updated = await setAnnouncementPinned(
        accessToken,
        announcement.id,
        !announcement.pinned,
      );
      if (updated.id) {
        refreshAnnouncements();
      }
      toast.success(updated.pinned ? "Announcement pinned." : "Announcement unpinned.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update pinned state."));
    } finally {
      setActiveMutationId(null);
    }
  };

  const setLifecycleStatus = async (
    announcement: AnnouncementRecord,
    status: AnnouncementStatus,
  ) => {
    if (!accessToken || activeMutationId) {
      return;
    }

    if (announcement.status === status) {
      return;
    }

    setActiveMutationId(announcement.id);
    try {
      const updated = await updateAnnouncementStatus(accessToken, announcement.id, {
        status,
      });

      if (updated.id) {
        refreshAnnouncements();
      }
      toast.success(`Announcement marked as ${status}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update announcement status."));
    } finally {
      setActiveMutationId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" subtitle="Share updates with the fellowship">
        {canCreateAnnouncements && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground border-0 hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" /> New announcement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
                <Textarea placeholder="Write your message..." rows={5} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v as AnnouncementCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                {canApproveAnnouncements ? (
                  <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as AnnouncementStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusMeta.find((meta) => meta.value === status)?.label ?? status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
                    Submitted announcements are saved as Draft and require president approval before publishing.
                  </div>
                )}

                {canApproveAnnouncements && draft.status === "scheduled" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Auto publish at</p>
                      <Input
                        type="datetime-local"
                        value={draft.scheduledFor}
                        onChange={(e) => setDraft({ ...draft, scheduledFor: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Expire at</p>
                      <Input
                        type="datetime-local"
                        value={draft.expiresAt}
                        onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {canPinManage && (
                  <Select
                    value={String(draft.pinned)}
                    onValueChange={(value) =>
                      setDraft((prev) => ({ ...prev, pinned: value === "true" }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Not pinned</SelectItem>
                      <SelectItem value="true">Pinned</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Target audience</p>
                  <Select
                    value={draft.audienceType}
                    onValueChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        audienceType: value as AnnouncementAudienceType,
                        audienceRoles: value === "role_based" ? prev.audienceRoles : [],
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {audienceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {audienceOptions.find((option) => option.value === draft.audienceType)?.description}
                  </p>
                </div>

                {draft.audienceType === "role_based" && (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Choose roles that can view this announcement after publish:</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {audienceRoleOptions.map((targetRole) => (
                        <label key={targetRole} className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={draft.audienceRoles.includes(targetRole)}
                            onCheckedChange={() => toggleAudienceRole(targetRole)}
                          />
                          <span>{ROLE_LABELS[targetRole]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
                <Button onClick={() => void submit()} disabled={isSubmitting} className="gradient-primary text-primary-foreground border-0">
                  {isSubmitting ? "Saving..." : canApproveAnnouncements ? "Publish" : "Submit for approval"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <Dialog open={Boolean(announcementPendingEdit)} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={editDraft.title}
              onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
            <Textarea
              placeholder="Write your message..."
              rows={5}
              value={editDraft.body}
              onChange={(e) => setEditDraft((prev) => ({ ...prev, body: e.target.value }))}
            />
            <Select
              value={editDraft.category}
              onValueChange={(value) => setEditDraft((prev) => ({ ...prev, category: value as AnnouncementCategory }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeEditDialog} disabled={isUpdatingAnnouncement}>Cancel</Button>
            <Button
              onClick={() => void saveEditedAnnouncement()}
              disabled={isUpdatingAnnouncement}
              className="gradient-primary text-primary-foreground border-0"
            >
              {isUpdatingAnnouncement ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(announcementPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingAnnouncement) {
            setAnnouncementPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this announcement?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAnnouncement}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedAnnouncement();
              }}
              disabled={isDeletingAnnouncement}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAnnouncement ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => updateCategoryFilter("all")}>All</Chip>
        {categories.map(c => (
          <Chip key={c.value} active={filter === c.value} onClick={() => updateCategoryFilter(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {canCreateAnnouncements && (
        <div className="flex flex-wrap gap-2">
          <Chip active={statusFilter === "all"} onClick={() => updateStatusFilter("all")}>All statuses</Chip>
          {statusMeta.map((status) => (
            <Chip
              key={status.value}
              active={statusFilter === status.value}
              onClick={() => updateStatusFilter(status.value)}
            >
              {status.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {isLoading && (
          <Card className="p-5 md:col-span-2">
            <p className="text-sm text-muted-foreground">Loading announcements...</p>
          </Card>
        )}

        {!isLoading && list.length === 0 && (
          <Card className="p-5 md:col-span-2">
            <p className="text-sm text-muted-foreground">No announcements found for the selected category.</p>
          </Card>
        )}

        {!isLoading && list.map(a => {
          const cat = categories.find(c => c.value === a.category)!;
          const status = statusMeta.find((meta) => meta.value === a.status);
          const canManageAnnouncement = Boolean(
            user && (canApproveAnnouncements || a.authorUserId === user.id),
          );
          const isCardBusy =
            activeMutationId === a.id ||
            (isUpdatingAnnouncement && announcementPendingEdit?.id === a.id) ||
            (isDeletingAnnouncement && announcementPendingDelete?.id === a.id);
          return (
            <Card key={a.id} className="p-5 shadow-elegant transition-base hover:shadow-elevated hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("border-0 font-medium", cat.cls)}>{cat.label}</Badge>
                  {status && (
                    <Badge variant="outline" className={cn("border-0 font-medium", status.cls)}>
                      {status.label}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {a.pinned && <Pin className="h-4 w-4 text-accent" />}
                  {canManageAnnouncement && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => openEditDialog(a)}
                      disabled={isCardBusy}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  )}
                  {canPinManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => void togglePinned(a)}
                      disabled={isCardBusy}
                    >
                      {a.pinned ? "Unpin" : "Pin"}
                    </Button>
                  )}
                  {canManageAnnouncement && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => requestDeleteAnnouncement(a)}
                      disabled={isCardBusy}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <h3 className="font-display text-lg font-bold leading-snug">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a.body}</p>

              {a.status === "scheduled" && a.scheduledFor && (
                <p className="mt-2 text-xs text-info">
                  Scheduled for {format(new Date(a.scheduledFor), "MMM d, yyyy · h:mm a")}
                </p>
              )}

              {a.expiresAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Expires {format(new Date(a.expiresAt), "MMM d, yyyy · h:mm a")}
                </p>
              )}

              {canApproveAnnouncements && (
                <div className="mt-3">
                  <Select
                    value={a.status}
                    onValueChange={(value) =>
                      void setLifecycleStatus(a, value as AnnouncementStatus)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_STATUSES.filter((statusValue) => statusValue !== "scheduled").map((statusValue) => (
                        <SelectItem key={statusValue} value={statusValue}>
                          {statusMeta.find((meta) => meta.value === statusValue)?.label ?? statusValue}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-3">
                <span>By <span className="text-foreground font-medium">{a.author}</span></span>
                <span>{format(new Date(a.createdAt), "MMM d, yyyy · h:mm a")}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {!isLoading && total > 0 && (
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {rangeStart}-{rangeEnd} of {total} announcements
            </p>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3.5 py-1.5 rounded-full text-xs font-medium border transition-base",
      active
        ? "bg-primary text-primary-foreground border-primary shadow-sm"
        : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
    )}
  >
    {children}
  </button>
);

export default Announcements;
