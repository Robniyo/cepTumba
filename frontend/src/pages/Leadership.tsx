import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PaginationFooter } from "@/components/PaginationFooter";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Committee,
  HandoverNote,
  LeadershipTerm,
  TermStatus,
  createCommittee as apiCreateCommittee,
  createHandover as apiCreateHandover,
  createTerm as apiCreateTerm,
  deleteCommittee as apiDeleteCommittee,
  deleteHandover as apiDeleteHandover,
  deleteTerm as apiDeleteTerm,
  listCommittees,
  listHandovers,
  listTerms,
  updateCommittee as apiUpdateCommittee,
  updateTermStatus as apiUpdateTermStatus,
} from "@/data/leadershipStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasRolePermission, Role, ROLE_LABELS } from "@/lib/roles";
import { ClipboardList, ShieldCheck, UserCog, Users, Plus, Pencil, Trash2, UserX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusCls = {
  upcoming: "bg-info/15 text-info",
  active: "bg-success/15 text-success",
  completed: "bg-muted text-muted-foreground",
} as const;

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const leadershipRoleOptions: Role[] = [
  "president",
  "secretary",
  "accountant",
  "vp_prayers",
  "vp_social",
  "advisor_prayers",
  "advisor_social",
];

type MemberStatus = "active" | "inactive" | "graduated" | "suspended";

type ApiMember = {
  id: string;
  memberNo: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
};

type AssignMemberRoleResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
  defaultPassword: string | null;
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

const Leadership = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const canEdit = hasRolePermission(role, "leadership.manage");

  const [terms, setTerms] = useState<LeadershipTerm[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [handovers, setHandovers] = useState<HandoverNote[]>([]);
  const [isLoadingLeadership, setIsLoadingLeadership] = useState(false);

  const [termOpen, setTermOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [committeeOpen, setCommitteeOpen] = useState(false);
  const [committeeEditOpen, setCommitteeEditOpen] = useState(false);
  const [registeredMembers, setRegisteredMembers] = useState<ApiMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [isCreatingCommittee, setIsCreatingCommittee] = useState(false);
  const [isUpdatingCommittee, setIsUpdatingCommittee] = useState(false);
  const [isDeletingCommittee, setIsDeletingCommittee] = useState(false);
  const [termQuery, setTermQuery] = useState("");
  const [committeeQuery, setCommitteeQuery] = useState("");
  const [handoverQuery, setHandoverQuery] = useState("");
  const [termPage, setTermPage] = useState(1);
  const [committeePage, setCommitteePage] = useState(1);
  const [handoverPage, setHandoverPage] = useState(1);
  const termPageSize = 6;
  const committeePageSize = 6;
  const handoverPageSize = 6;

  const [termDraft, setTermDraft] = useState({
    roleKey: undefined as Role | undefined,
    memberId: undefined as string | undefined,
    startDate: "",
    endDate: "",
  });
  const [handoverDraft, setHandoverDraft] = useState({ title: "", fromLeader: "", toLeader: "", summary: "" });
  const [committeeDraft, setCommitteeDraft] = useState({ 
    name: "", 
    lead: "", 
    members: "" as string | string[], 
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` 
  });
  const [committeeEditDraft, setCommitteeEditDraft] = useState({
    id: "",
    name: "",
    lead: "",
    members: [] as string[],
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  });
  const [committeeMemberInput, setCommitteeMemberInput] = useState("");
  const [committeeMemberSearch, setCommitteeMemberSearch] = useState("");
  const [committeePendingDelete, setCommitteePendingDelete] = useState<Committee | null>(null);
  const [termPendingRevoke, setTermPendingRevoke] = useState<LeadershipTerm | null>(null);
  const [isRevokingRole, setIsRevokingRole] = useState(false);

  useEffect(() => {
    if (!isReady || !accessToken) {
      return;
    }
    let cancelled = false;
    const loadLeadership = async () => {
      setIsLoadingLeadership(true);
      try {
        const [t, c, h] = await Promise.all([
          listTerms(accessToken),
          listCommittees(accessToken),
          listHandovers(accessToken),
        ]);
        if (!cancelled) {
          setTerms(t);
          setCommittees(c);
          setHandovers(h);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load leadership data.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLeadership(false);
        }
      }
    };
    void loadLeadership();
    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady]);

  useEffect(() => {
    if (!canEdit || !isReady) {
      return;
    }

    if (!accessToken) {
      setRegisteredMembers([]);
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
          const message = await parseApiError(response, "Failed to load registered members.");
          if (!cancelled) {
            toast.error(message);
          }
          return;
        }

        const data = (await response.json()) as ApiMember[];
        if (!cancelled) {
          setRegisteredMembers(data);
        }
      } catch {
        if (!cancelled) {
          toast.error("Unable to load registered members.");
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
  }, [accessToken, canEdit, isReady]);

  const filteredTerms = useMemo(() => {
    const ql = termQuery.trim().toLowerCase();
    if (!ql) return terms;
    return terms.filter((t) =>
      t.roleTitle.toLowerCase().includes(ql) ||
      t.holderName.toLowerCase().includes(ql) ||
      t.status.toLowerCase().includes(ql),
    );
  }, [terms, termQuery]);

  const termTotalPages = Math.max(1, Math.ceil(filteredTerms.length / termPageSize));

  useEffect(() => {
    setTermPage((current) => Math.min(current, termTotalPages));
  }, [termTotalPages]);

  const pagedTerms = useMemo(() => {
    const start = (termPage - 1) * termPageSize;
    return filteredTerms.slice(start, start + termPageSize);
  }, [filteredTerms, termPage, termPageSize]);

  const filteredCommittees = useMemo(() => {
    const ql = committeeQuery.trim().toLowerCase();
    const sorted = [...committees].sort((a, b) => b.academicYear.localeCompare(a.academicYear) || b.createdAt.localeCompare(a.createdAt));
    if (!ql) return sorted;
    return sorted.filter((c) =>
      c.name.toLowerCase().includes(ql) ||
      c.lead.toLowerCase().includes(ql) ||
      c.academicYear.toLowerCase().includes(ql) ||
      c.members.join(", ").toLowerCase().includes(ql),
    );
  }, [committees, committeeQuery]);

  const committeeTotalPages = Math.max(1, Math.ceil(filteredCommittees.length / committeePageSize));

  useEffect(() => {
    setCommitteePage((current) => Math.min(current, committeeTotalPages));
  }, [committeeTotalPages]);

  const pagedCommittees = useMemo(() => {
    const start = (committeePage - 1) * committeePageSize;
    return filteredCommittees.slice(start, start + committeePageSize);
  }, [filteredCommittees, committeePage, committeePageSize]);

  const memberDirectory = useMemo(
    () => new Map(registeredMembers.map((member) => [member.fullName.toLowerCase(), member])),
    [registeredMembers],
  );

  const formatMemberContact = (member?: ApiMember) => {
    if (!member) return "Contact not found";
    const contactParts = [member.phone?.trim(), member.email?.trim()].filter((part): part is string => Boolean(part));
    return contactParts.length > 0 ? contactParts.join(" · ") : "No contact info";
  };

  const filteredHandovers = useMemo(() => {
    const ql = handoverQuery.trim().toLowerCase();
    if (!ql) return handovers;
    return handovers.filter((h) =>
      h.title.toLowerCase().includes(ql) ||
      h.fromLeader.toLowerCase().includes(ql) ||
      h.toLeader.toLowerCase().includes(ql) ||
      h.summary.toLowerCase().includes(ql),
    );
  }, [handovers, handoverQuery]);

  const handoverTotalPages = Math.max(1, Math.ceil(filteredHandovers.length / handoverPageSize));

  useEffect(() => {
    setHandoverPage((current) => Math.min(current, handoverTotalPages));
  }, [handoverTotalPages]);

  const pagedHandovers = useMemo(() => {
    const start = (handoverPage - 1) * handoverPageSize;
    return filteredHandovers.slice(start, start + handoverPageSize);
  }, [filteredHandovers, handoverPage, handoverPageSize]);

  const resetTermDraft = () => {
    setTermDraft({ roleKey: undefined, memberId: undefined, startDate: "", endDate: "" });
  };

  const resetCommitteeDraft = () => {
    setCommitteeDraft({ name: "", lead: "", members: [], academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` });
    setCommitteeMemberInput("");
    setCommitteeMemberSearch("");
  };

  const resetCommitteeEditDraft = () => {
    setCommitteeEditDraft({
      id: "",
      name: "",
      lead: "",
      members: [],
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    });
  };

  const onOpenTermDialog = (open: boolean) => {
    if (!open) {
      resetTermDraft();
    }
    setTermOpen(open);
  };

  const onOpenCommitteeDialog = (open: boolean) => {
    if (!open) {
      resetCommitteeDraft();
    }
    setCommitteeOpen(open);
  };

  const openCommitteeEditDialog = (committee: Committee) => {
    setCommitteeEditDraft({
      id: committee.id,
      name: committee.name,
      lead: committee.lead,
      members: [...committee.members],
      academicYear: committee.academicYear,
    });
    setCommitteeEditOpen(true);
  };

  const onOpenCommitteeEditDialog = (open: boolean) => {
    if (!open) {
      resetCommitteeEditDraft();
    }
    setCommitteeEditOpen(open);
  };

  const parseCommitteeMembers = (value: string | string[]) => {
    if (Array.isArray(value)) return value;
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const selectedMemberNames = Array.isArray(committeeDraft.members) 
    ? committeeDraft.members 
    : parseCommitteeMembers(committeeDraft.members);

  const getFilteredMembers = () => {
    if (!committeeMemberSearch.trim()) return registeredMembers;
    const query = committeeMemberSearch.toLowerCase();
    return registeredMembers.filter((m) =>
      m.fullName.toLowerCase().includes(query) ||
      m.memberNo.toLowerCase().includes(query)
    );
  };

  const addCommitteeMember = (memberName: string) => {
    if (!selectedMemberNames.includes(memberName)) {
      setCommitteeDraft({
        ...committeeDraft,
        members: [...selectedMemberNames, memberName],
      });
    }
    setCommitteeMemberSearch("");
    setCommitteeMemberInput("");
  };

  const removeCommitteeMember = (memberName: string) => {
    setCommitteeDraft({
      ...committeeDraft,
      members: selectedMemberNames.filter((m) => m !== memberName),
    });
  };

  const createCommittee = async () => {
    const name = committeeDraft.name.trim();
    const lead = committeeDraft.lead.trim();
    const members = selectedMemberNames;

    if (!name || !lead) {
      toast.error("Provide a committee name and lead.");
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsCreatingCommittee(true);
    try {
      const created = await apiCreateCommittee(accessToken, {
        name,
        lead,
        academicYear: committeeDraft.academicYear,
        members,
      });
      setCommittees((prev) => [created, ...prev]);
      resetCommitteeDraft();
      setCommitteeOpen(false);
      toast.success(`Committee created for ${committeeDraft.academicYear}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create committee.");
    } finally {
      setIsCreatingCommittee(false);
    }
  };

  const updateCommittee = async () => {
    if (!committeeEditDraft.id) {
      return;
    }

    if (!committeeEditDraft.name.trim() || !committeeEditDraft.lead.trim()) {
      toast.error("Provide a committee name and lead.");
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsUpdatingCommittee(true);
    try {
      const updated = await apiUpdateCommittee(accessToken, committeeEditDraft.id, {
        name: committeeEditDraft.name.trim(),
        lead: committeeEditDraft.lead.trim(),
        academicYear: committeeEditDraft.academicYear.trim(),
        members: committeeEditDraft.members,
      });
      setCommittees((prev) => prev.map((committee) => (committee.id === updated.id ? updated : committee)));
      setCommitteeEditOpen(false);
      resetCommitteeEditDraft();
      toast.success("Committee updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update committee.");
    } finally {
      setIsUpdatingCommittee(false);
    }
  };

  const deleteCommittee = async () => {
    if (!committeePendingDelete) {
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsDeletingCommittee(true);
    try {
      await apiDeleteCommittee(accessToken, committeePendingDelete.id);
      setCommittees((prev) => prev.filter((c) => c.id !== committeePendingDelete.id));
      setCommitteePendingDelete(null);
      toast.success("Committee removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete committee.");
    } finally {
      setIsDeletingCommittee(false);
    }
  };

  const assignLeadershipRole = async () => {
    if (!termDraft.memberId || !termDraft.roleKey || !termDraft.startDate || !termDraft.endDate) {
      toast.error("Select member, role, and term dates.");
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    const selectedMember = registeredMembers.find((member) => member.id === termDraft.memberId);
    if (!selectedMember) {
      toast.error("Selected member was not found.");
      return;
    }

    setIsAssigningRole(true);
    try {
      const response = await fetch(`${API_BASE_URL}/members/${termDraft.memberId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role: termDraft.roleKey }),
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to update role in database.");
        toast.error(message);
        return;
      }

      const result = (await response.json()) as AssignMemberRoleResponse;

      const newTerm = await apiCreateTerm(accessToken, {
        roleTitle: ROLE_LABELS[termDraft.roleKey],
        holderName: selectedMember.fullName,
        memberId: selectedMember.id,
        startDate: termDraft.startDate,
        endDate: termDraft.endDate,
        status: "upcoming",
      });
      setTerms((prev) => [newTerm, ...prev]);

      if (result.defaultPassword) {
        toast.success("Role assigned and account created.", {
          description: `Default password: ${result.defaultPassword}`,
        });
      } else {
        toast.success("Role updated in database and assigned successfully.");
      }

      resetTermDraft();
      setTermOpen(false);
    } catch {
      toast.error("Unable to reach the server.");
    } finally {
      setIsAssigningRole(false);
    }
  };

  const revokeLeadershipRole = async () => {
    if (!termPendingRevoke?.memberId) {
      toast.error("This leadership record cannot be revoked.");
      return;
    }

    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsRevokingRole(true);
    try {
      const response = await fetch(`${API_BASE_URL}/members/${termPendingRevoke.memberId}/role`, {
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

      const updatedTerm = await apiUpdateTermStatus(accessToken, termPendingRevoke.id, "completed");
      setTerms((prev) => prev.map((term) => (term.id === updatedTerm.id ? updatedTerm : term)));
      toast.success(`Role revoked from ${termPendingRevoke.holderName}.`);
      setTermPendingRevoke(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to revoke role.");
    } finally {
      setIsRevokingRole(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Leadership & Roles" subtitle="Role assignments, committees, and smooth handovers between terms">
        {canEdit && (
          <>
            <Dialog open={committeeOpen} onOpenChange={onOpenCommitteeDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><Users className="h-4 w-4" /> Add committee</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New committee</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Academic year</Label>
                    <Input
                      type="text"
                      placeholder="e.g. 2024-2025"
                      value={committeeDraft.academicYear}
                      onChange={(e) => setCommitteeDraft({ ...committeeDraft, academicYear: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Committee name</Label>
                    <Input
                      placeholder="e.g. Missions Committee"
                      value={committeeDraft.name}
                      onChange={(e) => setCommitteeDraft({ ...committeeDraft, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lead</Label>
                    <Input
                      placeholder="Lead name"
                      value={committeeDraft.lead}
                      onChange={(e) => setCommitteeDraft({ ...committeeDraft, lead: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Members</Label>
                    <div className="relative">
                      <Input
                        placeholder="Search and select members"
                        value={committeeMemberSearch}
                        onChange={(e) => setCommitteeMemberSearch(e.target.value)}
                      />
                      {committeeMemberSearch && getFilteredMembers().length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 border border-input rounded-md bg-background shadow-md z-10 max-h-48 overflow-y-auto">
                          {getFilteredMembers()
                            .filter((m) => !selectedMemberNames.includes(m.fullName))
                            .map((member) => (
                              <button
                                key={member.id}
                                className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                                onClick={() => addCommitteeMember(member.fullName)}
                                type="button"
                              >
                                <div className="font-medium">{member.fullName}</div>
                                <div className="text-xs text-muted-foreground">{member.memberNo}</div>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    
                    {selectedMemberNames.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedMemberNames.map((memberName) => (
                          <Badge key={memberName} variant="secondary" className="gap-1">
                            {memberName}
                            <button
                              className="ml-1 hover:text-destructive"
                              onClick={() => removeCommitteeMember(memberName)}
                              type="button"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Search by member name or ID to add members to the committee.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenCommitteeDialog(false)}>Cancel</Button>
                  <Button onClick={() => void createCommittee()} disabled={isCreatingCommittee}>
                    {isCreatingCommittee ? "Creating..." : "Create committee"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><ClipboardList className="h-4 w-4" /> Add handover</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New handover note</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Title" value={handoverDraft.title} onChange={(e) => setHandoverDraft({ ...handoverDraft, title: e.target.value })} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="From" value={handoverDraft.fromLeader} onChange={(e) => setHandoverDraft({ ...handoverDraft, fromLeader: e.target.value })} />
                    <Input placeholder="To" value={handoverDraft.toLeader} onChange={(e) => setHandoverDraft({ ...handoverDraft, toLeader: e.target.value })} />
                  </div>
                  <Textarea rows={4} placeholder="Summary" value={handoverDraft.summary} onChange={(e) => setHandoverDraft({ ...handoverDraft, summary: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setHandoverOpen(false)}>Cancel</Button>
                  <Button onClick={async () => {
                    if (!handoverDraft.title.trim() || !handoverDraft.summary.trim()) return;
                    if (!accessToken) {
                      toast.error("Session token is missing. Please sign in again.");
                      return;
                    }
                    try {
                      const created = await apiCreateHandover(accessToken, handoverDraft);
                      setHandovers((prev) => [created, ...prev]);
                      setHandoverDraft({ title: "", fromLeader: "", toLeader: "", summary: "" });
                      setHandoverOpen(false);
                      toast.success("Handover saved.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to save handover.");
                    }
                  }}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={termOpen} onOpenChange={onOpenTermDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Assign role</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign leadership role</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Registered member</Label>
                      <Select
                        value={termDraft.memberId}
                        onValueChange={(value) => setTermDraft({ ...termDraft, memberId: value })}
                        disabled={isLoadingMembers || registeredMembers.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingMembers ? "Loading members..." : "Select a member"} />
                        </SelectTrigger>
                        <SelectContent>
                          {registeredMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.fullName} ({member.memberNo}) - {member.status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Role</Label>
                      <Select
                        value={termDraft.roleKey}
                        onValueChange={(value) => setTermDraft({ ...termDraft, roleKey: value as Role })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select leadership role" />
                        </SelectTrigger>
                        <SelectContent>
                          {leadershipRoleOptions.map((roleKey) => (
                            <SelectItem key={roleKey} value={roleKey}>
                              {ROLE_LABELS[roleKey]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {!isLoadingMembers && registeredMembers.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      No registered members available to assign.
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input type="date" value={termDraft.startDate} onChange={(e) => setTermDraft({ ...termDraft, startDate: e.target.value })} />
                    <Input type="date" value={termDraft.endDate} onChange={(e) => setTermDraft({ ...termDraft, endDate: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenTermDialog(false)}>Cancel</Button>
                    <Button
                      onClick={() => void assignLeadershipRole()}
                      disabled={isAssigningRole}
                    >
                      {isAssigningRole ? "Assigning..." : "Assign"}
                    </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active terms" value={terms.filter((t) => t.status === "active").length} icon={ShieldCheck} variant="success" trend="current leadership" />
        <StatCard label="Upcoming terms" value={terms.filter((t) => t.status === "upcoming").length} icon={UserCog} variant="info" trend="transition pipeline" />
        <StatCard label="Committees" value={committees.length} icon={Users} variant="primary" trend="department structure" />
        <StatCard label="Handover notes" value={handovers.length} icon={ClipboardList} variant="accent" trend="continuity records" />
      </div>

      <Tabs defaultValue="terms" className="space-y-5">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="terms">Role Terms</TabsTrigger>
          <TabsTrigger value="committees">Committees</TabsTrigger>
          <TabsTrigger value="handover">Handover</TabsTrigger>
        </TabsList>

        <TabsContent value="terms" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={termQuery}
              onChange={(e) => setTermQuery(e.target.value)}
              placeholder="Search roles or leaders"
              className="sm:max-w-xs"
            />
            <span className="text-xs text-muted-foreground">
              {filteredTerms.length} term{filteredTerms.length === 1 ? "" : "s"}
            </span>
          </div>

          {filteredTerms.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No leadership terms found.</Card>
          )}
          {pagedTerms.map((t) => (
            <Card key={t.id} className="p-4 shadow-elegant">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{t.roleTitle}</h3>
                  <div className="mt-1 text-sm text-muted-foreground">{t.holderName}</div>
                  <div className="text-xs text-muted-foreground">{t.startDate} to {t.endDate}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusCls[t.status])}>{t.status}</span>
                  {canEdit && t.status !== "completed" && (
                    <>
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (!accessToken) {
                          toast.error("Session token is missing. Please sign in again.");
                          return;
                        }
                        try {
                          const updated = await apiUpdateTermStatus(accessToken, t.id, "completed");
                          setTerms((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to close term.");
                        }
                      }}>Close term</Button>
                      {t.memberId && (
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => setTermPendingRevoke(t)}>
                          <UserX className="h-4 w-4" /> Revoke role
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
          <PaginationFooter
            page={termPage}
            totalPages={termTotalPages}
            totalItems={filteredTerms.length}
            pageSize={termPageSize}
            onPageChange={setTermPage}
          />
        </TabsContent>

        <TabsContent value="committees" className="space-y-3">
          <Card className="p-4 shadow-elegant">
            <h2 className="font-display text-lg font-semibold">General Committee Archive</h2>
            <p className="text-xs text-muted-foreground mt-1">Manage committee members and leadership assignments for this academic year.</p>
          </Card>
          
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={committeeQuery}
              onChange={(e) => setCommitteeQuery(e.target.value)}
              placeholder="Search committees or leads"
              className="sm:max-w-xs"
            />
            <span className="text-xs text-muted-foreground">
              {filteredCommittees.length} committee{filteredCommittees.length === 1 ? "" : "s"}
            </span>
          </div>

          {filteredCommittees.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No committees found.</Card>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {pagedCommittees.map((c) => (
              <Card key={c.id} className="p-4 shadow-elegant">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">General Committee {c.academicYear}</h3>
                    <div className="mt-1 text-xs text-muted-foreground">{c.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Lead: {c.lead}</div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openCommitteeEditDialog(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCommitteePendingDelete(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">Members</div>
                <div className="mt-1 space-y-2 text-sm">
                  {c.members.length > 0 ? (
                    c.members.map((memberName) => {
                      const member = memberDirectory.get(memberName.toLowerCase());
                      return (
                        <div key={memberName} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                          <div className="font-medium text-foreground">{memberName}</div>
                          <div className="text-xs text-muted-foreground">{formatMemberContact(member)}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-muted-foreground">No members assigned.</div>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <PaginationFooter
            page={committeePage}
            totalPages={committeeTotalPages}
            totalItems={filteredCommittees.length}
            pageSize={committeePageSize}
            onPageChange={setCommitteePage}
          />
        </TabsContent>

        <TabsContent value="handover" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={handoverQuery}
              onChange={(e) => setHandoverQuery(e.target.value)}
              placeholder="Search handover notes"
              className="sm:max-w-xs"
            />
            <span className="text-xs text-muted-foreground">
              {filteredHandovers.length} note{filteredHandovers.length === 1 ? "" : "s"}
            </span>
          </div>

          {filteredHandovers.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No handover notes found.</Card>
          )}
          {pagedHandovers.map((h) => (
            <Card key={h.id} className="p-4 shadow-elegant">
              <h3 className="font-semibold">{h.title}</h3>
              <div className="mt-1 text-xs text-muted-foreground">{h.fromLeader} → {h.toLeader} · {new Date(h.createdAt).toLocaleDateString()}</div>
              <p className="mt-2 text-sm text-foreground/90">{h.summary}</p>
            </Card>
          ))}
          <PaginationFooter
            page={handoverPage}
            totalPages={handoverTotalPages}
            totalItems={filteredHandovers.length}
            pageSize={handoverPageSize}
            onPageChange={setHandoverPage}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={committeePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCommitteePendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove committee?</AlertDialogTitle>
            <AlertDialogDescription>
              {committeePendingDelete
                ? `Remove ${committeePendingDelete.name} from the committees list?`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCommittee}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteCommittee()}
              disabled={isDeletingCommittee}
            >
              {isDeletingCommittee ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={termPendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTermPendingRevoke(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke leadership role?</AlertDialogTitle>
            <AlertDialogDescription>
              {termPendingRevoke
                ? `This will change ${termPendingRevoke.holderName} back to a regular member and complete the ${termPendingRevoke.roleTitle} term.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevokingRole}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void revokeLeadershipRole()} disabled={isRevokingRole}>
              {isRevokingRole ? "Revoking..." : "Revoke role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={committeeEditOpen} onOpenChange={onOpenCommitteeEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit committee</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Academic year</Label>
              <Input
                type="text"
                placeholder="e.g. 2024-2025"
                value={committeeEditDraft.academicYear}
                onChange={(e) => setCommitteeEditDraft({ ...committeeEditDraft, academicYear: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Committee name</Label>
              <Input
                value={committeeEditDraft.name}
                onChange={(e) => setCommitteeEditDraft({ ...committeeEditDraft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <Input
                value={committeeEditDraft.lead}
                onChange={(e) => setCommitteeEditDraft({ ...committeeEditDraft, lead: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Members</Label>
              <div className="relative">
                <Input
                  placeholder="Search and select members"
                  value={committeeMemberSearch}
                  onChange={(e) => setCommitteeMemberSearch(e.target.value)}
                />
                {committeeMemberSearch && getFilteredMembers().length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 border border-input rounded-md bg-background shadow-md z-10 max-h-48 overflow-y-auto">
                    {getFilteredMembers()
                      .filter((m) => !committeeEditDraft.members.includes(m.fullName))
                      .map((member) => (
                        <button
                          key={member.id}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                          onClick={() => {
                            setCommitteeEditDraft({
                              ...committeeEditDraft,
                              members: [...committeeEditDraft.members, member.fullName],
                            });
                            setCommitteeMemberSearch("");
                          }}
                          type="button"
                        >
                          <div className="font-medium">{member.fullName}</div>
                          <div className="text-xs text-muted-foreground">{member.memberNo}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {committeeEditDraft.members.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {committeeEditDraft.members.map((memberName) => (
                    <Badge key={memberName} variant="secondary" className="gap-1">
                      {memberName}
                      <button
                        className="ml-1 hover:text-destructive"
                        onClick={() => setCommitteeEditDraft({
                          ...committeeEditDraft,
                          members: committeeEditDraft.members.filter((m) => m !== memberName),
                        })}
                        type="button"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenCommitteeEditDialog(false)}>Cancel</Button>
            <Button onClick={() => void updateCommittee()} disabled={isUpdatingCommittee}>
              {isUpdatingCommittee ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leadership;
