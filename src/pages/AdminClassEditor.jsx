import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { academyApi } from '@/lib/academy';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import NoticePanel from '@/components/common/NoticePanel';
import ClassForm from '@/components/classes/ClassForm';
import VenueManagerDialog from '@/components/classes/VenueManagerDialog';
import { ArrowLeft, ShieldAlert, CalendarPlus } from 'lucide-react';

// Create (/admin/classes/new) and edit (/admin/classes/:id/edit) share this page
// and the same single-step form.
export default function AdminClassEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState(null);
  const [options, setOptions] = useState({ branches: [], locations: [], coaches: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [venuesOpen, setVenuesOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    setNotFound(false);
    try {
      if (id) {
        const res = await academyApi.getClass(id);
        setInitial(res?.class || null);
        setOptions(res?.options || { branches: [], locations: [], coaches: [] });
      } else {
        const res = await academyApi.getScheduleOptions();
        setInitial(null);
        setOptions({
          branches: res?.branches || [],
          locations: res?.locations || [],
          coaches: res?.coaches || []
        });
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) setDenied(true);
      else if (e.status === 404) setNotFound(true);
      else setError(e.message || 'This class could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (values, opts) => {
    setSaving(true);
    setSaveError(null);
    setConflict(null);
    try {
      const payload = { ...values };
      if (id) payload.class_id = id;
      if (opts?.confirmOverlap) payload.confirm_location_overlap = true;
      const res = await academyApi.saveClass(payload);
      const savedId = res?.class?.id || id;
      navigate(savedId ? `/admin/classes/${savedId}` : '/admin/classes', { replace: true });
    } catch (e) {
      if (e.status === 409 && e.data?.requires_confirmation) {
        setConflict({
          message: e.message,
          conflicts: e.data.conflicts || [],
          requiresConfirmation: true
        });
      } else {
        setSaveError(e.message || 'The class could not be saved.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link to="/admin/classes"><ArrowLeft className="h-4 w-4" /> Back to schedule</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4 text-brand" /> {id ? 'Edit class' : 'Add class'}
          </CardTitle>
          <CardDescription>
            {id
              ? 'Changing the date, time, venue or coach is recorded in the audit log.'
              : 'One form. Pick the venue, level, date and time, set the capacity, save.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <NoticePanel loading title="Loading…" />
          ) : denied ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Admins only"
              description="You do not have permission to schedule classes."
            />
          ) : notFound ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Class not found"
              description="This class does not exist or is outside your branches."
              actionLabel="Back to schedule"
              onAction={() => navigate('/admin/classes')}
            />
          ) : error ? (
            <NoticePanel
              icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
              title="Could not load this class"
              description={error}
              actionLabel="Try again"
              onAction={load}
            />
          ) : (
            <ClassForm
              initial={initial}
              options={options}
              onSubmit={handleSubmit}
              saving={saving}
              error={saveError}
              conflict={conflict}
              onOpenVenues={() => setVenuesOpen(true)}
              submitLabel={id ? 'Save changes' : 'Save class'}
              onCancel={() => navigate(id ? `/admin/classes/${id}` : '/admin/classes')}
            />
          )}
        </CardContent>
      </Card>

      <VenueManagerDialog
        open={venuesOpen}
        onOpenChange={setVenuesOpen}
        branches={options.branches}
        locations={options.locations}
        onLocationsChanged={(locations) => setOptions((current) => ({ ...current, locations }))}
      />
    </div>
  );
}