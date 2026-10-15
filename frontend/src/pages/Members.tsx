import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { hasRolePermission } from "@/lib/roles";
import { todayLocalISODate } from "@/lib/dateUtils";
import { downloadBlob, getDownloadName } from "@/lib/download";
import { Search, UserPlus, Mail, Phone, Download, MoreHorizontal, Pencil, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type MemberStatus = "active" | "inactive" | "graduated" | "suspended";
type Gender = "male" | "female" | "other";

type MemberView = {
  id: string;
  memberNo: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  yearOfStudy: string;
  fellowship: string;
  status: MemberStatus;
  joinedAt: string;
  baptized: boolean;
  avatarHue: number;
  gender: Gender | null;
};

type ApiMember = {
  id: string;
  memberNo: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  yearOfStudy: string | null;
  fellowship: string | null;
  status: MemberStatus;
  joinedAt: string | null;
  baptized: boolean;
  avatarHue: number;
  dateOfBirth: string | null;
  gender: Gender | null;
  createdAt: string;
  updatedAt: string;
};

type CreateMemberResponse = {
  member: ApiMember;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
  defaultPassword: string | null;
};

type UpdateMemberStatusResponse = {
  member: ApiMember;
};

type DeleteMemberResponse = {
  deletedMemberId: string;
  deletedUserId: string | null;
};

type UpdateMemberResponse = {
  member: ApiMember;
};

type MemberEditDraft = {
  memberNo: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  yearOfStudy: string;
  fellowship: string;
  baptized: boolean;
  gender: Gender | "";
  status: MemberStatus;
};

const parseApiError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(", ");
    if (typeof payload.message === "string" && payload.message.trim().length > 0) return payload.message;
  } catch {
    // Ignore parse errors and use fallback.
  }
  return fallback;
};

const toMemberView = (apiMember: ApiMember): MemberView => ({
  id: apiMember.id,
  memberNo: apiMember.memberNo,
  fullName: apiMember.fullName,
  email: apiMember.email ?? "",
  phone: apiMember.phone ?? "",
  department: apiMember.department ?? "",
  yearOfStudy: apiMember.yearOfStudy ?? "",
  fellowship: apiMember.fellowship ?? "",
  status: apiMember.status,
  joinedAt: apiMember.joinedAt ?? todayLocalISODate(),
  baptized: apiMember.baptized,
  avatarHue: apiMember.avatarHue,
  gender: apiMember.gender,
});

const statusStyles: Record<MemberStatus, string> = {
  active: "bg-success/15 text-success hover:bg-success/15",
  inactive: "bg-muted text-muted-foreground hover:bg-muted",
  graduated: "bg-info/15 text-info hover:bg-info/15",
  suspended: "bg-destructive/15 text-destructive hover:bg-destructive/15",
};

const statusLabels: Record<MemberStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  graduated: "Graduated",
  suspended: "Suspended",
};

const memberStatuses: MemberStatus[] = ["active", "inactive", "graduated", "suspended"];

const YEAR_OF_STUDY_OPTIONS = ["Not specified", "Y1", "Y2", "Y3", "BTECH"] as const;

const emptyMemberEditDraft: MemberEditDraft = {
  memberNo: "",
  fullName: "",
  email: "",
  phone: "",
  department: "",
  yearOfStudy: "",
  fellowship: "",
  baptized: false,
  gender: "" as const,
  status: "active",
};

const toMemberEditDraft = (member: MemberView): MemberEditDraft => ({
  memberNo: member.memberNo,
  fullName: member.fullName,
  email: member.email,
  phone: member.phone,
  department: member.department,
  yearOfStudy: member.yearOfStudy,
  fellowship: member.fellowship,
  baptized: member.baptized,
  gender: member.gender ?? "",
  status: member.status,
});

