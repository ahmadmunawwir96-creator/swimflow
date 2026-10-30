import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { academyApi } from '@/lib/academy';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
];

const NOTES_MAX = 500;
const LEVEL_ID = 'progression-swimming-level';
const NOTES_ID = 'progression-notes';
const levelLabel = (value) => LEVELS.find((l) => l.value === value)?.label || null;

// Editor for the two academy-admin controlled fields of a swimmer profile.
//
// Every save goes through the secured updateStudentProgression function, which
// re-checks the admin role and branch scope on the server. Only the fields the
// admin actually changed are sent, so a swimmer with no level yet can have their
// notes recorded without inventing a level.
//
// On failure the form keeps exactly what the admin typed (nothing is reset), so
// the same button retries. Success is only ever shown from the record the server
// returned, never from local state.
export default function StudentProgressionEditor({ student, onSaved }) {
  const [level, setLevel] = useState(student?.swimming_level || '');
  const [notes, setNotes] = useState(student?.skill_progression || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Set only when the server confirmed the write but could not record the audit
  // entry. The saved values stand; the gap is stated rather than hidden.
  const [auditWarning, setAuditWarning] = useState('');
  // The values the SERVER last confirmed.
  const [verified, setVerified] = useState({
    level: student?.swimming_level || null,
    notes: student?.skill_progression || null
  });

  const trimmedNotes = notes.trim();
  const patch = {};
  if (level !== (student?.swimming_level || '')) patch.swimming_level = level;
  if (trimmedNotes !== (student?.skill_progression || '')) patch.skill_progression = trimmedNotes;
  const hasChanges = Object.keys(patch).length > 0;

  const save = async () => {
    if (saving || !hasChanges) return;
    // A level is never cleared — only moved to another level.
    if (patch.swimming_level === '') {
      setError('Choose a swimming level before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setAuditWarning('');
    try {
      const res = await academyApi.updateStudentProgression({ student_id: student.id, ...patch });
      const saved = res?.student;
      if (!saved) throw new Error('The academy server did not confirm this change.');
      setVerified({
        level: saved.swimming_level || null,
        notes: saved.skill_progression || null
      });
      setLevel(saved.swimming_level || '');
      setNotes(saved.skill_progression || '');
      setAuditWarning(
        res?.audit_recorded === false
          ? 'The change was saved, but its audit entry could not be recorded. Tell the system owner so it can be noted manually.'
          : ''
      );
      if (onSaved) onSaved(saved);
    } catch (e) {
      // Deliberately no state reset: the admin's unsaved values stay on screen.
      setError(e.message || 'This change could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={LEVEL_ID} className="text-sm font-medium">Swimming level</Label>
          <Select value={level} onValueChange={setLevel} disabled={saving}>
            <SelectTrigger id={LEVEL_ID}>
              <SelectValue placeholder="Not set yet" />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={NOTES_ID} className="text-sm font-medium">Progression notes</Label>
        <Textarea
          id={NOTES_ID}
          aria-describedby={`${NOTES_ID}-counter`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={NOTES_MAX}
          rows={3}
          disabled={saving}
          placeholder="What this swimmer is working on and has achieved"
        />
        <p id={`${NOTES_ID}-counter`} className="text-xs text-muted-foreground">
          {notes.length}/{NOTES_MAX} · clearing the text removes the notes
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {auditWarning && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{auditWarning}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Check className="h-4 w-4 text-brand" /> Saved:{' '}
            <span className="text-foreground">{levelLabel(verified.level) || 'No level'}</span>
            {' · '}
            <span className="text-foreground">
              {verified.notes ? 'notes recorded' : 'no progression notes'}
            </span>
          </span>
        </p>
        <Button type="button" onClick={save} disabled={saving || !hasChanges}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
            </>
          ) : hasChanges ? (
            'Save level and notes'
          ) : (
            'No changes'
          )}
        </Button>
      </div>
    </div>
  );
}