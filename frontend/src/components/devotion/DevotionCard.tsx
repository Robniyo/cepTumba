import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Edit, CheckCircle2 } from "lucide-react";
import {
  Devotion, Comment, ReactionKind,
  listComments, addComment, deleteComment as deleteCommentApi,
  toggleReaction as toggleReactionApi, publishDevotion as publishDevotionApi,
  deleteDevotion as deleteDevotionApi,
} from "@/data/devotionStore";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { ROLE_SHORT } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { DevotionComposer } from "./DevotionComposer";
import { toast } from "sonner";

const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "amen", emoji: "🙌", label: "Amen" },
  { kind: "pray", emoji: "🙏", label: "Pray" },
  { kind: "love", emoji: "❤️", label: "Love" },
  { kind: "fire", emoji: "🔥", label: "Fire" },
];

const statusStyles: Record<Devotion["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-accent/15 text-accent-foreground border border-accent/30",
  published: "bg-success/15 text-success border border-success/30",
};

export const DevotionCard = ({ devotion, canManage, onRefresh }: { devotion: Devotion; canManage: boolean; onRefresh?: () => void }) => {
  const { accessToken } = useAuth();
  const { role } = useRole();
  const me = ROLE_SHORT[role];

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [cardComments, setCardComments] = useState<Comment[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void listComments(accessToken, devotion.id).then(c => { if (!cancelled) setCardComments(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [accessToken, devotion.id]);

  const total = (Object.values(devotion.reactions) as string[][]).reduce((a, b) => a + b.length, 0);

  const handlePublish = async () => {
    if (!accessToken) return;
    try { await publishDevotionApi(accessToken, devotion.id); toast.success("Published"); onRefresh?.(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to publish."); }
  };

  const handleDelete = async () => {
    if (!accessToken) return;
    try { await deleteDevotionApi(accessToken, devotion.id); toast.success("Deleted"); onRefresh?.(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to delete."); }
  };

  const handleReaction = async (kind: ReactionKind) => {
    if (!accessToken) return;
    try { await toggleReactionApi(accessToken, devotion.id, kind); onRefresh?.(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to react."); }
  };

  const handleComment = async () => {
    if (!draft.trim() || !accessToken) return;
    try {
      await addComment(accessToken, devotion.id, draft.trim());
      setDraft("");
      const c = await listComments(accessToken, devotion.id);
      setCardComments(c);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to comment."); }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!accessToken) return;
    try {
      await deleteCommentApi(accessToken, devotion.id, commentId);
      setCardComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to delete comment."); }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-bold">{devotion.title}</h3>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", statusStyles[devotion.status])}>
                {devotion.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(devotion.scheduledFor + 'T00:00:00').toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} • by {devotion.author}
            </div>
          </div>
          {canManage && (
            <div className="flex gap-1">
              {devotion.status !== "published" && (
                <Button size="sm" variant="ghost" onClick={() => void handlePublish()}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Publish
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => void handleDelete()}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">{devotion.reference}</div>
          <p className="mt-1 font-display text-base italic leading-relaxed">"{devotion.verse}"</p>
        </div>

        {devotion.reflection && (
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{devotion.reflection}</p>
        )}

        {devotion.prayerPoints.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Prayer points</div>
            <ul className="space-y-1.5 text-sm">
              {devotion.prayerPoints.map((p, i) => (
                <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{p}</span></li>
              ))}
            </ul>
          </div>
        )}

        {devotion.status === "published" && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {REACTIONS.map((r) => {
                const list = devotion.reactions[r.kind] ?? [];
                const mine = list.includes(me);
                return (
                  <button
                    key={r.kind}
                    onClick={() => void handleReaction(r.kind)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-base",
                      mine ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    <span>{r.emoji}</span>
                    <span>{list.length}</span>
                  </button>
                );
              })}
              {total > 0 && <span className="text-xs text-muted-foreground ml-auto">{total} reactions</span>}
            </div>

            <div className="space-y-3 border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Comments ({cardComments.length})
              </div>
              {cardComments.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Be the first to share what God spoke to you.</p>
              )}
              <div className="space-y-2">
                {cardComments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-xs">{c.author}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {(canManage || c.author === me) && (
                          <button onClick={() => void handleDeleteComment(c.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-foreground/90">{c.body}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Comment as ${me}...`}
                  className="text-sm"
                />
                <Button size="icon" onClick={() => void handleComment()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
      {editOpen && <DevotionComposer editingDevotion={devotion} open={editOpen} onOpenChange={setEditOpen} onCreated={onRefresh} />}
    </Card>
  );
};