const Members = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const canManageMembers = hasRolePermission(role, "members.manage");
  const [membersData, setMembersData] = useState<MemberView[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [fellowship, setFellowship] = useState<string>("all");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingStatusFor, setUpdatingStatusFor] = useState<string | null>(null);
  const [memberPendingEdit, setMemberPendingEdit] = useState<MemberView | null>(null);
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);
  const [editDraft, setEditDraft] = useState<MemberEditDraft>(emptyMemberEditDraft);
  const [memberPendingDelete, setMemberPendingDelete] = useState<MemberView | null>(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null);
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    fullName: "",
    email: "",
    phone: "",
    department: "",
    yearOfStudy: "",
    fellowship: "",
    status: "active" as MemberStatus,
    baptized: false,
    gender: "" as "" | Gender,
  });

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!accessToken) {
      setMembersData([]);
      setIsLoadingMembers(false);
      return;
    }

    let cancelled = false;
    const loadMembers = async () => {
      setIsLoadingMembers(true);
      try {
        const response = await fetch(`${API_BASE_URL}/members`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const message = await parseApiError(response, "Failed to load members.");
          if (!cancelled) {
            setLoadError(message);
            toast.error(message);
          }
          return;
        }

        const data = (await response.json()) as ApiMember[];
        if (!cancelled) {
          setMembersData(data.map((member) => toMemberView(member)));
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = "Unable to load members from server.";
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMembers(false);
        }
      }
    };

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady]);

  const fellowships = useMemo(
    () => Array.from(new Set(membersData.map((m) => m.fellowship).filter((f) => f.trim().length > 0))),
    [membersData],
  );

  const resetCreateDraft = () => {
    setCreateDraft({
      fullName: "",
      email: "",
      phone: "",
      department: "",
      yearOfStudy: "",
      fellowship: "",
      status: "active",
      baptized: false,
      gender: "",
    });
  };

  const onOpenCreateDialog = (open: boolean) => {
    if (!open) {
      resetCreateDraft();
    }
    setOpenCreateDialog(open);
  };

  const createMember = async () => {
    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    if (!createDraft.fullName.trim()) {
      toast.error("Full name is required.");
      return;
    }

    if (role === "president" && !createDraft.email.trim()) {
      toast.error("Email is required when president adds a member.");
      return;
    }

    if (!createDraft.gender) {
      toast.error("Gender is required.");
      return;
    }

    if (createDraft.status === "active" && !createDraft.yearOfStudy.trim()) {
      toast.error("Year of study is required for active members.");
      return;
    }

    const payload = {
      fullName: createDraft.fullName.trim(),
      email: createDraft.email.trim() || undefined,
      phone: createDraft.phone.trim() || undefined,
      department: createDraft.department.trim() || undefined,
      yearOfStudy: createDraft.yearOfStudy.trim() || undefined,
      fellowship: createDraft.fellowship.trim() || undefined,
      status: createDraft.status,
      baptized: createDraft.baptized,
      gender: createDraft.gender || undefined,
    };

    setIsCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to create member.");
        toast.error(message);
        return;
      }

      const data = (await response.json()) as CreateMemberResponse;
      const createdMember = toMemberView(data.member);
      setMembersData((prev) => [createdMember, ...prev]);

      // Reset filters so the newly added member is always visible.
      setQ("");
      setStatus("all");
      setFellowship("all");

      if (data.defaultPassword) {
        toast.success("Member and account created.", {
          description: `Credentials emailed to member. Temporary password: ${data.defaultPassword}`,
        });
      } else {
        toast.success("Member created successfully.");
      }

      onOpenCreateDialog(false);
    } catch {
      toast.error("Unable to reach the server.");
    } finally {
      setIsCreating(false);
    }
  };

  const updateMemberStatus = async (member: MemberView, nextStatus: MemberStatus) => {
    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    if (member.status === nextStatus) {
      return;
    }

    setUpdatingStatusFor(member.id);
    try {
      const response = await fetch(`${API_BASE_URL}/members/${member.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to update member status.");
        toast.error(message);
        return;
      }

      const data = (await response.json()) as UpdateMemberStatusResponse;
      setMembersData((prev) => prev.map((current) => (
        current.id === member.id ? toMemberView(data.member) : current
      )));
      toast.success(`${member.fullName} marked as ${statusLabels[nextStatus].toLowerCase()}.`);
    } catch {
      toast.error("Unable to reach the server.");
    } finally {
      setUpdatingStatusFor(null);
    }
  };

  const requestDeleteMember = (member: MemberView) => {
    setMemberPendingDelete(member);
  };

  const requestEditMember = (member: MemberView) => {
    setMemberPendingEdit(member);
    setEditDraft(toMemberEditDraft(member));
  };

  const closeEditDialog = () => {
    if (isUpdatingMember) {
      return;
    }

    setMemberPendingEdit(null);
    setEditDraft(emptyMemberEditDraft);
  };

  const updateMember = async () => {
    if (!memberPendingEdit) {
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    if (!editDraft.memberNo.trim() || !editDraft.fullName.trim()) {
      toast.error("Member number and full name are required.");
      return;
    }

    if (!editDraft.gender) {
      toast.error("Gender is required.");
      return;
    }

    if (editDraft.status === "active" && !editDraft.yearOfStudy.trim()) {
      toast.error("Year of study is required for active members.");
      return;
    }

    const payload = {
      memberNo: editDraft.memberNo.trim(),
      fullName: editDraft.fullName.trim(),
      email: editDraft.email.trim() ? editDraft.email.trim() : null,
      phone: editDraft.phone,
      department: editDraft.department,
      yearOfStudy: editDraft.yearOfStudy,
      fellowship: editDraft.fellowship,
      baptized: editDraft.baptized,
      gender: editDraft.gender || null,
    };

    setIsUpdatingMember(true);
    try {
      const response = await fetch(`${API_BASE_URL}/members/${memberPendingEdit.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to update member details.");
        toast.error(message);
        return;
      }

      const data = (await response.json()) as UpdateMemberResponse;
      setMembersData((prev) => prev.map((member) => (
        member.id === memberPendingEdit.id ? toMemberView(data.member) : member
      )));
      toast.success("Member details updated.");
      closeEditDialog();
    } catch {
      toast.error("Unable to reach the server.");
    } finally {
      setIsUpdatingMember(false);
    }
  };

  const deleteMember = async () => {
    if (!memberPendingDelete) {
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsDeletingMember(true);
    try {
      const response = await fetch(`${API_BASE_URL}/members/${memberPendingDelete.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to delete member.");
        // If deletion is blocked because the member holds a leadership role,
        // surface a helpful action so the user can reassign that role first.
        if (message && message.toLowerCase().includes("leadership role")) {
          setDeleteBlockedReason(message);
          toast.error(message);
          return;
        }

        toast.error(message);
        return;
      }

      const data = (await response.json()) as DeleteMemberResponse;
      setMembersData((prev) => prev.filter((member) => member.id !== data.deletedMemberId));
      toast.success("Member deleted successfully.");
      setMemberPendingDelete(null);
      setDeleteBlockedReason(null);
    } catch {
      toast.error("Unable to reach the server.");
    } finally {
      setIsDeletingMember(false);
    }
  };

  const filtered = useMemo(() => {
    return membersData.filter((m) => {
      const matches = `${m.fullName} ${m.email} ${m.memberNo} ${m.department}`.toLowerCase().includes(q.toLowerCase());
      const sOk = status === "all" || m.status === status;
      const fOk = fellowship === "all" || m.fellowship === fellowship;
      return matches && sOk && fOk;
    });
  }, [membersData, q, status, fellowship]);

  const exportMembers = async (format: "csv" | "xlsx") => {
    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/members/export?format=${format}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to export members.");
        toast.error(message);
        return;
      }

      const blob = await response.blob();
      const fileName = getDownloadName(
        response.headers.get("content-disposition"),
        `members.${format}`,
      );
      downloadBlob(blob, fileName);
    } catch {
      toast.error("Unable to reach the server.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Members" subtitle={`${filtered.length} of ${membersData.length} members shown`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void exportMembers("csv")}>Export CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportMembers("xlsx")}>Export Excel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canManageMembers && (
          <Button
            className="gradient-primary text-primary-foreground border-0 hover:opacity-90"
            onClick={() => onOpenCreateDialog(true)}
          >
            <UserPlus className="h-4 w-4 mr-2" /> Add member
          </Button>
        )}
      </PageHeader>

      <Dialog open={openCreateDialog} onOpenChange={onOpenCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={createDraft.fullName}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Member full name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={createDraft.email}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="member@college.edu"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={createDraft.phone}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+250..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={createDraft.department}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, department: e.target.value }))}
                placeholder="Computer Science"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Year Of Study</Label>
              <Select
                value={createDraft.yearOfStudy || ""}
                onValueChange={(value) => setCreateDraft((prev) => ({ ...prev, yearOfStudy: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OF_STUDY_OPTIONS.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fellowship">Fellowship</Label>
              <Input
                id="fellowship"
                value={createDraft.fellowship}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, fellowship: e.target.value }))}
                placeholder="Mt. Zion Cell"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={createDraft.status}
                  onValueChange={(value) => setCreateDraft((prev) => ({ ...prev, status: value as MemberStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="graduated">Graduated</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Baptized</Label>
              <Select
                value={String(createDraft.baptized)}
                onValueChange={(value) => setCreateDraft((prev) => ({ ...prev, baptized: value === "true" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select
                value={createDraft.gender || "__unset__"}
                onValueChange={(value) =>
                  setCreateDraft((prev) => ({
                    ...prev,
                    gender: value === "__unset__" ? "" : (value as Gender),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">Not specified</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createMember()}
              disabled={isCreating}
              className="gradient-primary text-primary-foreground border-0 hover:opacity-90"
            >
              {isCreating ? "Creating..." : "Create member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(memberPendingEdit)} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit member details</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="editMemberNo">Member No</Label>
              <Input
                id="editMemberNo"
                value={editDraft.memberNo}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, memberNo: e.target.value }))}
                placeholder="CTC-0009"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editFullName">Full Name</Label>
              <Input
                id="editFullName"
                value={editDraft.fullName}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Member full name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                type="email"
                value={editDraft.email}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="member@college.edu"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editPhone">Phone</Label>
              <Input
                id="editPhone"
                value={editDraft.phone}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+250..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editDepartment">Department</Label>
              <Input
                id="editDepartment"
                value={editDraft.department}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, department: e.target.value }))}
                placeholder="Computer Science"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Year Of Study</Label>
              <Select
                value={editDraft.yearOfStudy || ""}
                onValueChange={(value) => setEditDraft((prev) => ({ ...prev, yearOfStudy: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OF_STUDY_OPTIONS.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editFellowship">Fellowship</Label>
              <Input
                id="editFellowship"
                value={editDraft.fellowship}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, fellowship: e.target.value }))}
                placeholder="Mt. Zion Cell"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={editDraft.status}
                onValueChange={(value) => setEditDraft((prev) => ({ ...prev, status: value as MemberStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {memberStatuses.map((status) => (
                    <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Baptized</Label>
              <Select
                value={String(editDraft.baptized)}
                onValueChange={(value) => setEditDraft((prev) => ({ ...prev, baptized: value === "true" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select
                value={editDraft.gender || "__unset__"}
                onValueChange={(value) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    gender: value === "__unset__" ? "" : (value as Gender),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">Not specified</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeEditDialog} disabled={isUpdatingMember}>
              Cancel
            </Button>
            <Button
              onClick={() => void updateMember()}
              disabled={isUpdatingMember}
              className="gradient-primary text-primary-foreground border-0 hover:opacity-90"
            >
              {isUpdatingMember ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(memberPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingMember) {
            setMemberPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {memberPendingDelete?.fullName ?? "member"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the member profile. If this member still has linked attendance,
              committee, or similar records, deletion will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteBlockedReason && (
            <div className="px-6 pt-0">
              <div className="rounded-md border border-border bg-muted/5 p-4 text-sm">
                <div className="mb-2 font-medium">Deletion blocked</div>
                <div className="text-xs text-muted-foreground">{deleteBlockedReason}</div>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Navigate to leadership management so the user can reassign/revoke the role
                      setMemberPendingDelete(null);
                      setDeleteBlockedReason(null);
                      navigate('/leadership');
                    }}
                  >
                    Reassign role
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDeleteBlockedReason(null);
                    }}
                  >
                    Keep member
                  </Button>
                </div>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMember}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteMember();
              }}
              disabled={isDeletingMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingMember ? "Deleting..." : "Delete member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="p-4 shadow-elegant">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by name, email, member no…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="graduated">Graduated</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fellowship} onValueChange={setFellowship}>
            <SelectTrigger className="sm:w-[200px]"><SelectValue placeholder="Fellowship" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fellowships</SelectItem>
              {fellowships.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loadError && (
        <Card className="p-10 text-center text-sm text-destructive shadow-elegant">
          <div className="font-semibold mb-2">Unable to load members</div>
          <div>{loadError}</div>
        </Card>
      )}

      {!isLoadingMembers && !loadError && filtered.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground shadow-elegant">
          No members found.
        </Card>
      )}

      {isLoadingMembers && !loadError && (
        <Card className="p-10 text-center text-sm text-muted-foreground shadow-elegant">
          Loading members...
        </Card>
      )}

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {filtered.map(m => (
          <Card key={m.id} className="p-4 shadow-elegant">
            <div className="flex items-start gap-3">
              <Avatar member={m} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold truncate">{m.fullName}</div>
                  <div className="flex items-center gap-1">
                    <Badge className={statusStyles[m.status]} variant="outline">{m.status}</Badge>
                    {canManageMembers && (
                      <MemberActions
                        member={m}
                        disabled={
                          isUpdatingMember ||
                          updatingStatusFor === m.id ||
                          (isDeletingMember && memberPendingDelete?.id === m.id)
                        }
                        onEdit={requestEditMember}
                        onStatusChange={updateMemberStatus}
                        onDelete={requestDeleteMember}
                      />
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.memberNo} · {m.department} · {m.yearOfStudy}</div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{m.email}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />{m.phone}
                </div>
                <div className="mt-2 text-xs"><span className="text-muted-foreground">Fellowship:</span> {m.fellowship}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden shadow-elegant">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Member</th>
                <th className="text-left px-5 py-3 font-medium">Member No</th>
                <th className="text-left px-5 py-3 font-medium">Department</th>
                <th className="text-left px-5 py-3 font-medium">Year</th>
                <th className="text-left px-5 py-3 font-medium">Fellowship</th>
                <th className="text-left px-5 py-3 font-medium">Contact</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                {canManageMembers && <th className="text-right px-5 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-secondary/40 transition-base">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar member={m} />
                      <div>
                        <div className="font-medium">{m.fullName}</div>
                        <div className="text-xs text-muted-foreground">{m.baptized ? "Baptized" : "Not baptized"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{m.memberNo}</td>
                  <td className="px-5 py-3">{m.department}</td>
                  <td className="px-5 py-3">{m.yearOfStudy}</td>
                  <td className="px-5 py-3">{m.fellowship}</td>
                  <td className="px-5 py-3">
                    <div className="text-xs">{m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.phone}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge className={statusStyles[m.status]} variant="outline">{m.status}</Badge>
                  </td>
                  {canManageMembers && (
                    <td className="px-5 py-3 text-right">
                      <MemberActions
                        member={m}
                        disabled={
                          isUpdatingMember ||
                          updatingStatusFor === m.id ||
                          (isDeletingMember && memberPendingDelete?.id === m.id)
                        }
                        onEdit={requestEditMember}
                        onStatusChange={updateMemberStatus}
                        onDelete={requestDeleteMember}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const MemberActions = ({
  member,
  disabled,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  member: MemberView;
  disabled: boolean;
  onEdit: (member: MemberView) => void;
  onStatusChange: (member: MemberView, nextStatus: MemberStatus) => void;
  onDelete: (member: MemberView) => void;
}) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const canManageLeadership = hasRolePermission(role, "leadership.manage");
  const [isRevoking, setIsRevoking] = useState(false);

  const revokeLeadershipRole = async () => {
    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    // Confirm with the user
    // eslint-disable-next-line no-restricted-globals
    const ok = confirm(`Revoke leadership role for ${member.fullName}?`);
    if (!ok) return;

    setIsRevoking(true);
    try {
      const response = await fetch(`${API_BASE_URL}/members/${member.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role: "member" }),
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to revoke role.");
        toast.error(message);
        return;
      }

      toast.success("Leadership role revoked. You can now delete the member.");
    } catch (err) {
      toast.error("Unable to reach the server.");
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={disabled} onClick={() => onEdit(member)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {memberStatuses.map((nextStatus) => (
          <DropdownMenuItem
            key={nextStatus}
            disabled={disabled || member.status === nextStatus}
            onClick={() => onStatusChange(member, nextStatus)}
          >
            Set as {statusLabels[nextStatus]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {canManageLeadership && (
          <DropdownMenuItem
            onClick={() => void revokeLeadershipRole()}
            disabled={disabled || isRevoking}
            className="text-foreground/80"
          >
            <UserCog className="mr-2 h-4 w-4" />
            Revoke leadership role
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => onDelete(member)}
          disabled={disabled}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const Avatar = ({ member }: { member: MemberView }) => {
  const initials = member.fullName.split(" ").map(n => n[0]).slice(0, 2).join("");
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground"
      style={{ background: `linear-gradient(135deg, hsl(${member.avatarHue} 70% 45%), hsl(${(member.avatarHue + 40) % 360} 70% 55%))` }}
    >
      {initials}
    </div>
  );
};

export default Members;
