import { useEffect, useState } from "react";
import { Calendar, MapPin, ArrowRight, Clock } from "lucide-react";
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
import { fetchPublicEvents } from "@/data/landingData";

const formatEventDate = (value?: string) => {
  if (!value) return "Date TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatEventTime = (value?: string) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const EventsSection = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const data = await fetchPublicEvents(50);
        setEvents(data);
      } catch (error) {
        console.error("Failed to load events:", error);
        setError("Failed to load events");
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  const getCategoryColor = (type: string) => {
    switch (type) {
      case "prayer": return "bg-[#1E3A8A]/10 text-[#1E3A8A]";
      case "study": return "bg-[#F59E0B]/10 text-[#F59E0B]";
      case "service": return "bg-emerald-50 text-emerald-700";
      case "social": return "bg-purple-50 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return (
      <section id="events" className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <Skeleton className="mx-auto h-9 w-64" />
            <Skeleton className="mx-auto mt-3 h-5 w-80" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-0 bg-white p-6 shadow-sm">
                <Skeleton className="mb-4 h-5 w-16" />
                <Skeleton className="h-6 w-3/4" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
                <Skeleton className="mt-4 h-4 w-24" />
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section id="events" className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
              Upcoming Events
            </h2>
          </div>
          <div className="text-center text-red-600">{error}</div>
        </div>
      </section>
    );
  }

  return (
    <section id="events" className="py-16 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
            Upcoming Events
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            Join us for meaningful gatherings and activities
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {events.slice(0, 4).map((event) => (
            <Card key={event.id} className="border-0 bg-white p-6 shadow-sm transition-all hover:shadow-md">
              <Badge className={`mb-4 w-fit ${getCategoryColor(event.type)}`}>
                {event.type}
              </Badge>
              
              <h3 className="font-display text-lg font-bold text-[#0F172A]">
                {event.title}
              </h3>
              
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{formatEventDate(event.startDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{event.location}</span>
                </div>
              </div>
              
              {event.description && (
                <p className="mt-4 text-sm leading-relaxed text-gray-600">
                  {event.description}
                </p>
              )}
              
        <Button
                variant="ghost"
                size="sm"
                className="mt-4 p-0 text-[#1E3A8A] hover:bg-transparent"
                onClick={() => setSelectedEvent(event)}
              >
                Learn More
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>

        {events.length > 4 && (
          <div className="mt-10 text-center">
            <Button
              size="lg"
              variant="outline"
              className="border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#1E3A8A]/10"
              onClick={() => setAllOpen(true)}
            >
              View All Events ({events.length})
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Single event detail dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedEvent && (
            <>
              <DialogHeader>
                <Badge className={`mb-2 w-fit ${getCategoryColor(selectedEvent.type)}`}>
                  {selectedEvent.type}
                </Badge>
                <DialogTitle className="font-display text-2xl text-[#0F172A]">
                  {selectedEvent.title}
                </DialogTitle>
                <DialogDescription className="sr-only">Event details</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#1E3A8A]" />
                  <span>{formatEventDate(selectedEvent.startDate)}</span>
                </div>
                {formatEventTime(selectedEvent.startDate) && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[#1E3A8A]" />
                    <span>{formatEventTime(selectedEvent.startDate)}</span>
                  </div>
                )}
                {selectedEvent.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#1E3A8A]" />
                    <span>{selectedEvent.location}</span>
                  </div>
                )}
                {selectedEvent.description && (
                  <p className="pt-2 leading-relaxed text-gray-600 whitespace-pre-wrap">
                    {selectedEvent.description}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* All events list dialog */}
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-[#0F172A]">All Upcoming Events</DialogTitle>
            <DialogDescription>Browse the full list of upcoming gatherings.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {events.map((event) => (
                <button
                  key={event.id}
                  onClick={() => {
                    setAllOpen(false);
                    setSelectedEvent(event);
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-[#1E3A8A]/40 hover:bg-[#1E3A8A]/5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getCategoryColor(event.type)}>{event.type}</Badge>
                    <span className="text-xs text-gray-500">{formatEventDate(event.startDate)}</span>
                  </div>
                  <h4 className="mt-2 font-display text-base font-bold text-[#0F172A]">{event.title}</h4>
                  {event.location && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{event.location}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default EventsSection;
