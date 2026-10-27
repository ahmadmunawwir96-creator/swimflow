import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { academyApi } from '@/lib/academy';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import NoticePanel from '@/components/common/NoticePanel';
import ScheduleFilters from '@/components/classes/ScheduleFilters';
import AdminClassTable from '@/components/classes/AdminClassTable';
import AdminClassCardList from '@/components/classes/AdminClassCardList';
import VenueManagerDialog from '@/components/classes/VenueManagerDialog';
import { CalendarDays, Plus, MapPin, ShieldAlert, AlertTriangle } from 'lucide-react';
import { classDate } from '@/lib/classFormat';

const PAGE_SIZE = 30;
const EMPTY_FILTERS = { from: '', to: '', branch: '', location: '', coach: '', status: 'all' };

// Admin timetable. Every read and write goes through an authorized server function;
// this screen never queries Class or Location directly.
export default function AdminClasses() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState({ branches: [], locations: [], coaches: [] });
  const [classes, setClasses] = useState([]);
  const [windowRange, setWindowRange] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [moreError, setMoreError] = useState(null);
  const [denied, setDenied] = useState(false);
  const [venuesOpen, setVenuesOpen] = useState(false);

  const buildParams = useCallback(
    (extra) => {
      const params = { limit: PAGE_SIZE, status: filters.status };
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.branch) params.branch_id = filters.branch;
      if (filters.location) params.location_id = filters.location;
      if (filters.coach) params.coach_id = filters.coach;
      return { ...params, ...(extra || {}) };
    },
    [filters]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMoreError(null);
    setDenied(false);
    try {
      const res = await academyApi.listClasses(buildParams());
      setClasses(Array.isArray(res?.classes) ? res.classes : []);
      setOptions({
        branches: Array.isArray(res?.branches) ? res.branches : [],
        locations: Array.isArray(res?.locations) ? res.locations : [],
        coaches: Array.isArray(res?.coaches) ? res.coaches : []
      });
      setWindowRange(res?.window || null);
      setCursor(res?.next_cursor || null);
      setHasMore(!!res?.has_more);
    } catch (e) {
      if (e.status === 401 || e.status === 403) setDenied(true);
      else setError(e.message || 'The schedule could not be loaded.');
      setClasses([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await academyApi.listClasses(buildParams({ cursor }));
      setClasses((previous) => [...previous, ...(res?.classes || [])]);
      setCursor(res?.next_cursor || null);
      setHasMore(!!res?.has_more);
    } catch (e) {
      setMoreError(e.message || 'More classes could not be loaded right now.');
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered =
    Boolean(filters.from || filters.to || filters.branch || filters.location || filters.coach) ||
    filters.status !== 'all';

  const displayFrom = filters.from || windowRange?.from || '';
  const displayTo = filters.to || windowRange?.to || '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-brand" /> Class schedule
              </CardTitle>
              <CardDescription>
                Upcoming swimming classes in your branches. Open a class to edit or cancel it.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setVenuesOpen(true)} className="w-full sm:w-auto">
                <MapPin className="h-4 w-4" /> Venues
              </Button>
              <Button asChild className="w-full sm:w-auto">
                <Link to="/admin/classes/new">
                  <Plus className="h-4 w-4" /> Add class
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScheduleFilters
            filters={{ ...filters, from: displayFrom, to: displayTo }}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            onReset={() => setFilters(EMPTY_FILTERS)}
            branches={options.branches}
            locations={options.locations}
            coaches={options.coaches}
            disabled={loading}
          />

          {loading ? (
            <NoticePanel loading title="Loading classes…" />
          ) : denied ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Admins only"
              description="You do not have permission to manage the class schedule."
            />
          ) : error ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
              title="Schedule temporarily unavailable"
              description={error}
              actionLabel="Try again"
              onAction={load}
            />
          ) : options.locations.length === 0 ? (
            <NoticePanel
              icon={<MapPin className="h-6 w-6" />}
              title="Add your first venue"
              description="Classes are held at a physical pool. Add the venue first, then schedule classes there."
              actionLabel="Add a venue"
              onAction={() => setVenuesOpen(true)}
            />
          ) : classes.length === 0 ? (
            <NoticePanel
              icon={<CalendarDays className="h-6 w-6" />}
              title={filtered ? 'No classes match these filters' : 'No classes scheduled yet'}
              description={
                filtered
                  ? 'Try a wider date range or clear the filters.'
                  : `Nothing scheduled between ${classDate(displayFrom)} and ${classDate(displayTo)}.`
              }
              actionLabel={filtered ? 'Clear filters' : 'Add a class'}
              onAction={() => (filtered ? setFilters(EMPTY_FILTERS) : undefined)}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Showing {classes.length} class{classes.length === 1 ? '' : 'es'}
                {windowRange ? ` · ${classDate(windowRange.from)} – ${classDate(windowRange.to)}` : ''}
              </p>

              <div className="md:hidden">
                <AdminClassCardList classes={classes} />
              </div>
              <div className="hidden md:block">
                <AdminClassTable classes={classes} />
              </div>

              {moreError && (
                <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" /> {moreError}
                  </p>
                  <Button size="sm" variant="outline" onClick={loadMore}>Try again</Button>
                </div>
              )}

              {hasMore && !moreError && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="w-full sm:w-auto">
                    {loadingMore ? 'Loading…' : 'Load more classes'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <VenueManagerDialog
        open={venuesOpen}
        onOpenChange={setVenuesOpen}
        branches={options.branches}
        locations={options.locations}
        onLocationsChanged={(locations) => {
          setOptions((current) => ({ ...current, locations }));
          load();
        }}
      />
    </div>
  );
}