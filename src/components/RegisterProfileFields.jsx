import React from 'react';
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
const RELATIONSHIPS = ['child', 'dependant', 'ward', 'sibling'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}

// Conditional profile fields shown during registration, based on account type.
// For parent/guardian, parent contact comes first, then the swimmer details.
export default function RegisterProfileFields({ accountType, values, onChange }) {
  const isParent = accountType === 'parent_guardian';
  const set = (k, v) => onChange(k, v);

  return (
    <div className="space-y-4">
      {isParent && (
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <p className="text-sm font-medium">Parent / guardian details</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Parent / guardian name" required>
              <Input value={values.parent_name || ''} onChange={(e) => set('parent_name', e.target.value)} required />
            </Field>
            <Field label="Parent / guardian phone" required>
              <Input value={values.parent_phone || ''} onChange={(e) => set('parent_phone', e.target.value)} required />
            </Field>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={isParent ? 'Swimmer name' : 'Full name'} required>
          <Input value={values.full_name || ''} onChange={(e) => set('full_name', e.target.value)} required />
        </Field>
        <Field label="Date of birth" required>
          <Input type="date" value={values.date_of_birth || ''} onChange={(e) => set('date_of_birth', e.target.value)} required />
        </Field>
        <Field label="Gender">
          <Select value={values.gender || ''} onValueChange={(v) => set('gender', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{cap(g)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {isParent && (
          <Field label="Relationship" required>
            <Select value={values.relationship || ''} onValueChange={(v) => set('relationship', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{cap(r)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Swimming level and progression are set by academy admins, not during registration.
      </p>

      {!isParent && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Emergency contact name">
            <Input value={values.emergency_contact_name || ''} onChange={(e) => set('emergency_contact_name', e.target.value)} />
          </Field>
          <Field label="Emergency contact phone">
            <Input value={values.emergency_contact_phone || ''} onChange={(e) => set('emergency_contact_phone', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}