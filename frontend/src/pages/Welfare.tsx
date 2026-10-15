import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar, HeartHandshake, HeartPulse, Plus } from "lucide-react";
import {
  WelfareCase, Visit,
  listCases, listVisits,
} from "@/data/welfareStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { CasesList } from "@/components/welfare/CasesList";
import { VisitsList } from "@/components/welfare/VisitsList";
import { NewCaseDialog } from "@/components/welfare/NewCaseDialog";
import { NewVisitDialog } from "@/components/welfare/NewVisitDialog";
import { Card } from "@/components/ui/card";
import { hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const Welfare = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const canManage = hasRolePermission(role, "welfare.manage");

  const [cases, setCases] = useState<WelfareCase[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [c, v] = await Promise.all([
          listCases(accessToken),
          listVisits(accessToken),
        ]);
        if (!cancelled) { setCases(c); setVisits(v); }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load welfare data.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const openCases = cases.filter((c) => c.status === "open" || c.status === "in_progress").length;
  const criticalCases = cases.filter((c) => c.urgency === "critical" && c.status !== "closed" && c.status !== "resolved").length;
  const upcomingVisitsCount = visits.filter((v) => v.status === "planned" && new Date(v.scheduledFor).getTime() >= Date.now() - 86400000).length;
  const resolvedCases = cases.filter((c) => c.status === "resolved" || c.status === "closed").length;
  const completedVisits = visits.filter((v) => v.status === "completed").length;

  return (
    <div className="py-6 sm:py-8">
      <PageHeader title="Welfare" subtitle="Care, visits & celebrations across the fellowship">
        {canManage && (
          <>
            <NewVisitDialog trigger={<Button variant="outline" className="gap-2"><Calendar className="h-4 w-4" />Plan visit</Button>} onCreated={refresh} />
            <NewCaseDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />New case</Button>} onCreated={refresh} />
          </>
        )}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <StatCard label="Open cases" value={openCases} icon={HeartHandshake} variant="primary" trend={`${cases.length} total`} />
        <StatCard label="Critical" value={criticalCases} icon={HeartPulse} variant="accent" trend="needs attention" />
        <StatCard label="Upcoming visits" value={upcomingVisitsCount} icon={Calendar} variant="info" trend="planned" />
      </div>

      <Tabs defaultValue="cases" className="space-y-6">
        <Card className="p-4 shadow-elegant">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Care Coordination Workspace</h2>
              <p className="text-xs text-muted-foreground">Manage case lifecycle, welfare visits, and celebration planning with clear follow-up visibility.</p>
            </div>
            <div className="text-xs text-muted-foreground text-right">
              <div>{resolvedCases} resolved of {cases.length} total cases</div>
              <div>{completedVisits} completed of {visits.length} planned visits</div>
            </div>
          </div>
          <TabsList className="mt-3 grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
            <TabsTrigger value="cases" className="gap-2"><HeartHandshake className="h-4 w-4" />Cases</TabsTrigger>
            <TabsTrigger value="visits" className="gap-2"><Calendar className="h-4 w-4" />Visits</TabsTrigger>
          </TabsList>
        </Card>

        <TabsContent value="cases"><CasesList refreshKey={refreshKey} onRefresh={refresh} /></TabsContent>
        <TabsContent value="visits"><VisitsList refreshKey={refreshKey} onRefresh={refresh} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Welfare;
