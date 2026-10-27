import React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Only the fields the directory screen needs are ever sent by the server; this
// table renders exactly those and nothing else.
const STATUS_STYLE = {
  active: 'bg-brand text-brand-foreground',
  trial: 'bg-sun text-sun-foreground',
  inactive: 'bg-muted text-muted-foreground',
  left: 'bg-muted text-muted-foreground'
};
const STATUS_LABEL = { active: 'Active', trial: 'Trial', inactive: 'Inactive', left: 'Left' };
const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const OWNER_LABEL = { self: 'Self-managed', dependent: 'Parent / guardian' };

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

export default function StudentTable({ students }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Swimmer</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Managed by</TableHead>
            <TableHead>Home branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((s) => {
            const age = ageFromDob(s.date_of_birth);
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.full_name || 'Unnamed swimmer'}</div>
                  <div className="text-xs text-muted-foreground">
                    {age !== null ? `${age} years old` : 'Age not recorded'}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{LEVEL_LABEL[s.swimming_level] || '—'}</TableCell>
                <TableCell className="text-sm">{OWNER_LABEL[s.ownership_type] || '—'}</TableCell>
                <TableCell className="text-sm">{s.home_branch_name || 'Unassigned'}</TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLE[s.status] || ''}>
                    {STATUS_LABEL[s.status] || s.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {s.date_joined ? new Date(s.date_joined).toLocaleDateString() : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}