import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { AlertTriangle, MapPin, Save } from 'lucide-react';
import { timeRange } from '@/lib/classFormat';
import { CLASS_CATEGORY_OPTIONS, LEVEL_OPTIONS } from '@/lib/classDefaults';

// One form for creating and editing a session: venue, level, date, times, capacity,
// coach, optional label and notes. Deliberately a single step — staff should not
// walk through a wizard to add one class.
export default function ClassForm({
  initial,
  options,
  onSubmit,
  saving,
  error,
  conflict,
  onOpenVenues,
  submitLabel,
  onCancel
}) {
  const [values, setValues] = useState({
    location_id: initial?.location?.id || '',
    class_category: initial?.category || 'standard',
    skill_level: initial?.level || (initial ? '' : 'beginner'),
    class_date: initial?.date || '',
    start_time: initial?.start_time || '',
    end_time: initial?.end_time || '',
    max_capacity: initial?.capacity ?? 6,
    coach_id: initial?.coach?.id || '',
    name: initial?.name || '',
    notes: initial?.notes || ''
  });

  const set = (patch) => setValues((current) => ({ ...current, ...patch }));

  // Toddler classes carry no swimming level, standard needs one, adult may be mixed.
  const changeCategory = (next) => {
    setValues((current) => ({
      ...current,
      class_category: next,
      skill_level: next === 'toddler'
        ? ''
        : next === 'standard'
          ? current.skill_level || 'beginner'
          : current.skill_level
    }));
  };

  const changeLevel = (next) => set({ skill_level: next === 'mixed' ? '' : next });

  // An inactive venue stays selectable only on the class that already uses it, so
  // editing a historic session never silently moves it to another pool.
  const venueChoices = (options?.locations || []).filter(
    (venue) => venue.is_active || venue.id === values.location_id
  );
  const coaches = options?.coaches || [];

  // A coach is required: every real class has one, and the server refuses a
  // session without an active Coach.
  const submit = () => {
    onSubmit({
      location_id: values.location_id,
      class_category: values.class_category,
      skill_level: values.class_category === 'toddler' ? null : (values.skill_level || null),
      class_date: values.class_date,
      start_time: values.start_time,
      end_time: values.end_time,
      max_capacity: Number(values.max_capacity),
      coach_id: values.coach_id,
      name: values.name.trim(),
      notes: values.notes.trim()
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submit();
  };

  const noCoaches = coaches.length === 0;
  const levelReady =
    values.class_category !== 'standard' || Boolean(values.skill_level);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {venueChoices.length === 0 && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
          <p className="text-sm font-medium">Add a venue first</p>
          <p className="text-sm text-muted-foreground">
            A class is held at a physical pool. Add the venue, then come back to schedule the class.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onOpenVenues}>
            <MapPin className="h-4 w-4" /> Add a venue
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {conflict && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" /> {conflict.message}
          </p>
          {Array.isArray(conflict.conflicts) && conflict.conflicts.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {conflict.conflicts.map((item, index) => (
                <li key={index}>
                  Already scheduled: {item.name || item.type_label || 'class'} ·{' '}
                  {timeRange(item.start_time, item.end_time)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="class-venue">Venue</Label>
          <Select
            value={values.location_id || 'none'}
            onValueChange={(value) => set({ location_id: value === 'none' ? '' : value })}
          >
            <SelectTrigger id="class-venue" aria-label="Venue">
              <SelectValue placeholder="Choose a venue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose a venue</SelectItem>
              {venueChoices.map((venue) => (
                <SelectItem key={venue.id} value={venue.id}>
                  {venue.name}{venue.branch_name ? ` · ${venue.branch_name}` : ''}{venue.is_active ? '' : ' (inactive)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="class-category">Category</Label>
          <Select value={values.class_category} onValueChange={changeCategory}>
            <SelectTrigger id="class-category" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLASS_CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="class-level">Level</Label>
          {values.class_category === 'toddler' ? (
            <p className="pt-2 text-sm text-muted-foreground">
              Toddler classes use their own age-based grouping.
            </p>
          ) : (
            <>
              <Select
                value={values.skill_level || (values.class_category === 'adult' ? 'mixed' : '')}
                onValueChange={changeLevel}
              >
                <SelectTrigger id="class-level" aria-label="Level">
                  <SelectValue placeholder="Choose a level" />
                </SelectTrigger>
                <SelectContent>
                  {values.class_category === 'adult' && (
                    <SelectItem value="mixed">All / Mixed levels</SelectItem>
                  )}
                  {LEVEL_OPTIONS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {values.class_category === 'adult'
                  ? 'Mixed levels means the class is open to every level.'
                  : 'Standard classes need one level.'}
              </p>
            </>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="class-date">Date</Label>
          <Input
            id="class-date"
            type="date"
            required
            value={values.class_date}
            onChange={(event) => set({ class_date: event.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="class-start">Start time</Label>
          <Input
            id="class-start"
            type="time"
            required
            value={values.start_time}
            onChange={(event) => set({ start_time: event.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="class-end">End time</Label>
          <Input
            id="class-end"
            type="time"
            required
            value={values.end_time}
            onChange={(event) => set({ end_time: event.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="class-capacity">Capacity</Label>
          <Input
            id="class-capacity"
            type="number"
            min={1}
            max={60}
            required
            value={values.max_capacity}
            onChange={(event) => set({ max_capacity: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">How many swimmers can join.</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="class-coach">Coach</Label>
          <Select
            value={values.coach_id || 'none'}
            onValueChange={(value) => set({ coach_id: value === 'none' ? '' : value })}
          >
            <SelectTrigger id="class-coach" aria-label="Coach"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose a coach</SelectItem>
              {coaches.map((coach) => (
                <SelectItem key={coach.user_id} value={coach.user_id}>{coach.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {noCoaches
              ? 'No Coaches are available. Assign a Coach role before creating a class.'
              : 'A coach may not be in two overlapping classes.'}
          </p>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="class-name">Class name (optional)</Label>
          <Input
            id="class-name"
            value={values.name}
            maxLength={80}
            placeholder="e.g. Saturday beginners"
            onChange={(event) => set({ name: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">Leave blank to use the category and level.</p>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="class-notes">Notes for staff (optional)</Label>
          <Textarea
            id="class-notes"
            value={values.notes}
            maxLength={500}
            rows={3}
            onChange={(event) => set({ notes: event.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          disabled={saving || venueChoices.length === 0 || noCoaches || !values.coach_id || !levelReady}
          className="w-full sm:w-auto"
        >
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : submitLabel || 'Save class'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}