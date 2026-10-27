import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import {
  ageLabel,
  branchLabel,
  LEVEL_LABEL,
  statusLabel,
  statusStyle
} from '@/lib/studentFormat';

// Small-screen view of the directory. Shows only what staff need to recognise a
// swimmer and tap through — no horizontal scrolling, no tiny controls.
export default function StudentCardList({ students }) {
  return (
    <ul className="divide-y rounded-lg border">
      {students.map((s) => (
        <li key={s.id}>
          <Link
            to={`/admin/students/${s.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{s.full_name || 'Unnamed swimmer'}</span>
                <Badge className={statusStyle(s.status)}>{statusLabel(s.status)}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{ageLabel(s)}</span>
                <span aria-hidden="true">·</span>
                <span>{LEVEL_LABEL[s.swimming_level] || 'Level not set'}</span>
                <span aria-hidden="true">·</span>
                <span className={s.home_branch_name ? '' : 'text-destructive'}>
                  {branchLabel(s)}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}