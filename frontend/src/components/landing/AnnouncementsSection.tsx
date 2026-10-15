import { useEffect, useState } from "react";
import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPublicAnnouncements } from "@/data/landingData";

const formatDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.split("T")[0];
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

const AnnouncementsSection = () => {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const data = await fetchPublicAnnouncements(50);
        setAnnouncements(data);
      } catch (error) {
        console.error("Failed to load announcements:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAnnouncements();
  }, []);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "general": return "bg-gray-100 text-gray-700";
      case "spiritual": return "bg-[#1E3A8A]/10 text-[#1E3A8A]";
      case "social": return "bg-[#F59E0B]/10 text-[#F59E0B]";
      case "urgent": return "bg-red-50 text-red-700";
      case "finance": return "bg-emerald-50 text-emerald-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return (
      <section id="announcements" className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <Skeleton className="mx-auto h-9 w-72" />
            <Skeleton className="mx-auto mt-3 h-5 w-96" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="flex flex-col border-0 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-3/4" />
                <div className="mt-3 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <Skeleton className="mt-4 h-4 w-24" />
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="announcements" className="py-16 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
            Latest Announcements
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            Stay updated with important news and updates
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {announcements.slice(0, 6).map((announcement) => {
            const body = announcement.body ?? "";
            const isLong = body.length > 120;
            return (
              <Card key={announcement.id} className="flex flex-col border-0 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <Badge className={getCategoryColor(announcement.category)}>
                    {announcement.category}
                  </Badge>
                  <span className="text-sm text-gray-500">{formatDate(announcement.createdAt)}</span>
                </div>

                <h3 className="font-display text-lg font-bold text-[#0F172A]">
                  {announcement.title}
                </h3>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-600">
                  {isLong ? `${body.substring(0, 120)}…` : body}
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 w-fit p-0 text-[#1E3A8A] hover:bg-transparent"
                  onClick={() => setSelected(announcement)}
                >
                  Read More
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>

        {announcements.length > 6 && (
          <div className="mt-10 text-center">
            <Button
              size="lg"
              variant="outline"
              className="border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#1E3A8A]/10"
              onClick={() => setAllOpen(true)}
            >
              View All Announcements ({announcements.length})
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Single announcement detail */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <Badge className={`mb-2 w-fit ${getCategoryColor(selected.category)}`}>
                  {selected.category}
                </Badge>
                <DialogTitle className="font-display text-2xl text-[#0F172A]">
                  {selected.title}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-2">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                  {selected.body}
                </p>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* All announcements dialog */}
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-[#0F172A]">All Announcements</DialogTitle>
            <DialogDescription>Browse the full list of recent announcements.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {announcements.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setAllOpen(false);
                    setSelected(a);
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-[#1E3A8A]/40 hover:bg-[#1E3A8A]/5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getCategoryColor(a.category)}>{a.category}</Badge>
                    <span className="text-xs text-gray-500">{formatDate(a.createdAt)}</span>
                  </div>
                  <h4 className="mt-2 font-display text-base font-bold text-[#0F172A]">{a.title}</h4>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">{a.body}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default AnnouncementsSection;
