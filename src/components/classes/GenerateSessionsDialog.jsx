import React, { useEffect, useState } from 'react';
import { academyApi } from '@/lib/academy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { CalendarPlus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { classDate, dayOfWeekLabel, timeRange } from '@/lib/classFormat';

function addDaysLocal(dateValue, days) {
  if (!dateValue) return '';
  const date = new Date(dateValue + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Create one session per week for a date range. The backend decides what already
// exists and what clashes, then reports exactly what it did.
export default function GenerateSessionsDialog({ open, onOpenChange, group, today, onGenerated }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setFrom(today || '');
    setTo(addDaysLocal(today, 27));
  }, [open, today, group]);

  const generate = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await academyApi.generateClassSessions({
        class_group_id: group.id,
        from,
        to
      });
      setResult(res);
      onGenerated();
    } catch (e) {
      setError(e.message || 'Sessions could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create weekly sessions</DialogTitle>
          <DialogDescription>
            {group
              ? `One session every ${dayOfWeekLabel(group.day_of_week)} at ${timeRange(group.start_time, group.end_time)}.`
              : 'One session per week.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="generate-from">Start date</Label>
            <Input
              id="generate-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="generate-to">End date</Label>
            <Input
              id="generate-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        {result && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-brand" />
              {result.created_count === 0
                ? 'No new sessions were needed'
                : `Created ${result.created_count} session${result.created_count === 1 ? '' : 's'}`}
            </p>
            {result.created?.length > 0 && (
              <ul className="space-y-0.5 text-muted-foreground">
                {result.created.map((date) => (
                  <li key={date}>{classDate(date)}</li>
                ))}
              </ul>
            )}
            {result.skipped_existing?.length > 0 && (
              <p className="text-muted-foreground">
                {result.skipped_existing.length} date
                {result.skipped_existing.length === 1 ? '' : 's'} already had a session — left untouched.
              </p>
            )}
            {result.skipped_coach_busy?.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Skipped: the coach is already teaching then
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {result.skipped_coach_busy.map((item) => (
                    <li key={item.date}>
                      {classDate(item.date)}
                      {item.conflicts?.[0]
                        ? ` · clashes with ${item.conflicts[0].name || 'another class'} ${timeRange(item.conflicts[0].start_time, item.conflicts[0].end_time)}`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={generate} disabled={saving || !from || !to || !group}>
            <CalendarPlus className="h-4 w-4" /> {saving ? 'Creating…' : 'Create sessions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}