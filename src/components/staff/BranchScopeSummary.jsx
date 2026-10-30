import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

// Current branch access for one academy Admin, exactly as the server reported it.
// Never derived from what the owner just clicked — this is the authoritative state.
export default function BranchScopeSummary({ scope, branches }) {
  if (!scope) return null;

  if (scope.all_branches) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <span>
          <span className="font-medium">All branches</span>, including branches created later.
        </span>
      </p>
    );
  }

  const ids = scope.branch_ids || [];

  if (ids.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium">No branch access yet.</span> This admin cannot see swimmers
          or classes until branches are assigned.
        </span>
      </div>
    );
  }

  return (
    <div className="text-sm">
      <p className="font-medium">Specific branches</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const branch = (branches || []).find((b) => b.id === id);
          return (
            <li key={id} className="rounded-full border px-2 py-0.5 text-xs">
              {branch ? branch.name || branch.code || 'Unnamed branch' : 'Inactive or unknown branch'}
            </li>
          );
        })}
      </ul>
    </div>
  );
}