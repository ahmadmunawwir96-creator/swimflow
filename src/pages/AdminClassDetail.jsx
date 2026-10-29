import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { academyApi } from '@/lib/academy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import NoticePanel from '@/components/common/NoticePanel';
import ClassStatusBadge from '@/components/classes/ClassStatusBadge';
import CancelClassDialog from '@/components/classes/CancelClassDialog';
import { ArrowLeft, Pencil, CalendarDays, Ban, RotateCcw, ShieldAlert } from 'lucide-react';
import { classDate, timeRange, levelLabel, classStatusLabel, cancellationTypeLabel, capacityLabel } from '@/lib/classFormat';

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground sm:w-32 sm:shrink-0">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function AdminClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    setNotFound(false);
    try {
      const res = await academyApi.getClass(id);
      setData(res);
    } catch (e) {
      setData(null);
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

  const cancel = async (values) => {
    setSaving(true);
    setActionError(null);
    try {
      await academyApi.cancelClass(id, values);
      setCancelOpen(false);
      await load();
    } catch (e) {
      setActionError(e.message || 'The class could not be cancelled.');
    } finally {
      setSaving(false);
    }
  };

  // Restoring re-runs the server-side checks. Anything that no longer holds — an
  // inactive venue, a coach who now teaches something else at that hour — is
  // refused outright and the class stays cancelled. A shared venue never is.
  const restore = async () => {
    setSaving(true);
    setActionError(null);
    try {
      await academyApi.cancelClass(id, { cancel: false });
      await load();
    } catch (e) {
      setActionError(e.message || 'The cancellation could not be reversed.');
    } finally {
      setSaving(false);
    }
  };

  const item = data?.class || null;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link to="/admin/classes"><ArrowLeft className="h-4 w-4" /> Back to schedule</Link>
      </Button>

      {loading ? (
        <NoticePanel loading title="Loading class…" />
      ) : denied ? (
        <NoticePanel
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Admins only"
          description="You do not have permission to view this class."
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
      ) : item ? (
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  <CalendarDays className="h-4 w-4 text-brand" />
                  {item.name || levelLabel(item.level)}
                  <ClassStatusBadge status={item.status} />
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {classDate(item.date)} · {timeRange(item.start_time, item.end_time)}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {data.can_edit && (
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link to={`/admin/classes/${id}/edit`}><Pencil className="h-4 w-4" /> Edit class</Link>
                  </Button>
                )}
                {item.status === 'cancelled' ? (
                  <Button variant="outline" onClick={() => restore()} disabled={saving} className="w-full sm:w-auto">
                    <RotateCcw className="h-4 w-4" /> {saving ? 'Restoring…' : 'Restore class'}
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={saving} className="w-full sm:w-auto">
                    <Ban className="h-4 w-4" /> Cancel class
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {actionError}
              </div>
            )}

            {item.status === 'cancelled' && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">This class is cancelled.</p>
                <p className="text-muted-foreground">
                  {cancellationTypeLabel(item.cancellation?.type)}
                  {item.cancellation?.reason ? ` · ${item.cancellation.reason}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  It stays on record so attendance and any later token adjustments can still reference it.
                </p>
              </div>
            )}

            {item.is_past && item.status !== 'cancelled' && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                This class date has already passed.
              </div>
            )}

            <dl>
              <Row label="Date">{classDate(item.date)}</Row>
              <Row label="Time">{timeRange(item.start_time, item.end_time)}</Row>
              <Row label="Level">{levelLabel(item.level)}</Row>
              <Row label="Venue">
                {item.location.name || 'Venue missing'}
                {data.venue?.address && (
                  <span className="block text-xs text-muted-foreground">{data.venue.address}</span>
                )}
              </Row>
              <Row label="Branch">{item.branch.name || '—'}</Row>
              <Row label="Coach">
                {item.coach ? (
                  <>
                    {item.coach.name || 'Coach unavailable'}
                    {!item.coach.has_active_coach_role && (
                      <span className="block text-xs text-destructive">
                        This person no longer has the Coach role. Choose another coach when you edit.
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">No coach assigned</span>
                )}
              </Row>
              <Row label="Capacity">{capacityLabel(item.capacity)}</Row>
              <Row label="Status">{classStatusLabel(item.status)}</Row>
              {item.notes && <Row label="Staff notes">{item.notes}</Row>}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <CancelClassDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        classLabel={item ? `${item.name || levelLabel(item.level)} · ${classDate(item.date)}` : ''}
        saving={saving}
        error={actionError}
        onConfirm={cancel}
      />
    </div>
  );
}