import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarPlus, Pencil, Power } from 'lucide-react';
import { timeRange, classTypeLabel, dayOfWeekLabel } from '@/lib/classFormat';

// One row per Class Group: the weekly shape, never a dated session. Cards instead
// of a table so the actions stay reachable on a phone.
export default function ClassGroupList({ groups, busy, onEdit, onGenerate, onToggle }) {
  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{group.name || classTypeLabel(group.category, group.level)}</span>
            <Badge variant="outline">{classTypeLabel(group.category, group.level)}</Badge>
            <Badge variant="secondary">
              {dayOfWeekLabel(group.day_of_week)} · {timeRange(group.start_time, group.end_time)}
            </Badge>
            {!group.is_active && <Badge variant="outline">Inactive</Badge>}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {group.location?.name || 'Venue missing'}
            {group.branch?.name ? ` · ${group.branch.name}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">
            Coach: {group.coach?.name || 'Not assigned'}
            {group.coach && group.coach.has_active_coach_role === false && (
              <span className="text-destructive"> · no longer a Coach</span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
{typeof group.capacity === 'number' ? `Capacity ${group.capacity}` : 'Capacity not set'}
          </p>
          {group.notes && <p className="mt-1 text-xs text-muted-foreground">{group.notes}</p>}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              size="sm"
              onClick={() => onGenerate(group)}
              disabled={busy || !group.is_active}
              className="w-full sm:w-auto"
            >
              <CalendarPlus className="h-4 w-4" /> Create weekly sessions
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(group)}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggle(group)}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              <Power className="h-4 w-4" /> {group.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}