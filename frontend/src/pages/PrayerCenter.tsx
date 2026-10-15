import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaginationFooter } from "@/components/PaginationFooter";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import {
  PrayerRequest, CounselingRequest, Testimony,
  listPrayerRequests, createPrayerRequest, updatePrayerStatus,
  listCounselingRequests, createCounselingRequest, updateCounselingStatus,
  listTestimonies, createTestimony,
} from "@/data/prayerStore";
import { BookHeart, HandHeart, MessageCircleHeart, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const statusStyles = {
  new: "bg-warning/15 text-warning",
  assigned: "bg-info/15 text-info",
  in_progress: "bg-primary/15 text-primary",
  closed: "bg-success/15 text-success",
} as const;

const PrayerCenter = () => {
  const { role } = useRole();
  const { user, accessToken, isReady } = useAuth();
  const currentName = user?.name ?? "Current User";

  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [counselingRequests, setCounselingRequests] = useState<CounselingRequest[]>([]);
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [p, c, t] = await Promise.all([
          listPrayerRequests(accessToken),
          listCounselingRequests(accessToken),
          listTestimonies(accessToken),
        ]);
        if (!cancelled) { setPrayerRequests(p); setCounselingRequests(c); setTestimonies(t); }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load prayer center data.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const canFollowUp = hasRolePermission(role, "prayer.follow_up");
  const visiblePrayerRequests = role === "member"
    ? prayerRequests.filter((r) => !r.isPrivate || r.requester === currentName)
    : prayerRequests;
  const visibleCounselingRequests = role === "member"
    ? counselingRequests.filter((r) => r.requester === currentName)
    : counselingRequests;

  const [prayerDraft, setPrayerDraft] = useState({ title: "", message: "", isPrivate: false });
  const [counselDraft, setCounselDraft] = useState({ summary: "", preferredDate: "" });
  const [testimonyDraft, setTestimonyDraft] = useState("");

  const [prayerQuery, setPrayerQuery] = useState("");
  const [counselQuery, setCounselQuery] = useState("");
  const [testimonyQuery, setTestimonyQuery] = useState("");
  const [prayerPage, setPrayerPage] = useState(1);
  const [counselPage, setCounselPage] = useState(1);
  const [testimonyPage, setTestimonyPage] = useState(1);
  const prayerPageSize = 6;
  const counselPageSize = 6;
  const testimonyPageSize = 6;

  const filteredPrayerRequests = useMemo(() => {
    const ql = prayerQuery.trim().toLowerCase();
    return [...visiblePrayerRequests]
      .filter((r) => {
        if (!ql) return true;
        return (
          r.title.toLowerCase().includes(ql) ||
          r.message.toLowerCase().includes(ql) ||
          r.requester.toLowerCase().includes(ql)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [visiblePrayerRequests, prayerQuery]);

  const filteredCounselingRequests = useMemo(() => {
    const ql = counselQuery.trim().toLowerCase();
    return [...visibleCounselingRequests]
      .filter((r) => {
        if (!ql) return true;
        return (
          r.summary.toLowerCase().includes(ql) ||
          r.requester.toLowerCase().includes(ql) ||
          (r.counselor?.toLowerCase().includes(ql) ?? false)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [visibleCounselingRequests, counselQuery]);

  const filteredTestimonies = useMemo(() => {
    const ql = testimonyQuery.trim().toLowerCase();
    return [...testimonies]
      .filter((t) => {
        if (!ql) return true;
        return t.body.toLowerCase().includes(ql) || t.author.toLowerCase().includes(ql);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [testimonies, testimonyQuery]);

  const prayerTotalPages = Math.max(1, Math.ceil(filteredPrayerRequests.length / prayerPageSize));
  const counselTotalPages = Math.max(1, Math.ceil(filteredCounselingRequests.length / counselPageSize));
  const testimonyTotalPages = Math.max(1, Math.ceil(filteredTestimonies.length / testimonyPageSize));

  useEffect(() => {
    setPrayerPage((current) => Math.min(current, prayerTotalPages));
  }, [prayerTotalPages]);

  useEffect(() => {
    setCounselPage((current) => Math.min(current, counselTotalPages));
  }, [counselTotalPages]);

  useEffect(() => {
    setTestimonyPage((current) => Math.min(current, testimonyTotalPages));
  }, [testimonyTotalPages]);

  const pagedPrayerRequests = useMemo(() => {
    const start = (prayerPage - 1) * prayerPageSize;
    return filteredPrayerRequests.slice(start, start + prayerPageSize);
  }, [filteredPrayerRequests, prayerPage, prayerPageSize]);

  const pagedCounselingRequests = useMemo(() => {
    const start = (counselPage - 1) * counselPageSize;
    return filteredCounselingRequests.slice(start, start + counselPageSize);
  }, [filteredCounselingRequests, counselPage, counselPageSize]);

  const pagedTestimonies = useMemo(() => {
    const start = (testimonyPage - 1) * testimonyPageSize;
    return filteredTestimonies.slice(start, start + testimonyPageSize);
  }, [filteredTestimonies, testimonyPage, testimonyPageSize]);

  return (
    <div className="space-y-6">
      <PageHeader title="Prayer & Counseling Center" subtitle="Prayer cover, confidential guidance, and testimonies in one place" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Prayer requests" value={visiblePrayerRequests.length} icon={BookHeart} variant="primary" trend="active intercession" />
        <StatCard label="Counseling" value={visibleCounselingRequests.length} icon={MessageCircleHeart} variant="accent" trend="care follow-up" />
        <StatCard label="Open follow-up" value={visiblePrayerRequests.filter((r) => r.status !== "closed").length} icon={HandHeart} variant="info" trend="pending closure" />
        <StatCard label="Testimonies" value={testimonies.length} icon={Sparkles} variant="success" trend="faith stories" />
      </div>

      <Tabs defaultValue="prayer" className="space-y-5">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="prayer">Prayer Requests</TabsTrigger>
          <TabsTrigger value="counseling">Counseling</TabsTrigger>
          <TabsTrigger value="testimonies">Testimonies</TabsTrigger>
        </TabsList>

        <TabsContent value="prayer" className="space-y-4">
          <Card className="p-4 shadow-elegant">
            <div className="grid gap-3">
              <Input
                placeholder="Request title"
                value={prayerDraft.title}
                onChange={(e) => setPrayerDraft({ ...prayerDraft, title: e.target.value })}
              />
              <Textarea
                rows={3}
                placeholder="How can we pray for you?"
                value={prayerDraft.message}
                onChange={(e) => setPrayerDraft({ ...prayerDraft, message: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={prayerDraft.isPrivate}
                  onCheckedChange={(v) => setPrayerDraft({ ...prayerDraft, isPrivate: Boolean(v) })}
                />
                Mark as private (leaders only)
              </label>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!prayerDraft.title.trim() || !prayerDraft.message.trim() || !accessToken) return;
                  void createPrayerRequest(accessToken, prayerDraft)
                    .then(() => { toast.success("Prayer request submitted"); setPrayerDraft({ title: "", message: "", isPrivate: false }); refresh(); })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to submit."));
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" /> Submit prayer request
              </Button>
            </div>
          </Card>

          <Card className="p-3 shadow-elegant">
            <Input
              placeholder="Search prayer requests or names"
              value={prayerQuery}
              onChange={(e) => setPrayerQuery(e.target.value)}
            />
          </Card>

          <div className="space-y-3">
            {pagedPrayerRequests.map((r) => (
              <Card key={r.id} className="p-4 shadow-elegant">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{r.title}</h3>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusStyles[r.status])}>
                        {r.status.replace("_", " ")}
                      </span>
                      {r.isPrivate && <span className="text-[11px] text-muted-foreground">Private</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{r.requester} · {new Date(r.createdAt).toLocaleString()}</div>
                    <p className="mt-2 text-sm text-foreground/90">{r.message}</p>
                    {r.assignedTo && <div className="mt-2 text-xs text-muted-foreground">Assigned to: {r.assignedTo}</div>}
                  </div>
                  {canFollowUp && r.status !== "closed" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => { if (accessToken) void updatePrayerStatus(accessToken, r.id, { status: "assigned", assignedTo: "Prayer Team" }).then(() => { toast.success("Assigned"); refresh(); }).catch(() => toast.error("Failed")); }}>Assign</Button>
                      <Button size="sm" variant="outline" onClick={() => { if (accessToken) void updatePrayerStatus(accessToken, r.id, { status: "in_progress", assignedTo: r.assignedTo ?? "Prayer Team" }).then(() => { toast.success("Follow-up started"); refresh(); }).catch(() => toast.error("Failed")); }}>Follow-up</Button>
                      <Button size="sm" onClick={() => { if (accessToken) void updatePrayerStatus(accessToken, r.id, { status: "closed", assignedTo: r.assignedTo ?? "Prayer Team" }).then(() => { toast.success("Closed"); refresh(); }).catch(() => toast.error("Failed")); }}>Close</Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
            {filteredPrayerRequests.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">No prayer requests to display yet.</Card>
            )}
            <PaginationFooter
              page={prayerPage}
              totalPages={prayerTotalPages}
              totalItems={filteredPrayerRequests.length}
              pageSize={prayerPageSize}
              onPageChange={setPrayerPage}
            />
          </div>
        </TabsContent>

        <TabsContent value="counseling" className="space-y-4">
          <Card className="p-4 shadow-elegant">
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea
                className="sm:col-span-2"
                rows={3}
                placeholder="Confidential summary"
                value={counselDraft.summary}
                onChange={(e) => setCounselDraft({ ...counselDraft, summary: e.target.value })}
              />
              <Input
                type="date"
                value={counselDraft.preferredDate}
                onChange={(e) => setCounselDraft({ ...counselDraft, preferredDate: e.target.value })}
              />
              <Button
                onClick={() => {
                  if (!counselDraft.summary.trim() || !accessToken) return;
                  void createCounselingRequest(accessToken, counselDraft)
                    .then(() => { toast.success("Counseling request submitted"); setCounselDraft({ summary: "", preferredDate: "" }); refresh(); })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to submit."));
                }}
              >
                Submit counseling request
              </Button>
            </div>
          </Card>

          <Card className="p-3 shadow-elegant">
            <Input
              placeholder="Search counseling requests or counselors"
              value={counselQuery}
              onChange={(e) => setCounselQuery(e.target.value)}
            />
          </Card>

          <div className="space-y-3">
            {pagedCounselingRequests.map((r) => (
              <Card key={r.id} className="p-4 shadow-elegant">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">Confidential counseling case</h3>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusStyles[r.status])}>
                        {r.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{r.requester} · {new Date(r.createdAt).toLocaleString()}</div>
                    <p className="mt-2 text-sm text-foreground/90">{r.summary}</p>
                    {r.preferredDate && <div className="mt-2 text-xs text-muted-foreground">Preferred date: {r.preferredDate}</div>}
                    {r.counselor && <div className="mt-1 text-xs text-muted-foreground">Counselor: {r.counselor}</div>}
                  </div>
                  {canFollowUp && r.status !== "closed" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => { if (accessToken) void updateCounselingStatus(accessToken, r.id, { status: "assigned", counselor: "Advisor" }).then(() => { toast.success("Assigned"); refresh(); }).catch(() => toast.error("Failed")); }}>Assign</Button>
                      <Button size="sm" variant="outline" onClick={() => { if (accessToken) void updateCounselingStatus(accessToken, r.id, { status: "in_progress", counselor: r.counselor ?? "Advisor" }).then(() => { toast.success("Session started"); refresh(); }).catch(() => toast.error("Failed")); }}>Session</Button>
                      <Button size="sm" onClick={() => { if (accessToken) void updateCounselingStatus(accessToken, r.id, { status: "closed", counselor: r.counselor ?? "Advisor" }).then(() => { toast.success("Closed"); refresh(); }).catch(() => toast.error("Failed")); }}>Close</Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
            {filteredCounselingRequests.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">No counseling requests to display yet.</Card>
            )}
            <PaginationFooter
              page={counselPage}
              totalPages={counselTotalPages}
              totalItems={filteredCounselingRequests.length}
              pageSize={counselPageSize}
              onPageChange={setCounselPage}
            />
          </div>
        </TabsContent>

        <TabsContent value="testimonies" className="space-y-4">
          <Card className="p-4 shadow-elegant">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea
                rows={2}
                placeholder="Share a testimony"
                value={testimonyDraft}
                onChange={(e) => setTestimonyDraft(e.target.value)}
              />
              <Button
                onClick={() => {
                  if (!testimonyDraft.trim() || !accessToken) return;
                  void createTestimony(accessToken, testimonyDraft.trim())
                    .then(() => { toast.success("Testimony posted"); setTestimonyDraft(""); refresh(); })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to post."));
                }}
              >
                Post
              </Button>
            </div>
          </Card>

          <Card className="p-3 shadow-elegant">
            <Input
              placeholder="Search testimonies"
              value={testimonyQuery}
              onChange={(e) => setTestimonyQuery(e.target.value)}
            />
          </Card>

          <div className="space-y-3">
            {pagedTestimonies.map((t) => (
              <Card key={t.id} className="p-4 shadow-elegant">
                <div className="text-xs text-muted-foreground">{t.author} · {new Date(t.createdAt).toLocaleString()}</div>
                <p className="mt-2 text-sm text-foreground/90">{t.body}</p>
              </Card>
            ))}
            {filteredTestimonies.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">No testimonies yet.</Card>
            )}
            <PaginationFooter
              page={testimonyPage}
              totalPages={testimonyTotalPages}
              totalItems={filteredTestimonies.length}
              pageSize={testimonyPageSize}
              onPageChange={setTestimonyPage}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PrayerCenter;
