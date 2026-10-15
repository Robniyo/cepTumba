import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ManualAttendance } from "@/components/events/ManualAttendance";
import { SermonMaterials } from "@/components/events/SermonMaterials";
import {
  FellowshipEvent, AttendanceRecord, TYPE_META, WEEKDAY_LABELS, formatISODate,
  listEvents, listAttendance, deleteEvent as deleteEventApi,
} from "@/data/eventsStore";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { hasRolePermission } from "@/lib/roles";
import { ArrowLeft, Calendar, Clock, MapPin, Mic, Repeat, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const EventDetail = () => {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { role } = useRole();
  const { user, accessToken, isReady } = useAuth();
  const isMember = role === "member";
  const canManageEvent = hasRolePermission(role, "events.manage");
  const canManageAttendance = hasRolePermission(role, "events.attendance.manage");
  const canManageMaterials = hasRolePermission(role, "events.materials.manage");

  const dateParam = search.get("date") ?? formatISODate(new Date());
  const [date, setDate] = useState(dateParam);
  const [event, setEvent] = useState<FellowshipEvent | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!isReady || !accessToken || !id) { setIsLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [events, att] = await Promise.all([
          listEvents(accessToken),
          listAttendance(accessToken, id),
        ]);
        if (!cancelled) {
          setEvent(events.find((e) => e.id === id) ?? null);
          setAttendance(att);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load event.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isReady, id, date, refreshKey]);

  const handleDelete = async () => {
    if (!accessToken || !event) return;
    setIsDeleting(true);
    try {
      await deleteEventApi(accessToken, event.id);
      toast.success("Event deleted");
      navigate("/events");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete event.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Loading event...</Card>;
  }

  if (!event) {
    return (
      <div className="space-y-6">
        <PageHeader title="Event not found" subtitle="It may have been deleted" />
        <Link to="/events">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to events</Button>
        </Link>
      </div>
    );
  }

  const meta = TYPE_META[event.type];
  const presentCount = attendance.filter(a => a.status !== "absent").length;

  return (
    <div className="space-y-6">
      <Link to="/events" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-base">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to events
      </Link>

      {/* Hero */}
      <Card className="overflow-hidden border-0 shadow-elevated">
        <div className="gradient-hero p-6 sm:p-8 text-primary-foreground relative">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${meta.cls} border-0`}>{meta.label}</Badge>
              {event.recurring && (
                <Badge variant="outline" className="border-primary-foreground/30 text-primary-foreground">
                  <Repeat className="h-3 w-3 mr-1" /> Every {WEEKDAY_LABELS[event.weekday!]}
                </Badge>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold">{event.title}</h1>
            {event.description && (
              <p className="mt-2 text-sm sm:text-base text-primary-foreground/85 max-w-2xl">{event.description}</p>
            )}

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-primary-foreground/90">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{format(parseISO(date), "EEEE, MMM d, yyyy")}</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{event.startTime} – {event.endTime}</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.location}</span>
              {event.speaker && <span className="flex items-center gap-1.5"><Mic className="h-4 w-4" />{event.speaker}</span>}
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{presentCount} checked in</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Date picker for recurring events */}
      {event.recurring && (
        <Card className="p-4 flex items-center justify-between gap-3 shadow-elegant">
          <div>
            <div className="text-sm font-semibold">Showing occurrence</div>
            <div className="text-xs text-muted-foreground">Pick a date to view that week's attendance & notes.</div>
          </div>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Card>
      )}

      <Tabs defaultValue={isMember || !canManageAttendance ? "attendance" : "manual"}>
        <TabsList className="w-full sm:w-auto">
          {isMember || !canManageAttendance ? (
            <TabsTrigger value="attendance">{isMember ? "My attendance" : "Attendance"}</TabsTrigger>
          ) : (
            <>
              <TabsTrigger value="manual">Manual check-in</TabsTrigger>
            </>
          )}
          <TabsTrigger value="materials">Notes & materials</TabsTrigger>
        </TabsList>

        {isMember ? (
          <TabsContent value="attendance" className="mt-4">
            <ManualAttendance eventId={event.id} date={date} selfOnly selfMemberId={user?.id} attendance={attendance} onRefresh={refresh} />
          </TabsContent>
        ) : !canManageAttendance ? (
          <TabsContent value="attendance" className="mt-4">
            <ManualAttendance eventId={event.id} date={date} readOnly attendance={attendance} onRefresh={refresh} />
          </TabsContent>
        ) : (
          <>
            <TabsContent value="manual" className="mt-4">
              <ManualAttendance eventId={event.id} date={date} attendance={attendance} onRefresh={refresh} />
            </TabsContent>

            
          </>
        )}

        <TabsContent value="materials" className="mt-4">
          <SermonMaterials eventId={event.id} event={event} canManage={canManageMaterials} onRefresh={refresh} />
        </TabsContent>
      </Tabs>

      {canManageEvent && (
        <Card className="p-5 shadow-elegant border-destructive/30">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">Danger zone</div>
              <div className="text-xs text-muted-foreground">Deleting removes this event and all its attendance history.</div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete event
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{event.title}"?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isDeleting}
                    onClick={(e) => { e.preventDefault(); void handleDelete(); }}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>
      )}
    </div>
  );
};

export default EventDetail;
