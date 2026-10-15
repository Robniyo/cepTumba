import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FellowshipEvent, setEventNotes,
  addMaterial as addMaterialApi, removeMaterial as removeMaterialApi, uploadEventMaterial,
} from "@/data/eventsStore";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { hasRolePermission } from "@/lib/roles";
import { Upload, FileText, Trash2, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  eventId: string;
  event?: FellowshipEvent;
  canManage?: boolean;
  onRefresh?: () => void;
}

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export const SermonMaterials = ({ eventId, event, canManage, onRefresh }: Props) => {
  const { role } = useRole();
  const { accessToken } = useAuth();
  const canManageMaterials = canManage ?? hasRolePermission(role, "events.materials.manage");
  const [notes, setLocalNotes] = useState(event?.notes ?? "");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!event) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !accessToken) return;
    let uploadedCount = 0;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10 MB)`);
        continue;
      }
      try {
        const uploaded = await uploadEventMaterial(accessToken, eventId, file);
        await addMaterialApi(accessToken, eventId, {
          name: uploaded.name,
          url: uploaded.url,
          type: uploaded.type,
          size: uploaded.size,
        });
        uploadedCount += 1;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }
    if (uploadedCount > 0) {
      toast.success(`${uploadedCount} file(s) uploaded`);
      onRefresh?.();
    }
  };

  const saveNotes = async () => {
    if (!accessToken) return;
    try {
      await setEventNotes(accessToken, eventId, notes);
      toast.success("Sermon notes saved");
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notes.");
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-elegant">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-semibold">Sermon notes</h3>
            <p className="text-xs text-muted-foreground">{canManageMaterials ? "Markdown-friendly. Members will see this on the event page." : "Read-only notes shared by leadership."}</p>
          </div>
          {canManageMaterials && (
            <Button size="sm" onClick={() => void saveNotes()} className="gradient-primary text-primary-foreground border-0 hover:opacity-90">
              <Save className="h-4 w-4 mr-1.5" /> Save
            </Button>
          )}
        </div>
        <Textarea
          rows={8}
          value={notes}
          onChange={e => setLocalNotes(e.target.value)}
          readOnly={!canManageMaterials}
          placeholder={`Outline:\n1. Introduction\n2. Main scripture\n3. Application\n4. Prayer point`}
          className="font-mono text-sm"
        />
      </Card>

      <Card className="p-5 shadow-elegant">
        <h3 className="font-display font-semibold mb-3">Materials & attachments</h3>

        {canManageMaterials && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-base ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-secondary/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <div className="mt-3 font-medium">Drop files here or click to upload</div>
            <div className="text-xs text-muted-foreground mt-1">PDF, DOC/DOCX, images, audio - up to 10 MB each</div>
          </div>
        )}

        {!canManageMaterials && (
          <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
            Download shared materials below.
          </div>
        )}

        {event.materials.length > 0 && (
          <div className="mt-4 space-y-2">
            {event.materials.map(m => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(m.size)} · {format(new Date(m.uploadedAt), "MMM d, h:mm a")}
                  </div>
                </div>
                <a href={m.url} download={m.name}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Download">
                    <Download className="h-4 w-4" />
                  </Button>
                </a>
                {canManageMaterials && (
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => { if (accessToken) void removeMaterialApi(accessToken, eventId, m.id).then(() => { toast.success("Material removed"); onRefresh?.(); }).catch(() => toast.error("Failed to remove material.")); }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
