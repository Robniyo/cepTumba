import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createEvent, EventType, Weekday, formatISODate, WEEKDAY_LABELS } from "@/data/eventsStore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  onCreated?: () => void;
}

export const NewEventDialog = ({ open, onOpenChange, defaultDate, onCreated }: Props) => {
  const { accessToken } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("prayer");
  const [location, setLocation] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [recurring, setRecurring] = useState(false);
  const [weekday, setWeekday] = useState<Weekday>(((defaultDate ?? new Date()).getDay()) as Weekday);
  const today = formatISODate(new Date());
  const [date, setDate] = useState(formatISODate(defaultDate && formatISODate(defaultDate) >= today ? defaultDate : new Date()));

  const reset = () => {
    setTitle(""); setLocation(""); setSpeaker(""); setDescription("");
    setStartTime("18:00"); setEndTime("19:30"); setRecurring(false);
    setType("prayer");
  };

  const submit = async () => {
    if (!accessToken) { toast.error("Please sign in again."); return; }
    if (!title.trim() || !location.trim()) {
      toast.error("Title and location are required");
      return;
    }
    if (endTime <= startTime) {
      toast.error("End time must be after start time");
      return;
    }
    setIsSubmitting(true);
    try {
      // Validate date is a proper ISO yyyy-MM-dd and not an invalid calendar date
      const isISO = /^\d{4}-\d{2}-\d{2}$/.test(date);
      const isValidDate = (d: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
        const [y, m, day] = d.split('-').map((s) => Number(s));
        const dt = new Date(Date.UTC(y, m - 1, day));
        return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
      };
      if (!isISO || !isValidDate(date)) {
        toast.error('Please choose a valid date');
        setIsSubmitting(false);
        return;
      }
      await createEvent(accessToken, {
        title, type, description, location, speaker,
        startTime, endTime,
        recurring,
        weekday: recurring ? weekday : undefined,
        startDate: date,
      });
      toast.success(`"${title}" added`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New event</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Friday All-Night Prayer" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as EventType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prayer">Prayer</SelectItem>
                  <SelectItem value="study">Bible Study</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="outreach">Outreach</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Hall" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Starts</Label>
              <Input id="start" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Ends</Label>
              <Input id="end" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speaker">Speaker / Host (optional)</Label>
            <Input id="speaker" value={speaker} onChange={e => setSpeaker(e.target.value)} placeholder="e.g. Bro. Daniel" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Recurring weekly</div>
              <div className="text-xs text-muted-foreground">Repeats every week on the chosen day.</div>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>

          {recurring ? (
            <div className="space-y-1.5">
              <Label>Day of week</Label>
              <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v) as Weekday)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAY_LABELS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} min={today} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea id="desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this about?" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting} className="gradient-primary text-primary-foreground border-0 hover:opacity-90">
            {isSubmitting ? "Creating..." : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
