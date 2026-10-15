import { useEffect, useState } from "react";
import { Clock, MapPin, BookOpen, Music, Users, Church, Utensils } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchPublicEvents, type PublicEvent } from "@/data/landingData";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "book-open": BookOpen,
  music: Music,
  users: Users,
  church: Church,
  utensils: Utensils,
};

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ScheduleSection = () => {
  const [schedule, setSchedule] = useState<Array<{ day: string; activities: Array<{ name: string; time: string; location: string; icon: string }> }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const events = await fetchPublicEvents(20);
        const scheduleByDay = dayNames.map((day, index) => {
          const dayEvents = events.filter((event) => {
            return event.recurring && event.weekday === index;
          });
          return {
            day,
            activities: dayEvents.map((e: any) => ({
              name: e.title,
              time: e.startTime,
              location: e.location,
              icon: getIconForType(e.type),
            })),
          };
        });
        setSchedule(scheduleByDay);
      } catch (error) {
        console.error("Failed to load schedule:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSchedule();
  }, []);

  const getIconForType = (type: string): string => {
    switch (type) {
      case "prayer": return "book-open";
      case "study": return "book-open";
      case "service": return "users";
      case "social": return "music";
      case "meeting": return "users";
      default: return "church";
    }
  };

  if (loading) {
    return (
      <section id="schedule" className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
              Weekly Schedule
            </h2>
          </div>
          <div className="text-center">Loading schedule...</div>
        </div>
      </section>
    );
  }

  return (
    <section id="schedule" className="py-16 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
            Weekly Schedule
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            Join us throughout the week for spiritual growth and fellowship
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          {schedule.map((day) => (
            <Card key={day.day} className="border-0 bg-gray-50 p-5">
              <div className="mb-4 rounded-lg bg-[#1E3A8A] px-3 py-2 text-center">
                <h3 className="font-display font-bold text-white">{day.day}</h3>
              </div>
              
              <div className="space-y-4">
                {day.activities.length > 0 ? day.activities.map((activity: any, idx: number) => {
                  const IconComponent = iconMap[activity.icon];
                  return (
                    <div key={idx} className="rounded-lg bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        {IconComponent && <IconComponent className="h-4 w-4 text-[#F59E0B]" />}
                        <h4 className="font-semibold text-[#0F172A]">{activity.name}</h4>
                      </div>
                      
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{activity.time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{activity.location}</span>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-gray-500 italic">No scheduled activities</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ScheduleSection;
