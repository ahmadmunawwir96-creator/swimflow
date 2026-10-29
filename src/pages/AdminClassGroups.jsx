import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { academyApi } from '@/lib/academy';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import NoticePanel from '@/components/common/NoticePanel';
import ClassGroupList from '@/components/classes/ClassGroupList';
import ClassGroupFormDialog from '@/components/classes/ClassGroupFormDialog';
import GenerateSessionsDialog from '@/components/classes/GenerateSessionsDialog';
import VenueManagerDialog from '@/components/classes/VenueManagerDialog';
import { ArrowLeft, CalendarRange, Plus, ShieldAlert, Users, MapPin } from 'lucide-react';

// Admin class groups: the recurring weekly rows a whole term of dated sessions is
// generated from. Members never see this page or the concept — they only see the
// dated sessions on the timetable.
export default function AdminClassGroups() {
  const [data, setData] = useState({
    today: '',
    class_groups: [],
    branches: [],
    locations: [],
    coaches: [],
    has_coaches: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [venuesOpen, setVenuesOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const res = await academyApi.listClassGroups();
      setData({
        today: res?.today || '',
        class_groups: Array.isArray(res?.class_groups) ? res.class_groups : [],
        branches: Array.isArray(res?.branches) ? res.branches : [],
        locations: Array.isArray(res?.locations) ? res.locations : [],
        coaches: Array.isArray(res?.coaches) ? res.coaches : [],
        has_coaches: Boolean(res?.has_coaches)
      });
    } catch (e) {
      if (e.status === 401 || e.status === 403) setDenied(true);
      else setError(e.message || 'Class groups could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (group) => {
    setBusy(true);
    setActionError(null);
    try {
      await academyApi.saveClassGroup({
        class_group_id: group.id,
        location_id: group.location?.id,
        coach_id: group.coach?.id,
        class_category: group.category,
        skill_level: group.level,
        day_of_week: group.day_of_week,
        start_time: group.start_time,
        end_time: group.end_time,
        max_capacity: group.capacity ?? 1,
        name: group.name || '',
        notes: group.notes || '',
        is_active: !group.is_active
      });
      await load();
    } catch (e) {
      setActionError(e.message || 'The class group could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (group) => {
    setEditing(group);
    setFormOpen(true);
  };

  const activeVenues = data.locations.filter((venue) => venue.is_active);
  const blockedReason = !data.has_coaches
    ? 'No Coaches are available. Assign a Coach role before creating a class.'
    : activeVenues.length === 0
      ? 'Add a venue first. A class group needs the pool it is held at.'
      : null;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link to="/admin/classes">
          <ArrowLeft className="h-4 w-4" /> Back to schedule
        </Link>
      </Button>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="h-4 w-4 text-brand" /> Class groups
              </CardTitle>
              <CardDescription>
                The weekly timetable: one row per day, time, pool, coach and level. Create the dated
                sessions from a group.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setVenuesOpen(true)} className="w-full sm:w-auto">
                <MapPin className="h-4 w-4" /> Venues
              </Button>
              <Button onClick={openAdd} disabled={Boolean(blockedReason)} className="w-full sm:w-auto">
                <Plus className="h-4 w-4" /> Add class group
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {actionError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {actionError}
            </div>
          )}

          {loading ? (
            <NoticePanel loading title="Loading class groups…" />
          ) : denied ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Admins only"
              description="You do not have permission to manage class groups."
            />
          ) : error ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
              title="Class groups temporarily unavailable"
              description={error}
              actionLabel="Try again"
              onAction={load}
            />
          ) : (
            <>
              {blockedReason && (
                <NoticePanel
                  icon={<Users className="h-6 w-6" />}
                  title={data.has_coaches ? 'Add a venue first' : 'No Coaches are available'}
                  description={blockedReason}
                  actionLabel={data.has_coaches ? 'Add a venue' : 'Manage roles'}
                  onAction={data.has_coaches ? () => setVenuesOpen(true) : undefined}
                />
              )}

              {data.class_groups.length === 0 ? (
                !blockedReason && (
                  <NoticePanel
                    icon={<CalendarRange className="h-6 w-6" />}
                    title="No class groups yet"
                    description="Add the weekday, time, pool, coach and level once, then create the sessions for the term."
                    actionLabel="Add class group"
                    onAction={openAdd}
                  />
                )
              ) : (
                <ClassGroupList
                  groups={data.class_groups}
                  busy={busy}
                  onEdit={openEdit}
                  onGenerate={(group) => setGenerating(group)}
                  onToggle={toggleActive}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ClassGroupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        options={{
          locations: data.locations,
          coaches: data.coaches,
          days: data.days,
          levels: data.levels
        }}
        onSaved={load}
      />

      <GenerateSessionsDialog
        open={Boolean(generating)}
        onOpenChange={(open) => {
          if (!open) setGenerating(null);
        }}
        group={generating}
        today={data.today}
        onGenerated={load}
      />

      <VenueManagerDialog
        open={venuesOpen}
        onOpenChange={setVenuesOpen}
        branches={data.branches}
        locations={data.locations}
        onLocationsChanged={(locations) => {
          setData((current) => ({ ...current, locations }));
          load();
        }}
      />
    </div>
  );
}