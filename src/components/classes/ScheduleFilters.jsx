import React from 'react';
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
import { RefreshCw } from 'lucide-react';

// Filters for the admin schedule. Only authorized branches, venues and coaches are
// offered — the values come from the server response, never invented here.
export default function ScheduleFilters({ filters, onChange, onReset, branches, locations, coaches, disabled }) {
  const showButton = Boolean(filters.branch || filters.location || filters.coach || filters.status !== 'all' || filters.from || filters.to);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="schedule-from" className="text-xs text-muted-foreground">From</Label>
        <Input
          id="schedule-from"
          type="date"
          value={filters.from || ''}
          onChange={(event) => onChange({ from: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="schedule-to" className="text-xs text-muted-foreground">To</Label>
        <Input
          id="schedule-to"
          type="date"
          value={filters.to || ''}
          onChange={(event) => onChange({ to: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => onChange({ status: value })}
          disabled={disabled}
        >
          <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {branches.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Branch</Label>
          <Select
            value={filters.branch || 'all'}
            onValueChange={(value) => onChange({ branch: value === 'all' ? '' : value })}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Filter by branch"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Venue</Label>
        <Select
          value={filters.location || 'all'}
          onValueChange={(value) => onChange({ location: value === 'all' ? '' : value })}
          disabled={disabled || locations.length === 0}
        >
          <SelectTrigger aria-label="Filter by venue"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All venues</SelectItem>
            {locations.map((venue) => (
              <SelectItem key={venue.id} value={venue.id}>
                {venue.name}{venue.is_active ? '' : ' (inactive)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Coach</Label>
        <Select
          value={filters.coach || 'all'}
          onValueChange={(value) => onChange({ coach: value === 'all' ? '' : value })}
          disabled={disabled || coaches.length === 0}
        >
          <SelectTrigger aria-label="Filter by coach"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All coaches</SelectItem>
            {coaches.map((coach) => (
              <SelectItem key={coach.user_id} value={coach.user_id}>{coach.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        <Button variant="outline" className="w-full" onClick={onReset} disabled={disabled || !showButton}>
          <RefreshCw className="h-4 w-4" /> Reset filters
        </Button>
      </div>
    </div>
  );
}