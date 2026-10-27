import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { CANCELLATION_TYPE_LABEL } from '@/lib/classFormat';

const TYPES = ['normal', 'academy', 'weather'];

// Cancelling keeps the class record; this dialog only records why, so later token
// and reporting logic can tell a normal cancellation from haze or an academy-wide
// closure.
export default function CancelClassDialog({ open, onOpenChange, classLabel, saving, error, onConfirm }) {
  const [type, setType] = useState('normal');
  const [reason, setReason] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this class?</DialogTitle>
          <DialogDescription>
            {classLabel ? `${classLabel} will stay on record as cancelled.` : 'The class will stay on record as cancelled.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="cancel-type">Reason type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="cancel-type" aria-label="Cancellation reason type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((value) => (
                  <SelectItem key={value} value={value}>{CANCELLATION_TYPE_LABEL[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cancel-reason">Details (optional)</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              maxLength={200}
              placeholder="e.g. Pool closed by management"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Keep class
          </Button>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={() => onConfirm({ cancellation_type: type, cancellation_reason: reason.trim() })}
          >
            {saving ? 'Cancelling…' : 'Cancel class'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}