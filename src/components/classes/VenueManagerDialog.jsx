import React, { useEffect, useState } from 'react';
import { academyApi } from '@/lib/academy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { MapPin, Plus, Pencil, Power } from 'lucide-react';

// Minimal venue management: add a pool, correct its details, or deactivate it.
// There is deliberately no delete — a retired venue must keep the classes that
// were held there.
export default function VenueManagerDialog({ open, onOpenChange, branches, locations, onLocationsChanged }) {
  const [mode, setMode] = useState('list');
  const [editing, setEditing] = useState(null);
  const [fields, setFields] = useState({ name: '', branch_id: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMode('list');
    setEditing(null);
    setError(null);
  }, [open]);

  const startAdd = () => {
    setFields({
      name: '',
      branch_id: branches.length === 1 ? branches[0].id : '',
      address: '',
      notes: ''
    });
    setEditing(null);
    setError(null);
    setMode('form');
  };

  const startEdit = (venue) => {
    setFields({
      name: venue.name || '',
      branch_id: venue.branch_id || '',
      address: venue.address || '',
      notes: venue.notes || ''
    });
    setEditing(venue);
    setError(null);
    setMode('form');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await academyApi.saveLocation({
        location_id: editing?.id,
        branch_id: fields.branch_id,
        name: fields.name.trim(),
        address: fields.address.trim(),
        notes: fields.notes.trim(),
        is_active: editing ? editing.is_active : true
      });
      onLocationsChanged(res?.locations || []);
      setMode('list');
      setEditing(null);
    } catch (e) {
      setError(e.message || 'The venue could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (venue) => {
    setSaving(true);
    setError(null);
    try {
      const res = await academyApi.saveLocation({
        location_id: venue.id,
        branch_id: venue.branch_id,
        name: venue.name,
        address: venue.address || '',
        notes: venue.notes || '',
        is_active: !venue.is_active
      });
      onLocationsChanged(res?.locations || []);
    } catch (e) {
      setError(e.message || 'The venue could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Venues</DialogTitle>
          <DialogDescription>
            The pools where classes are held. Deactivate a venue instead of deleting it, so past classes keep their venue.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {mode === 'list' ? (
          <div className="space-y-3">
            {locations.length === 0 ? (
              <div className="rounded-md border px-3 py-6 text-center space-y-1">
                <MapPin className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">No venues yet</p>
                <p className="text-sm text-muted-foreground">Add the pool where your classes are held.</p>
              </div>
            ) : (
              <ul className="divide-y rounded-lg border">
                {locations.map((venue) => (
                  <li key={venue.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{venue.name}</span>
                        <Badge variant="secondary">{venue.branch_name || 'No branch'}</Badge>
                        {!venue.is_active && <Badge variant="outline">Inactive</Badge>}
                      </div>
                      {venue.address && (
                        <p className="mt-1 text-xs text-muted-foreground">{venue.address}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(venue)} disabled={saving}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(venue)} disabled={saving}>
                        <Power className="h-3.5 w-3.5" /> {venue.is_active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={startAdd} className="w-full">
              <Plus className="h-4 w-4" /> Add venue
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="venue-name">Venue name</Label>
              <Input
                id="venue-name"
                value={fields.name}
                maxLength={80}
                placeholder="e.g. Condominium pool"
                onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            {branches.length > 1 ? (
              <div className="space-y-1">
                <Label htmlFor="venue-branch">Branch</Label>
                <Select
                  value={fields.branch_id || 'none'}
                  onValueChange={(value) => setFields((current) => ({ ...current, branch_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger id="venue-branch" aria-label="Branch"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose a branch</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Branch: {branches[0]?.name || 'none'}
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="venue-address">Address or description (optional)</Label>
              <Input
                id="venue-address"
                value={fields.address}
                maxLength={200}
                onChange={(event) => setFields((current) => ({ ...current, address: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="venue-notes">Notes for staff (optional)</Label>
              <Textarea
                id="venue-notes"
                rows={2}
                maxLength={300}
                placeholder="e.g. Enter through the side gate"
                value={fields.notes}
                onChange={(event) => setFields((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </div>
        )}

        {mode === 'form' && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMode('list')} disabled={saving}>
              Back
            </Button>
            <Button onClick={save} disabled={saving || !fields.name.trim() || !fields.branch_id}>
              {saving ? 'Saving…' : editing ? 'Save venue' : 'Add venue'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}