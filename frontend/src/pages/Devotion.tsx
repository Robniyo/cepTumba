import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Calendar, MessageCircle, Plus, Search, Sparkles, Clock3 } from "lucide-react";
import { Devotion as DevotionType, Comment, listDevotions, listComments, todayISODate } from "@/data/devotionStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { DevotionComposer } from "@/components/devotion/DevotionComposer";
import { DevotionCard } from "@/components/devotion/DevotionCard";
import { StatCard } from "@/components/StatCard";
import { PaginationFooter } from "@/components/PaginationFooter";
import { hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const Devotion = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const canManage = hasRolePermission(role, "devotion.manage");
  const canReview = hasRolePermission(role, "devotion.review");

  const today = todayISODate();
  const [query, setQuery] = useState("");
  const [todayPage, setTodayPage] = useState(1);
  const [schedulePage, setSchedulePage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);
  const todayPageSize = 4;
  const schedulePageSize = 4;
  const archivePageSize = 6;
  const [devotions, setDevotions] = useState<DevotionType[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const devs = await listDevotions(accessToken);
        if (!cancelled) setDevotions(devs);
        // load comments for all devotions
        const allComments: Comment[] = [];
        for (const d of devs) {
          try {
            const c = await listComments(accessToken, d.id);
            allComments.push(...c);
          } catch { /* ignore */ }
        }
        if (!cancelled) setComments(allComments);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load devotions.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const todayDevotions = useMemo(
    () => devotions.filter((d) => d.scheduledFor === today && d.status === "published"),
    [devotions, today]
  );

  const upcoming = useMemo(
    () => devotions.filter((d) => d.scheduledFor > today || d.status === "scheduled" || d.status === "draft")
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    [devotions, today]
  );

  const scheduleItems = useMemo(
    () => upcoming.filter((d) => canManage || canReview || d.status !== "draft"),
    [upcoming, canManage, canReview],
  );

  const archive = useMemo(() => {
    const q = query.toLowerCase();
    return devotions
      .filter((d) => {
        if (d.status !== "published") return false;
        // Parse dates without timezone issues
        const scheduledDate = new Date(d.scheduledFor + 'T00:00:00');
        const todayDate = new Date(today + 'T00:00:00');
        // Compare dates by setting time to midnight
        scheduledDate.setHours(0, 0, 0, 0);
        todayDate.setHours(0, 0, 0, 0);
        return scheduledDate < todayDate;
      })
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.reference.toLowerCase().includes(q) || d.verse.toLowerCase().includes(q))
      .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  }, [devotions, today, query]);

  const totalReactions = useMemo(
    () => devotions.reduce((sum, d) => sum + Object.values(d.reactions).reduce((a, list) => a + list.length, 0), 0),
    [devotions],
  );

  const scheduledCount = devotions.filter((d) => d.status === "scheduled" && d.scheduledFor >= today).length;
  const publishedCount = devotions.filter((d) => d.status === "published").length;

  const todayTotalPages = Math.max(1, Math.ceil(todayDevotions.length / todayPageSize));
  const scheduleTotalPages = Math.max(1, Math.ceil(scheduleItems.length / schedulePageSize));
  const archiveTotalPages = Math.max(1, Math.ceil(archive.length / archivePageSize));

  useEffect(() => {
    setTodayPage((current) => Math.min(current, todayTotalPages));
  }, [todayTotalPages]);

  useEffect(() => {
    setSchedulePage((current) => Math.min(current, scheduleTotalPages));
  }, [scheduleTotalPages]);

  useEffect(() => {
    setArchivePage((current) => Math.min(current, archiveTotalPages));
  }, [archiveTotalPages]);

  const pagedToday = useMemo(() => {
    const start = (todayPage - 1) * todayPageSize;
    return todayDevotions.slice(start, start + todayPageSize);
  }, [todayDevotions, todayPage, todayPageSize]);

  const pagedSchedule = useMemo(() => {
    const start = (schedulePage - 1) * schedulePageSize;
    return scheduleItems.slice(start, start + schedulePageSize);
  }, [scheduleItems, schedulePage, schedulePageSize]);

  const pagedArchive = useMemo(() => {
    const start = (archivePage - 1) * archivePageSize;
    return archive.slice(start, start + archivePageSize);
  }, [archive, archivePage, archivePageSize]);

  return (
    <div className="py-6 sm:py-8">
      <PageHeader title="Daily Devotion" subtitle="Verse, reflection & prayer points for the fellowship">
        {canManage && (
          <DevotionComposer
            trigger={
              <Button className="gap-2"><Plus className="h-4 w-4" /> New devotion</Button>
            }
            onCreated={refresh}
          />
        )}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Published today" value={todayDevotions.length} icon={Sparkles} variant="primary" trend="today's feed" />
        <StatCard label="Scheduled" value={scheduledCount} icon={Clock3} variant="info" trend="upcoming queue" />
        <StatCard label="Archive" value={publishedCount} icon={BookOpen} variant="success" trend="published entries" />
        <StatCard label="Engagement" value={totalReactions + comments.length} icon={MessageCircle} variant="accent" trend={`${comments.length} comments`} />
      </div>

      <Tabs defaultValue="today" className="space-y-6">
        <Card className="p-3 shadow-elegant">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Devotion Workspace</h2>
              <p className="text-xs text-muted-foreground">Review today's publication, upcoming schedule, and historical devotion archive.</p>
            </div>
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
              <TabsTrigger value="today" className="gap-2"><Sparkles className="h-4 w-4" />Today</TabsTrigger>
              <TabsTrigger value="schedule" className="gap-2"><Calendar className="h-4 w-4" />Schedule</TabsTrigger>
              <TabsTrigger value="archive" className="gap-2"><BookOpen className="h-4 w-4" />Archive</TabsTrigger>
            </TabsList>
          </div>
        </Card>

        <TabsContent value="today" className="space-y-4">
          {todayDevotions.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <h3 className="font-display text-lg font-semibold">No devotion published yet today</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {canManage ? "Compose one to feed the flock." : "Check back later — your leaders are preparing today's word."}
                </p>
              </CardContent>
            </Card>
          ) : (
            pagedToday.map((d) => <DevotionCard key={d.id} devotion={d} canManage={canManage} onRefresh={refresh} />)
          )}
          <PaginationFooter
            page={todayPage}
            totalPages={todayTotalPages}
            totalItems={todayDevotions.length}
            pageSize={todayPageSize}
            onPageChange={setTodayPage}
          />
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          {!canManage && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">You can view scheduled public devotions. Drafts are visible to leadership only.</CardContent></Card>
          )}
          {scheduleItems.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No scheduled devotions.</CardContent></Card>
          ) : (
            pagedSchedule.map((d) => <DevotionCard key={d.id} devotion={d} canManage={canManage} onRefresh={refresh} />)
          )}
          <PaginationFooter
            page={schedulePage}
            totalPages={scheduleTotalPages}
            totalItems={scheduleItems.length}
            pageSize={schedulePageSize}
            onPageChange={setSchedulePage}
          />
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          <div className="text-xs text-muted-foreground">{archive.length} devotion{archive.length === 1 ? "" : "s"} in archive results</div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search past devotions by title, reference or verse..." className="pl-9" />
          </div>
          {archive.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No past devotions match.</CardContent></Card>
          ) : (
            pagedArchive.map((d) => <DevotionCard key={d.id} devotion={d} canManage={canManage} onRefresh={refresh} />)
          )}
          <PaginationFooter
            page={archivePage}
            totalPages={archiveTotalPages}
            totalItems={archive.length}
            pageSize={archivePageSize}
            onPageChange={setArchivePage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Devotion;
