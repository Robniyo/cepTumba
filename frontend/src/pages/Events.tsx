import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, CalendarRange, List, Plus, Repeat, MapPin, CalendarClock, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { WeekCalendar } from "@/components/events/WeekCalendar";
import { EventsList } from "@/components/events/EventsList";
import { NewEventDialog } from "@/components/events/NewEventDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { eventsOnDate, exportEvents, FellowshipEvent, getWeekDates, getWeekStart, listEvents } from "@/data/eventsStore";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { hasRolePermission } from "@/lib/roles";
import { downloadBlob } from "@/lib/download";
import { toast } from "sonner";

const Events = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const [events, setEvents] = useState<FellowshipEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const canManageEvents = hasRolePermission(role, "events.manage");
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!isReady || !accessToken) { setIsLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const items = await listEvents(accessToken);
        if (!cancelled) setEvents(items);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load events.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, refreshKey]);

  const weekEnd = addDays(weekStart, 6);
  const label = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const weekOccurrences = getWeekDates(weekStart).reduce((sum, d) => sum + eventsOnDate(events, d).length, 0);
  const recurringEvents = events.filter((e) => e.recurring).length;
  const oneOffEvents = events.filter((e) => !e.recurring).length;
  const uniqueLocations = new Set(events.map((e) => e.location)).size;

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    setIsExporting(true);
    try {
      const { blob, fileName } = await exportEvents(accessToken, format);
      downloadBlob(blob, fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export events.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Events" subtitle="Plan, run and track every fellowship gathering">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExport("csv")}>Export CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExport("xlsx")}>Export Excel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={() => setWeekStart(getWeekStart(new Date()))}>
          Today
        </Button>
        {canManageEvents && (
          <Button
            onClick={() => setOpen(true)}
            className="gradient-primary text-primary-foreground border-0 hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> New event
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Loading events...</Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="This week" value={weekOccurrences} icon={CalendarClock} variant="primary" trend="total occurrences" />
            <StatCard label="Recurring" value={recurringEvents} icon={Repeat} variant="info" trend="weekly templates" />
            <StatCard label="One-off" value={oneOffEvents} icon={CalendarRange} variant="accent" trend="special gatherings" />
            <StatCard label="Locations" value={uniqueLocations} icon={MapPin} variant="success" trend="active venues" />
          </div>

          <Tabs defaultValue="calendar" className="space-y-4">
            <Card className="p-4 shadow-elegant">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold">Weekly Planning Workspace</h2>
                  <p className="text-xs text-muted-foreground">Navigate weeks, compare views, and manage operational activity schedules.</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="font-display text-base font-semibold min-w-[14rem] text-center">{label}</div>
                    <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <TabsList>
                    <TabsTrigger value="calendar"><CalendarRange className="h-4 w-4 mr-2" />Calendar</TabsTrigger>
                    <TabsTrigger value="list"><List className="h-4 w-4 mr-2" />List</TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </Card>

            <TabsContent value="calendar"><WeekCalendar weekStart={weekStart} events={events} /></TabsContent>
            <TabsContent value="list"><EventsList weekStart={weekStart} events={events} /></TabsContent>
          </Tabs>
        </>
      )}

      {canManageEvents && <NewEventDialog open={open} onOpenChange={setOpen} defaultDate={weekStart} onCreated={refresh} />}
    </div>
  );
};

export default Events;
