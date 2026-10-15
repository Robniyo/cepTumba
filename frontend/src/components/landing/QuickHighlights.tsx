import { useEffect, useState } from "react";
import { Calendar, BookOpen, Sparkles, Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchPublicEvents, fetchVerseOfTheDay, fetchPublicAnnouncements } from "@/data/landingData";

const QuickHighlights = () => {
  const [highlights, setHighlights] = useState([
    {
      icon: Calendar,
      title: "Next Event",
      content: "Loading...",
      subtitle: "",
      color: "bg-[#1E3A8A]/10 text-[#1E3A8A]",
    },
    {
      icon: BookOpen,
      title: "Today's Verse",
      content: "Loading...",
      subtitle: "",
      color: "bg-[#F59E0B]/10 text-[#F59E0B]",
    },
    {
      icon: Sparkles,
      title: "This Week's Theme",
      content: "Walking in Faith",
      subtitle: "Focus on spiritual growth",
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      icon: Bell,
      title: "Latest Announcement",
      content: "Loading...",
      subtitle: "",
      color: "bg-purple-50 text-purple-700",
    },
  ]);

  useEffect(() => {
    const loadHighlights = async () => {
      try {
        const [events, verse, announcements] = await Promise.all([
          fetchPublicEvents(1),
          fetchVerseOfTheDay().catch(() => null),
          fetchPublicAnnouncements(1),
        ]);

        setHighlights([
          {
            icon: Calendar,
            title: "Next Event",
            content: events[0]?.title || "No upcoming events",
            subtitle: events[0] ? `${events[0].startDate} at ${events[0].startTime}` : "",
            color: "bg-[#1E3A8A]/10 text-[#1E3A8A]",
          },
          {
            icon: BookOpen,
            title: "Today's Verse",
            content: verse?.devotion?.reference || verse?.reference || "No verse today",
            subtitle: verse?.devotion?.verse || verse?.verse ? (verse.devotion?.verse || verse.verse).substring(0, 50) + "..." : "",
            color: "bg-[#F59E0B]/10 text-[#F59E0B]",
          },
          {
            icon: Sparkles,
            title: "This Week's Theme",
            content: "Walking in Faith",
            subtitle: "Focus on spiritual growth",
            color: "bg-emerald-50 text-emerald-700",
          },
          {
            icon: Bell,
            title: "Latest Announcement",
            content: announcements[0]?.title || "No announcements",
            subtitle: announcements[0]?.createdAt?.split('T')[0] || "",
            color: "bg-purple-50 text-purple-700",
          },
        ]);
      } catch (error) {
        console.error("Failed to load highlights:", error);
      }
    };

    loadHighlights();
  }, []);

  return (
    <section className="py-12 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((highlight, index) => {
            const Icon = highlight.icon;
            return (
              <Card
                key={index}
                className="border-0 bg-white p-5 shadow-sm transition-all hover:shadow-md"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${highlight.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-gray-600">{highlight.title}</h3>
                <p className="mt-1 font-display text-lg font-bold text-[#0F172A]">{highlight.content}</p>
                <p className="mt-1 text-sm text-gray-500">{highlight.subtitle}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default QuickHighlights;
