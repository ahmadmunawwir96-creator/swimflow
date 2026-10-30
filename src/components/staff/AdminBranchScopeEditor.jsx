import React, { useEffect, useRef, useState } from 'react';
import { academyApi } from '@/lib/academy';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import BranchScopeSummary from './BranchScopeSummary';
import BranchScopeChoice from './BranchScopeChoice';
import { AlertTriangle, Loader2, Network } from 'lucide-react';

const ADMIN_SELECT_ID = 'branch-scope-admin';

// Branch scope of an academy Admin — SYSTEM OWNER ONLY.
//
// Both calls are gated server-side by the built-in platform-admin role, so hiding
// this panel is a courtesy, not the boundary: an academy Admin cannot read or widen
// scope even by calling the functions directly.
//
// Every value shown as "current access" comes from the server read, never from what
// the owner last clicked. Applying is a separate, explicit step that replaces the
// Admin's whole scope.
export default function AdminBranchScopeEditor({ admins, onApplied }) {
  const { toast } = useToast();
  const [targetId, setTargetId] = useState('');
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const requestVersion = useRef(0);
  const currentTarget = useRef('');
  const saveInFlight = useRef(false);

  const selectTarget = (id) => {
    if (saveInFlight.current) return;
    currentTarget.current = id;
    requestVersion.current += 1;
    setTargetId(id);
    setAccess(null);
    setLoadError('');
    setNotice('');
    setMode(null);
    setSelectedIds([]);
  };

  const load = async (id) => {
    if (!id || currentTarget.current !== id) return false;
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current && currentTarget.current === id;
    setAccess(null);
    setLoading(true);
    setLoadError('');
    try {
      const res = await academyApi.getAdminBranchAccess(id);
      if (!isCurrent()) return false;
      if (res?.target_user?.user_id !== id) {
        throw new Error('The server returned access for a different admin. Reload before trying again.');
      }
      setAccess(res);
      setMode(null);
      setSelectedIds([]);
      return true;
    } catch (e) {
      if (!isCurrent()) return false;
      setAccess(null);
      setLoadError(e.message || 'Branch access could not be loaded right now.');
      return false;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    currentTarget.current = targetId;
    if (!targetId) {
      setAccess(null);
      setLoadError('');
      setMode(null);
      setSelectedIds([]);
      setLoading(false);
    } else {
      load(targetId);
    }
    return () => { requestVersion.current += 1; };
  }, [targetId]);

  const toggleBranch = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const branches = access?.branches || [];
  const targetName = access?.target_user?.full_name || access?.target_user?.email || 'This admin';
  const accessMatchesTarget = !!targetId && access?.target_user?.user_id === targetId;
  const canApply = accessMatchesTarget && !loading && !saving &&
    (mode === 'all' || (mode === 'specific' && selectedIds.length > 0 &&
      selectedIds.every((id) => branches.some((branch) => branch.id === id))));

  const planLabel =
    mode === 'all'
      ? 'all branches, including branches created later'
      : selectedIds
          .map((id) => (branches.find((b) => b.id === id) || {}).name)
          .filter(Boolean)
          .join(', ');

  const apply = async () => {
    if (!canApply || saveInFlight.current || currentTarget.current !== targetId ||
        access?.target_user?.user_id !== targetId) return;
    const intendedId = targetId;
    const payload = mode === 'all'
      ? { target_user_id: intendedId, all_branches: true }
      : { target_user_id: intendedId, all_branches: false, branch_ids: [...selectedIds] };
    saveInFlight.current = true;
    setSaving(true);
    setNotice('');
    try {
      await academyApi.assignAdminBranches(payload);
      toast({ title: 'Branch access updated' });
      if (onApplied) onApplied();
      const reloaded = await load(intendedId);
      if (!reloaded && currentTarget.current === intendedId) {
        setNotice('Branch access was saved, but current access could not be reloaded. Reload before making another change.');
      }
    } catch (e) {
      toast({ title: 'Branch access not confirmed', description: e.message, variant: 'destructive' });
      const reloaded = await load(intendedId);
      if (currentTarget.current === intendedId) {
        setNotice(reloaded
          ? 'The save was not confirmed. Some changes may already have been applied. Current access is shown below.'
          : 'The save was not confirmed, and current access could not be reloaded. Some changes may already have been applied. Reload before trying again.');
      }
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4" /> Branch access
        </CardTitle>
        <CardDescription>
          System owner only. Choose which branches an academy admin can see. Promotion and branch
          access are separate steps, and saving here replaces the admin's whole scope.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active academy admins yet. Promote someone first, then set their branch access here.
          </p>
        ) : (
          <div className="space-y-1.5 sm:max-w-sm">
            <Label htmlFor={ADMIN_SELECT_ID} className="text-sm font-medium">
              Academy admin
            </Label>
            <Select value={targetId} onValueChange={selectTarget} disabled={saving}>
              <SelectTrigger id={ADMIN_SELECT_ID}>
                <SelectValue placeholder="Choose an admin" />
              </SelectTrigger>
              <SelectContent>
                {admins.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {a.user_name || a.user_email || a.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {targetId && loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading current access…
          </p>
        )}

        {loadError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
            <Button size="sm" variant="outline" onClick={() => load(targetId)}>Try again</Button>
          </div>
        )}

        {notice && (
          <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {notice}
          </p>
        )}

        {accessMatchesTarget && !loading && (
          <>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Current access</p>
              <BranchScopeSummary scope={access.scope} branches={branches} />
            </div>

            <BranchScopeChoice
              mode={mode}
              onModeChange={setMode}
              selectedIds={selectedIds}
              onToggle={toggleBranch}
              branches={branches}
              disabled={saving}
            />

            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <Button onClick={apply} disabled={!canApply}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  'Replace branch access'
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {mode === null
                  ? 'Choose specific branches or all branches before saving.'
                  : `After saving, ${targetName} will reach: ${planLabel || 'no branches (not saved)'}.`}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}