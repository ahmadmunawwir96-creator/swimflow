import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';

const GENDERS = ['male', 'female', 'other'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const RELATIONSHIPS = ['child', 'dependant', 'ward', 'sibling'];

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// mode: 'self' (create self profile), 'dependent' (create dependent), 'edit' (update)
export default function StudentProfileForm({
  mode = 'self',
  initialValues = {},
  submitting = false,
  onSubmit,
  onCancel
}) {
  const [v, setV] = useState({
    full_name: '',
    date_of_birth: '',
    gender: '',
    swimming_level: '',
    skill_progression: '',
    medical_notes: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    relationship: 'child',
    consent_guardian_name: '',
    consent_guardian_phone: '',
    ...initialValues
  });
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      full_name: v.full_name.trim(),
      date_of_birth: v.date_of_birth,
      gender: v.gender || undefined,
      swimming_level: v.swimming_level || undefined,
      skill_progression: v.skill_progression?.trim() || undefined,
      medical_notes: v.medical_notes?.trim() || undefined,
      emergency_contact_name: v.emergency_contact_name?.trim() || undefined,
      emergency_contact_phone: v.emergency_contact_phone?.trim() || undefined
    };
    if (mode === 'dependent') payload.relationship = v.relationship;
    if (mode === 'self') {
      if (v.consent_guardian_name?.trim()) payload.consent_guardian_name = v.consent_guardian_name.trim();
      if (v.consent_guardian_phone?.trim()) payload.consent_guardian_phone = v.consent_guardian_phone.trim();
    }
    onSubmit(payload);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name" required>
          <Input value={v.full_name} onChange={(e) => set('full_name', e.target.value)} required />
        </Field>
        <Field label="Date of birth" required>
          <Input type="date" value={v.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} required />
        </Field>
        <Field label="Gender">
          <Select value={v.gender} onValueChange={(val) => set('gender', val)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => <SelectItem key={g} value={g}>{cap(g)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Swimming level">
          <Select value={v.swimming_level} onValueChange={(val) => set('swimming_level', val)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => <SelectItem key={l} value={l}>{cap(l)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {mode === 'dependent' && (
          <Field label="Relationship" required>
            <Select value={v.relationship} onValueChange={(val) => set('relationship', val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{cap(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Emergency contact name">
          <Input value={v.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} />
        </Field>
        <Field label="Emergency contact phone">
          <Input value={v.emergency_contact_phone} onChange={(e) => set('emergency_contact_phone', e.target.value)} />
        </Field>
      </div>
      <Field label="Skill progression notes">
        <Input value={v.skill_progression} onChange={(e) => set('skill_progression', e.target.value)} />
      </Field>
      <Field label="Medical notes">
        <Input value={v.medical_notes} onChange={(e) => set('medical_notes', e.target.value)} />
      </Field>
      {mode === 'self' && (
        <div className="rounded-md border border-border p-3 space-y-3 bg-muted/30">
          <p className="text-sm text-muted-foreground">
            If you are under 18, guardian consent details are recorded (not auto-granted). Leave blank if not applicable.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Guardian name">
              <Input value={v.consent_guardian_name} onChange={(e) => set('consent_guardian_name', e.target.value)} />
            </Field>
            <Field label="Guardian phone">
              <Input value={v.consent_guardian_phone} onChange={(e) => set('consent_guardian_phone', e.target.value)} />
            </Field>
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}