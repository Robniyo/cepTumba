import { Link } from "react-router-dom";
import { format, isSameDay } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { eventsOnDate, FellowshipEvent, formatISODate, getWeekDates, TYPE_META } from "@/data/eventsStore";

interface Props {
  weekStart: Date;
  events: FellowshipEvent[];
}

export const WeekCalendar = ({ weekStart, events }: Props) => {
  const days = getWeekDates(weekStart);
  const today = new Date();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const dayEvents = eventsOnDate(events, day);
        const isToday = isSameDay(day, today);
        return (
          <Card
            key={day.toISOString()}
            className={cn(
              "p-3 shadow-elegant min-h-[180px] transition-base",
              isToday && "ring-2 ring-primary/40 shadow-glow"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {format(day, "EEE")}
                </div>
                <div className={cn("font-display text-xl font-bold", isToday && "text-primary")}>
                  {format(day, "d")}
                </div>
              </div>
              {isToday && <Badge className="bg-primary text-primary-foreground border-0">Today</Badge>}
            </div>

            <div className="space-y-1.5">
              {dayEvents.length === 0 ? (
                <div className="text-xs text-muted-foreground/70 italic py-1">No events</div>
              ) : (
                dayEvents.map(e => <EventChip key={e.id} event={e} date={day} />)
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

const EventChip = ({ event, date }: { event: FellowshipEvent; date: Date }) => {
  const meta = TYPE_META[event.type];
  return (
    <Link
      to={`/events/${event.id}?date=${formatISODate(date)}`}
      className={cn(
        "block rounded-md px-2 py-1.5 text-xs transition-base hover:translate-x-0.5",
        meta.cls,
      )}
    >
      <div className="flex items-center gap-1.5 font-medium leading-tight">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dot)} />
        <span className="truncate">{event.title}</span>
      </div>
      <div className="mt-0.5 text-[10px] opacity-80">{event.startTime} · {event.location}</div>
    </Link>
  );
};
