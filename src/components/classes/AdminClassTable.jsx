import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import ClassStatusBadge from '@/components/classes/ClassStatusBadge';
import { shortDate, timeRange, levelLabel, weekdayShort } from '@/lib/classFormat';

// Desktop view of the admin schedule. The whole row opens the class, so staff do
// not have to aim at a small action link.
export default function AdminClassTable({ classes }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead>Coach</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map((item) => (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => navigate(`/admin/classes/${item.id}`)}
            >
              <TableCell className="whitespace-nowrap font-medium">
                {weekdayShort(item.date)} {shortDate(item.date)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {timeRange(item.start_time, item.end_time)}
              </TableCell>
              <TableCell>{item.name || '—'}</TableCell>
              <TableCell className="whitespace-nowrap">{levelLabel(item.level)}</TableCell>
              <TableCell>
                <span className="block">{item.location.name || 'Venue missing'}</span>
                {item.branch.name && (
                  <span className="block text-xs text-muted-foreground">{item.branch.name}</span>
                )}
              </TableCell>
              <TableCell>
                {item.coach ? item.coach.name || 'Coach unavailable' : '—'}
              </TableCell>
              <TableCell><ClassStatusBadge status={item.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}