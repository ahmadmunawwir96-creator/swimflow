import React from 'react';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import DirectoryNotice from '@/components/students/DirectoryNotice';
import StudentDirectory from '@/components/students/StudentDirectory';
import { Users, ShieldAlert } from 'lucide-react';

// Academy Admin only. This gate is presentation; the server function re-checks
// the caller's academy-admin assignment on every request.
export default function AdminStudents() {
  const { isAcademyAdmin, loading, error, reload } = useAcademyRoles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-brand" /> Student directory
        </h1>
        <p className="text-muted-foreground">
          Swimmer profiles across the academy, managed by each swimmer or their parent or guardian.
        </p>
      </div>

      {loading ? (
        <DirectoryNotice loading title="Checking your access…" />
      ) : error ? (
        <DirectoryNotice
          icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
          title="Could not verify your access"
          description="Your academy roles could not be loaded. This is a loading failure, not a permission denial."
          actionLabel="Try again"
          onAction={reload}
        />
      ) : !isAcademyAdmin ? (
        <DirectoryNotice
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Academy administrators only"
          description="Only an Academy Admin can browse academy-wide swimmer profiles."
        />
      ) : (
        <StudentDirectory />
      )}
    </div>
  );
}