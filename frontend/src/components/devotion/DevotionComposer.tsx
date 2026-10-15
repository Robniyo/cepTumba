import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { Devotion, createDevotion, updateDevotion as updateDevotionApi, todayISODate } from "@/data/devotionStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { ROLE_SHORT } from "@/lib/roles";
import { toast } from "sonner";

interface Props {
  trigger?: React.ReactNode;
  editingDevotion?: Devotion;
  onClose?: () => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onCreated?: () => void;
}

export const DevotionComposer = ({ trigger, editingDevotion, open: controlledOpen, onOpenChange, onCreated }: Props) => {
  const { accessToken } = useAuth();
  const { role } = useRole();

  const [open, setOpen] = useState(false);
  const isOpen = controlledOpen ?? open;
  const setOpenState = onOpenChange ?? setOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [title, setTitle] = useState(editingDevotion?.title ?? "");
  const [reference, setReference] = useState(editingDevotion?.reference ?? "");
  const [verse, setVerse] = useState(editingDevotion?.verse ?? "");
  const [reflection, setReflection] = useState(editingDevotion?.reflection ?? "");
  const [points, setPoints] = useState<string[]>(editingDevotion?.prayerPoints ?? [""]);
  const [scheduledFor, setScheduledFor] = useState(editingDevotion?.scheduledFor ?? todayISODate());
  const [status, setStatus] = useState<"draft" | "scheduled" | "published">(editingDevotion?.status ?? "scheduled");

  const reset = () => {
    setTitle(""); setReference(""); setVerse(""); setReflection("");
    setPoints([""]); setScheduledFor(todayISODate()); setStatus("scheduled");
  };

  const submit = async () => {
    if (!accessToken) return;
    if (!title.trim() || !reference.trim() || !verse.trim()) {
      toast.error("Title, reference and verse are required");
      return;
    }
    const cleaned = points.map((p) => p.trim()).filter(Boolean);
    const payload = { title, reference, verse, reflection, prayerPoints: cleaned, scheduledFor, status };
    setIsSubmitting(true);
    try {
      if (editingDevotion) {
        await updateDevotionApi(accessToken, editingDevotion.id, payload);
        toast.success("Devotion updated");
      } else {
        await createDevotion(accessToken, payload);
        toast.success(status === "published" ? "Devotion published" : "Devotion scheduled");
        reset();
      }
      setOpenState(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save devotion.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpenState}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingDevotion ? "Edit devotion" : "Compose devotion"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="d-title">Title</Label>
            <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Strength in Christ" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="d-ref">Scripture reference</Label>
              <Input id="d-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Philippians 4:13" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-date">Schedule for</Label>
              <Input id="d-date" type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="d-verse">Verse text</Label>
            <Textarea id="d-verse" rows={3} value={verse} onChange={(e) => setVerse(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="d-reflection">Reflection</Label>
            <Textarea id="d-reflection" rows={5} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="Share what God is saying through this passage..." />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Prayer points</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPoints([...points, ""])}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {points.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={p}
                    onChange={(e) => setPoints(points.map((x, idx) => (idx === i ? e.target.value : x)))}
                    placeholder={`Prayer point ${i + 1}`}
                  />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setPoints(points.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-2">
              {(["draft", "scheduled", "published"] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={status === s ? "default" : "outline"}
                  onClick={() => setStatus(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenState(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Saving..." : editingDevotion ? "Save changes" : "Save devotion"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
