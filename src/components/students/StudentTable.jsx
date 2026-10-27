import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  ageFromDob,
  branchLabel,
  formatDate,
  LEVEL_LABEL,
  MANAGED_BY_LABEL,
  statusLabel,
  statusStyle
} from '@/lib/studentFormat';

// Desktop view. Only the fields the directory sends are rendered; the whole row
// opens the swimmer's profile.
export default function StudentTable({ students }) {
  const navigate = useNavigate();

  return (
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
          const href = `/admin/students/${s.id}`;
          return (
            <TableRow
              key={s.id}
              onClick={() => navigate(href)}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell>
                <Link to={href} className="font-medium hover:underline">
                  {s.full_name || 'Unnamed swimmer'}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {age !== null ? `${age} years old` : 'Age not recorded'}
                </div>
              </TableCell>
              <TableCell className="text-sm">{LEVEL_LABEL[s.swimming_level] || '—'}</TableCell>
              <TableCell className="text-sm">{MANAGED_BY_LABEL[s.ownership_type] || '—'}</TableCell>
              <TableCell className="text-sm">
                <span className={s.home_branch_name ? '' : 'text-destructive'}>
                  {branchLabel(s)}
                </span>
              </TableCell>
              <TableCell>
                <Badge className={statusStyle(s.status)}>{statusLabel(s.status)}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(s.date_joined) || '—'}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}