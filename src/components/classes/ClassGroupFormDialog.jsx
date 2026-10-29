import React, { useEffect, useState } from 'react';
import { academyApi } from '@/lib/academy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { Save } from 'lucide-react';
import { DAY_OF_WEEK_LABELS } from '@/lib/classFormat';

const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
];

const EMPTY = {
  location_id: '',
  coach_id: '',
  skill_level: 'beginner',
  day_of_week: 6,
  start_time: '',
  end_time: '',
  max_capacity: 6,
  name: '',
  notes: ''
};

// Add or edit one Class Group. Deliberately a single dialog, not a wizard: venue,
// coach, level, weekday, times, capacity, optional label and notes.
export default function ClassGroupFormDialog({ open, onOpenChange, initial, options, onSaved }) {
  const [values, setValues] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setValues(
      initial
        ? {
            location_id: initial.location?.id || '',
            coach_id: initial.coach?.id || '',
            skill_level: initial.level || 'beginner',
            day_of_week: typeof initial.day_of_week === 'number' ? initial.day_of_week : 6,
            start_time: initial.start_time || '',
            end_time: initial.end_time || '',
            max_capacity: initial.capacity ?? 6,
            name: initial.name || '',
            notes: initial.notes || ''
          }
        : EMPTY
    );
  }, [open, initial]);

  const set = (patch) => setValues((current) => ({ ...current, ...patch }));

  const venues = (options?.locations || []).filter(
    (venue) => venue.is_active || venue.id === values.location_id
  );
  const coaches = options?.coaches || [];
  const noCoaches = coaches.length === 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await academyApi.saveClassGroup({
        ...(initial ? { class_group_id: initial.id, is_active: initial.is_active } : {}),
        location_id: values.location_id,
        coach_id: values.coach_id,
        skill_level: values.skill_level,
        day_of_week: values.day_of_week,
        start_time: values.start_time,
        end_time: values.end_time,
        max_capacity: Number(values.max_capacity),
        name: values.name.trim(),
        notes: values.notes.trim()
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e.message || 'The class group could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const ready =
    Boolean(values.location_id && values.coach_id && values.start_time && values.end_time) &&
    values.max_capacity !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit class group' : 'Add class group'}</DialogTitle>
          <DialogDescription>
            A class group is the weekly row: same weekday, time, pool, coach and level. Sessions are
            created from it as separate dated classes.
          </DialogDescription>
        </DialogHeader>

        {noCoaches && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            No Coaches are available. Assign a Coach role before creating a class.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="group-venue">Venue</Label>
            <Select
              value={values.location_id || 'none'}
              onValueChange={(value) => set({ location_id: value === 'none' ? '' : value })}
            >
              <SelectTrigger id="group-venue" aria-label="Venue">
                <SelectValue placeholder="Choose a venue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose a venue</SelectItem>
                {venues.map((venue) => (
                  <SelectItem key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.branch_name ? ` · ${venue.branch_name}` : ''}
                    {venue.is_active ? '' : ' (inactive)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="group-coach">Coach</Label>
            <Select
              value={values.coach_id || 'none'}
              onValueChange={(value) => set({ coach_id: value === 'none' ? '' : value })}
            >
              <SelectTrigger id="group-coach" aria-label="Coach">
                <SelectValue placeholder="Choose a coach" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose a coach</SelectItem>
                {coaches.map((coach) => (
                  <SelectItem key={coach.user_id} value={coach.user_id}>
                    {coach.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="group-level">Level</Label>
            <Select value={values.skill_level} onValueChange={(value) => set({ skill_level: value })}>
              <SelectTrigger id="group-level" aria-label="Level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="group-day">Day of the week</Label>
            <Select
              value={String(values.day_of_week)}
              onValueChange={(value) => set({ day_of_week: Number(value) })}
            >
              <SelectTrigger id="group-day" aria-label="Day of the week">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OF_WEEK_LABELS.map((label, value) => (
                  <SelectItem key={label} value={String(value)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="group-start">Start time</Label>
            <Input
              id="group-start"
              type="time"
              value={values.start_time}
              onChange={(event) => set({ start_time: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="group-end">End time</Label>
            <Input
              id="group-end"
              type="time"
              value={values.end_time}
              onChange={(event) => set({ end_time: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="group-capacity">Capacity</Label>
            <Input
              id="group-capacity"
              type="number"
              min={1}
              max={60}
              value={values.max_capacity}
              onChange={(event) => set({ max_capacity: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">Swimmers per session.</p>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="group-name">Name (optional)</Label>
            <Input
              id="group-name"
              value={values.name}
              maxLength={80}
              placeholder="e.g. Saturday beginners"
              onChange={(event) => set({ name: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the level and weekday.
            </p>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="group-notes">Notes for staff (optional)</Label>
            <Textarea
              id="group-notes"
              rows={2}
              maxLength={300}
              value={values.notes}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !ready || noCoaches}>
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : initial ? 'Save group' : 'Add group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}