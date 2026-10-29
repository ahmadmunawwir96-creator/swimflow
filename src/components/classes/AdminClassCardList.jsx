import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, User } from 'lucide-react';
import ClassStatusBadge from '@/components/classes/ClassStatusBadge';
import { shortDate, timeRange, classTypeLabel, weekdayShort } from '@/lib/classFormat';

// Phone view of the admin schedule: date, time, level, venue, coach and status on
// one tap target — no horizontal scrolling and no hover-only controls.
export default function AdminClassCardList({ classes }) {
  return (
    <ul className="divide-y rounded-lg border">
      {classes.map((item) => (
        <li key={item.id}>
          <Link
            to={`/admin/classes/${item.id}`}
            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {weekdayShort(item.date)} {shortDate(item.date)}
                </span>
                <span className="text-sm text-muted-foreground">{timeRange(item.start_time, item.end_time)}</span>
                <ClassStatusBadge status={item.status} />
              </div>
              <p className="text-sm font-medium text-foreground">
                {item.name || classTypeLabel(item.category, item.level)}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {item.location.name || 'Venue missing'}
                  {item.branch.name ? ` · ${item.branch.name}` : ''}
                </span>
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {item.coach ? item.coach.name || 'Coach unavailable' : 'No coach assigned'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{classTypeLabel(item.category, item.level)}</span>
              </p>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}