import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

// Shown when restoring a cancelled class would put two classes in the same venue at
// the same time. The backend refuses silently-created clashes, so the admin either
// confirms the venue overlap or leaves the class cancelled.
export default function RestoreClassNotice({ message, conflicts, busy, onConfirm, onDismiss }) {
  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3">
      <p className="flex items-start gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {message || 'Another class is already at this venue at that time.'}
      </p>
      {conflicts && conflicts.length > 0 && (
        <ul className="space-y-0.5 pl-6 text-xs text-muted-foreground">
          {conflicts.map((item, index) => (
            <li key={`${item.date}-${item.start_time}-${index}`}>
              {item.name || item.level_label || 'Class'}
              {item.start_time ? ` · ${item.start_time}–${item.end_time}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDismiss} disabled={busy} className="w-full sm:w-auto">
          Keep cancelled
        </Button>
        <Button onClick={onConfirm} disabled={busy} className="w-full sm:w-auto">
          {busy ? 'Restoring…' : 'Restore anyway'}
        </Button>
      </div>
    </div>
  );
}