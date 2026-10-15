import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocCategory, createDocument, addDocumentVersion, uploadDocumentFile } from "@/data/minutesStore";
import { useAuth } from "@/context/AuthContext";
import { Upload, X } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { ROLE_SHORT, hasRolePermission } from "@/lib/roles";
import { toast } from "sonner";

const CATS: DocCategory[] = ["constitution", "handover", "policy", "report", "sermon", "form", "other"];

export const NewDocumentDialog = ({ trigger, onCreated }: { trigger: React.ReactNode; onCreated?: () => void }) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const canManageDocuments = hasRolePermission(role, "documents.manage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocCategory>("policy");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [version, setVersion] = useState("v1");
  const [changeNote, setChangeNote] = useState("Initial version.");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setTitle(""); setCategory("policy"); setDescription(""); setTags(""); setVersion("v1"); setChangeNote("Initial version."); setFile(null);
  };

  const submit = async () => {
    if (!canManageDocuments || !accessToken) {
      toast.error("You do not have permission to add documents.");
      return;
    }
    if (!title.trim() || !file) { toast.error("Title and file are required"); return; }
    setIsSubmitting(true);
    try {
      const uploaded = await uploadDocumentFile(accessToken, file);
      await createDocument(accessToken, {
        title: title.trim(),
        category,
        description: description.trim(),
        ownerRole: ROLE_SHORT[role],
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        initialVersion: {
          version: version.trim() || "v1",
          uploadedBy: ROLE_SHORT[role],
          changeNote: changeNote.trim(),
          fileName: uploaded.fileName,
          fileSize: uploaded.fileSize,
          mimeType: uploaded.mimeType,
          url: uploaded.url,
        },
      });
      toast.success("Document added");
      reset();
      setOpen(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add document.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Add document</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CEP Tumba College Constitution" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATS.map((c) => (<SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="governance, official" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this document is for..." />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Initial version</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Change note</Label>
              <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>File</Label>
            {!file ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground hover:bg-muted/50 transition-base"
              >
                <Upload className="h-6 w-6" />
                <span>Click to upload (PDF, DOCX, etc.)</span>
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div className="text-sm truncate">{file.name} <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span></div>
                <Button size="icon" variant="ghost" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            )}
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Adding..." : "Add document"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const NewVersionDialog = ({ docId, trigger, onCreated }: { docId: string; trigger: React.ReactNode; onCreated?: () => void }) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const canManageDocuments = hasRolePermission(role, "documents.manage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [version, setVersion] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const submit = async () => {
    if (!canManageDocuments || !accessToken) {
      toast.error("You do not have permission to upload document versions.");
      return;
    }
    if (!version.trim() || !file || !changeNote.trim()) { toast.error("Version, change note and file required"); return; }
    setIsSubmitting(true);
    try {
      const uploaded = await uploadDocumentFile(accessToken, file);
      await addDocumentVersion(accessToken, docId, {
        version: version.trim(),
        uploadedBy: ROLE_SHORT[role],
        changeNote: changeNote.trim(),
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
        mimeType: uploaded.mimeType,
        url: uploaded.url,
      });
      toast.success(`${version.trim()} uploaded`);
      setVersion(""); setChangeNote(""); setFile(null); setOpen(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload version.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Upload new version</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">Uploading new version for document</div>
          <div className="grid gap-2">
            <Label>New version label</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v2 / v1.2 / 2026-04" />
          </div>
          <div className="grid gap-2">
            <Label>What changed?</Label>
            <Textarea rows={2} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>File</Label>
            {!file ? (
              <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/50">
                Click to choose file
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="truncate">{file.name}</span>
                <Button size="icon" variant="ghost" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            )}
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Uploading..." : "Upload"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
