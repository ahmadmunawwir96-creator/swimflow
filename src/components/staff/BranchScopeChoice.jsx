import React from 'react';

// Explicit choice of an Admin's COMPLETE new access.
//
// There is deliberately no preselected mode: the owner must pick "specific branches"
// or "all branches" themselves, so nobody ever gets wider access by default.
export default function BranchScopeChoice({
  mode,
  onModeChange,
  selectedIds,
  onToggle,
  branches,
  disabled
}) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium">New access</legend>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="branch-scope-mode"
          value="specific"
          className="mt-1"
          checked={mode === 'specific'}
          onChange={() => onModeChange('specific')}
        />
        <span>Specific branches</span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="branch-scope-mode"
          value="all"
          className="mt-1"
          checked={mode === 'all'}
          onChange={() => onModeChange('all')}
        />
        <span>All branches, including branches created later</span>
      </label>

      {mode === 'specific' && (
        <div className="space-y-1.5 rounded-md border p-3">
          <p className="text-sm font-medium">Choose at least one branch</p>
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active branches exist yet. Choose all branches, or create a branch first.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {branches.map((b) => (
                <li key={b.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedIds.includes(b.id)}
                      onChange={() => onToggle(b.id)}
                    />
                    <span>
                      {b.name || 'Unnamed branch'}
                      {b.code ? <span className="text-muted-foreground"> ({b.code})</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  );
}