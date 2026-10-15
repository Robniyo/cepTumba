import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minute, createMinute } from "@/data/minutesStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { ROLE_SHORT, hasRolePermission } from "@/lib/roles";
import { todayLocalISODate } from "@/lib/dateUtils";
import { toast } from "sonner";

const TYPES: Minute["meetingType"][] = ["executive", "general", "advisors", "committee", "agm"];

export const NewMinuteDialog = ({ trigger, onCreated }: { trigger: React.ReactNode; onCreated?: (id: string) => void }) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const canManageMinutes = hasRolePermission(role, "minutes.manage");
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<Minute["meetingType"]>("executive");
  const [date, setDate] = useState(todayLocalISODate());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [location, setLocation] = useState("");
  const [chair, setChair] = useState("President");

  const submit = async () => {
    if (!canManageMinutes || !accessToken) {
      toast.error("You do not have permission to create meeting minutes.");
      return;
    }
    if (!title.trim() || !location.trim()) {
      toast.error("Title and location are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await createMinute(accessToken, {
        title: title.trim(),
        meetingType,
        date,
        startTime,
        endTime,
        location: location.trim(),
        chair,
        secretary: ROLE_SHORT[role],
        status: "draft",
        attendees: [],
        apologies: [],
      });
      toast.success("Minutes created");
      setOpen(false);
      setTitle(""); setLocation("");
      onCreated?.(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create minutes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>New meeting minutes</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Executive committee – May" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Meeting type</Label>
              <Select value={meetingType} onValueChange={(v) => setMeetingType(v as Minute["meetingType"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => (<SelectItem key={t} value={t} className="capitalize">{t === "agm" ? "AGM" : t}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Chair</Label>
              <Input value={chair} onChange={(e) => setChair(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office Block, Room 204" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
