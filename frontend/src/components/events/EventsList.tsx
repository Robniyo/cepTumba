import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Mic, Repeat } from "lucide-react";
import { eventsOnDate, FellowshipEvent, formatISODate, TYPE_META, WEEKDAY_LABELS } from "@/data/eventsStore";
import { format } from "date-fns";

interface Props {
  weekStart: Date;
  events: FellowshipEvent[];
}

export const EventsList = ({ weekStart, events }: Props) => {

  // Build flat list of upcoming occurrences across the visible week
  const items: { event: FellowshipEvent; date: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    eventsOnDate(events, d).forEach(ev => items.push({ event: ev, date: d }));
  }

  if (items.length === 0) {
    return (
      <Card className="p-10 text-center shadow-elegant">
        <Calendar className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">No events scheduled this week.</p>
      </Card>
    );
  }

  return (
    <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
      {items.map(({ event, date }) => {
        const meta = TYPE_META[event.type];
        return (
          <Link
            key={`${event.id}_${date.toISOString()}`}
            to={`/events/${event.id}?date=${formatISODate(date)}`}
            className="block"
          >
            <Card className="p-4 shadow-elegant transition-base hover:shadow-elevated hover:-translate-y-0.5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="text-[10px] font-medium uppercase">{format(date, "MMM")}</span>
                  <span className="text-lg font-bold leading-none">{format(date, "d")}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{event.title}</h3>
                    <Badge variant="outline" className={`${meta.cls} border-0`}>{meta.label}</Badge>
                    {event.recurring && (
                      <Badge variant="outline" className="text-[10px]">
                        <Repeat className="h-2.5 w-2.5 mr-1" />
                        Every {WEEKDAY_LABELS[event.weekday!]}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{event.startTime} – {event.endTime}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>
                    {event.speaker && <span className="flex items-center gap-1"><Mic className="h-3 w-3" />{event.speaker}</span>}
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
};
