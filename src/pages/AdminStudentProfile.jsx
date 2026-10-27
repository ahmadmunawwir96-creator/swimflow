import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { academyApi } from '@/lib/academy';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DirectoryNotice from '@/components/students/DirectoryNotice';
import {
  ageLabel,
  branchLabel,
  CONSENT_LABEL,
  formatDate,
  LEVEL_LABEL,
  MANAGED_BY_LABEL,
  RELATIONSHIP_LABEL,
  statusLabel,
  statusStyle
} from '@/lib/studentFormat';
import { ArrowLeft, ShieldAlert, UserX, AlertTriangle, HeartPulse, Phone, ScrollText } from 'lucide-react';

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{value || '—'}</dd>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Admin-facing profile of one swimmer.
//
// Every read goes through the secured getStudent function, which re-checks the
// caller's admin role and branch scope on each request. Nothing here queries the
// Student entity from the browser, so a URL edited by hand is refused by the
// server rather than by the screen.
export default function AdminStudentProfile() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  // 'denied' | 'not_found' | 'failure' | null
  const [problem, setProblem] = useState(null);
  const [failureMessage, setFailureMessage] = useState('');

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setProblem('not_found');
      return;
    }
    setLoading(true);
    setProblem(null);
    setFailureMessage('');
    setStudent(null);
    try {
      const res = await academyApi.getStudent(id);
      if (res?.student) {
        setStudent(res.student);
      } else {
        setProblem('not_found');
      }
    } catch (e) {
      const status = e?.status;
      if (status === 401 || status === 403) {
        setProblem('denied');
      } else if (status === 404) {
        // Only a genuine "does not exist / not in your branches" answer.
        setProblem('not_found');
      } else {
        // Everything else is a temporary failure — never dressed up as "not found".
        setProblem('failure');
        setFailureMessage(e?.message || '');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const backLink = (
    <Link
      to="/admin-students"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back to directory
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {backLink}
        <DirectoryNotice loading title="Loading swimmer profile…" />
      </div>
    );
  }

  if (problem === 'denied') {
    return (
      <div className="space-y-4">
        {backLink}
        <DirectoryNotice
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Admins only"
          description="You do not have permission to view swimmer profiles."
        />
      </div>
    );
  }

  if (problem === 'not_found') {
    return (
      <div className="space-y-4">
        {backLink}
        <DirectoryNotice
          icon={<UserX className="h-6 w-6" />}
          title="Student not found"
          description="This swimmer does not exist, or is outside the branches you are authorized to view."
        />
      </div>
    );
  }

  if (problem === 'failure' || !student) {
    return (
      <div className="space-y-4">
        {backLink}
        <DirectoryNotice
          icon={<AlertTriangle className="h-6 w-6 text-destructive" />}
          title="Profile temporarily unavailable"
          description={
            failureMessage ||
            'This profile could not be loaded right now. This is a temporary problem, not a missing record.'
          }
          actionLabel="Try again"
          onAction={load}
        />
      </div>
    );
  }

  const showLeaving =
    student.status === 'left' || !!student.date_left || !!student.reason_for_leaving;
  const consentGiven = student.consent_status === 'given';

  return (
    <div className="space-y-4 max-w-4xl">
      {backLink}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-heading font-semibold">{student.full_name || 'Unnamed swimmer'}</h1>
        <Badge className={statusStyle(student.status)}>{statusLabel(student.status)}</Badge>
        {!student.home_branch_id && (
          <Badge className="bg-muted text-muted-foreground">Unassigned</Badge>
        )}
      </div>

      <Section title="Swimmer details" icon={<ScrollText className="h-4 w-4 text-brand" />}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Age" value={ageLabel(student)} />
          <Field label="Date of birth" value={formatDate(student.date_of_birth)} />
          <Field label="Swimming level" value={LEVEL_LABEL[student.swimming_level] || null} />
          <Field label="Status" value={statusLabel(student.status)} />
          <Field label="Home branch" value={branchLabel(student)} />
          <Field label="Joined" value={formatDate(student.date_joined)} />
          <Field label="Managed by" value={MANAGED_BY_LABEL[student.ownership_type] || null} />
          {student.relationship && student.ownership_type === 'dependent' && (
            <Field label="Relationship" value={RELATIONSHIP_LABEL[student.relationship] || null} />
          )}
        </dl>
      </Section>

      <Section title="Safety and notes" icon={<HeartPulse className="h-4 w-4 text-brand" />}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Medical notes</dt>
            <dd className="text-sm mt-0.5 whitespace-pre-line">
              {student.medical_notes || <span className="text-muted-foreground">None recorded</span>}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Skill progression</dt>
            <dd className="text-sm mt-0.5 whitespace-pre-line">
              {student.skill_progression || (
                <span className="text-muted-foreground">Nothing recorded</span>
              )}
            </dd>
          </div>
          <Field label="Emergency contact" value={student.emergency_contact_name} />
          <Field label="Emergency phone" value={student.emergency_contact_phone} />
        </dl>
      </Section>

      <Section title="Consent" icon={<Phone className="h-4 w-4 text-brand" />}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Consent status"
            value={CONSENT_LABEL[student.consent_status] || student.consent_status || null}
          />
          {consentGiven && <Field label="Consent date" value={formatDate(student.consent_date)} />}
          {student.consent_guardian_name && (
            <Field label="Consenting guardian" value={student.consent_guardian_name} />
          )}
          {student.consent_guardian_phone && (
            <Field label="Guardian phone" value={student.consent_guardian_phone} />
          )}
        </dl>
        {!consentGiven && student.consent_status === 'not_required' && (
          <p className="mt-3 text-xs text-muted-foreground">
            Guardian consent is not required for this swimmer.
          </p>
        )}
      </Section>

      {showLeaving && (
        <Section title="Leaving" icon={<UserX className="h-4 w-4 text-brand" />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Date left" value={formatDate(student.date_left)} />
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Reason</dt>
              <dd className="text-sm mt-0.5 whitespace-pre-line">
                {student.reason_for_leaving || <span className="text-muted-foreground">Not recorded</span>}
              </dd>
            </div>
          </dl>
        </Section>
      )}
    </div>
  );
}