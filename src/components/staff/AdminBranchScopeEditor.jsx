import React, { useEffect, useState } from 'react';
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

  const load = async (id) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await academyApi.getAdminBranchAccess(id);
      setAccess(res);
      setMode(null);
      setSelectedIds([]);
      return true;
    } catch (e) {
      setAccess(null);
      setLoadError(e.message || 'Branch access could not be loaded right now.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!targetId) {
      setAccess(null);
      setLoadError('');
      setMode(null);
      setSelectedIds([]);
      return;
    }
    load(targetId);
  }, [targetId]);

  const toggleBranch = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const branches = access?.branches || [];
  const targetName = access?.target_user?.full_name || access?.target_user?.email || 'This admin';
  const canApply = !!targetId && !!access && !saving && (mode === 'all' || (mode === 'specific' && selectedIds.length > 0));

  const planLabel =
    mode === 'all'
      ? 'all branches, including branches created later'
      : selectedIds
          .map((id) => (branches.find((b) => b.id === id) || {}).name)
          .filter(Boolean)
          .join(', ');

  const apply = async () => {
    if (!canApply) return;
    setSaving(true);
    setNotice('');
    try {
      await academyApi.assignAdminBranches(
        mode === 'all'
          ? { target_user_id: targetId, all_branches: true }
          : { target_user_id: targetId, all_branches: false, branch_ids: selectedIds }
      );
      toast({ title: 'Branch access updated' });
      if (onApplied) onApplied();
      await load(targetId);
    } catch (e) {
      // The scope may have been partly applied, so never say "nothing changed".
      // Re-read the authoritative state; only claim it if the read also fails.
      toast({ title: 'Branch access not confirmed', description: e.message, variant: 'destructive' });
      // Never claim "nothing changed": part of the scope may already be applied.
      const reloaded = await load(targetId);
      setNotice(
        reloaded
          ? 'The change failed: ' + (e.message || 'unknown error') + '. Current access is shown above.'
          : 'The change could not be confirmed, and current access could not be reloaded. Reload this page before trying again.'
      );
    } finally {
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
            <Select value={targetId} onValueChange={setTargetId} disabled={saving}>
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

        {access && !loading && (
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

            {notice && (
              <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {notice}
              </p>
            )}

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