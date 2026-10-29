import React, { useCallback, useEffect, useState } from 'react';
import { academyApi } from '@/lib/academy';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import NoticePanel from '@/components/common/NoticePanel';
import { Waves, MapPin, User, CalendarDays, ShieldAlert } from 'lucide-react';
import {
  groupByDay,
  dayHeading,
  relativeDayLabel,
  timeRange,
  classTypeLabel,
  capacityLabel
} from '@/lib/classFormat';

// Read-only timetable for swimmers and parents: what is on, where, for which level
// and with which coach. There is deliberately no booking control in this phase.
export default function MemberClasses() {
  const [days, setDays] = useState(7);
  const [level, setLevel] = useState('');
  const [swimmerId, setSwimmerId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSignedOut(false);
    try {
      const res = await academyApi.listMemberClasses({
        days,
        level: level || undefined,
        swimmer_id: swimmerId || undefined
      });
      setData(res || null);
    } catch (e) {
      setData(null);
      if (e.status === 401) setSignedOut(true);
      else setError(e.message || 'The class schedule could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [days, level, swimmerId]);

  useEffect(() => {
    load();
  }, [load]);

  const swimmers = data?.swimmers || [];
  const classes = data?.classes || [];
  const groups = groupByDay(classes);

  const chooseSwimmer = (value) => {
    const next = value === 'all' ? '' : value;
    setSwimmerId(next);
    const swimmer = swimmers.find((item) => item.id === next);
    // Convenience only: a swimmer's level pre-selects the level filter. Nothing is
    // enforced server-side, and clearing the filter shows every level again.
    setLevel(swimmer?.swimming_level || '');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Waves className="h-4 w-4 text-brand" /> Swimming classes
          </CardTitle>
          <CardDescription>
            What is on this week, and where. Booking is not open yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {swimmers.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Viewing classes for</Label>
                <Select value={swimmerId || 'all'} onValueChange={chooseSwimmer}>
                  <SelectTrigger aria-label="Choose a swimmer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All swimmers</SelectItem>
                    {swimmers.map((swimmer) => (
                      <SelectItem key={swimmer.id} value={swimmer.id}>
                        {swimmer.full_name || 'Swimmer'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Level</Label>
              <Select
                value={level || 'all'}
                onValueChange={(value) => setLevel(value === 'all' ? '' : value)}
              >
                <SelectTrigger aria-label="Filter by level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {(data?.levels || []).map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
                <SelectTrigger aria-label="Choose a period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">This week</SelectItem>
                  <SelectItem value="28">Next 4 weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <NoticePanel loading title="Loading classes…" />
          ) : signedOut ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Please sign in"
              description="Sign in to see the class schedule."
            />
          ) : error ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
              title="Schedule temporarily unavailable"
              description={error}
              actionLabel="Try again"
              onAction={load}
            />
          ) : classes.length === 0 ? (
            <NoticePanel
              icon={<CalendarDays className="h-6 w-6" />}
              title="No classes in this period"
              description={
                level
                  ? 'No classes at this level. Try another level or a longer period.'
                  : 'Nothing is scheduled for these dates yet. Try the next 4 weeks.'
              }
              actionLabel={days === 7 ? 'Show next 4 weeks' : level ? 'Show all levels' : null}
              onAction={
                days === 7 ? () => setDays(28) : level ? () => setLevel('') : null
              }
            />
          ) : (
            <div className="space-y-5">
              {groups.map((group) => {
                const relative = relativeDayLabel(group.date, data?.today);
                return (
                  <section key={group.date} className="space-y-2">
                    <h2 className="text-sm font-semibold">
                      {relative ? `${relative} · ` : ''}{dayHeading(group.date)}
                    </h2>
                    <ul className="divide-y rounded-lg border">
                      {group.classes.map((item, index) => (
                        <li key={`${group.date}-${index}`} className="space-y-1 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{timeRange(item.start_time, item.end_time)}</span>
                            <Badge variant="secondary">{classTypeLabel(item.category, item.level)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span>{item.location_name || 'Venue to be confirmed'}</span>
                            {item.branch_name && <span>· {item.branch_name}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {item.coach_name || 'Coach to be confirmed'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{capacityLabel(item.capacity)}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}