import React, { useEffect, useState } from 'react';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu';
import { academyApi } from '@/lib/academy';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { Search, ShieldCheck, UserCog, ArrowLeftRight, ChevronDown, Crown, AlertTriangle } from 'lucide-react';

// Academy admins may move a member between any academy role. 'app_admin' is the
// built-in app Admin role, granted additively (academy admins only).
const ACADEMY_ADMIN_TARGETS = {
  student: ['parent', 'coach'],
  parent: ['student', 'coach'],
  coach: ['student', 'parent']
};
// An ordinary app admin (platform admin without an academy-admin role) may only
// make the everyday transitions. Coach-from-parent and App Admin are reserved
// for academy admins — mirrored server-side in changeAcademyRole.
const APP_ADMIN_TARGETS = {
  student: ['parent', 'coach'],
  parent: ['student']
};
const ROLE_LABEL = { student: 'Student', parent: 'Parent', coach: 'Coach', admin: 'Academy Admin' };

export default function AdminRoles() {
  const { isAcademyAdmin, loading: rolesLoading, error: rolesError, reload: reloadRoles } = useAcademyRoles();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAppAdmin = user?.role === 'admin';
  const canManage = isAcademyAdmin || isAppAdmin;
  const [email, setEmail] = useState('');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const res = await academyApi.listRoles();
      setAssignments(res.assignments || []);
    } catch (e) {
      toast({ title: 'Could not load roles', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (canManage) loadList();
    else setLoadingList(false);
  }, [canManage]);

  // Change options for one assignment row, by caller authority.
  const targetsFor = (a) => {
    if (!a.is_active) return [];
    const matrix = isAcademyAdmin ? ACADEMY_ADMIN_TARGETS : APP_ADMIN_TARGETS;
    const base = matrix[a.role_name] || [];
    const canGrantAdmin = isAcademyAdmin && (a.role_name === 'student' || a.role_name === 'parent');
    return canGrantAdmin ? [...base, 'app_admin'] : base;
  };

  const search = async () => {
    if (!email.trim()) return;
    setSearching(true);
    setFound(null);
    try {
      const res = await academyApi.findUserByEmail(email.trim());
      setFound(res.user);
    } catch (e) {
      setFound(null);
      toast({ title: 'User not found', description: e.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const assign = async (role_name) => {
    setBusy(true);
    try {
      await academyApi.assignRole(found.user_id, role_name);
      toast({ title: `Assigned ${ROLE_LABEL[role_name]} role` });
      setFound(null);
      setEmail('');
      loadList();
    } catch (e) {
      toast({ title: 'Assignment failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const promoteToAdmin = async () => {
    if (!confirm(`Promote ${found.full_name || found.email} to Academy Admin? Their existing roles are kept.`)) return;
    setBusy(true);
    try {
      await academyApi.promoteToAdmin(found.user_id);
      toast({ title: 'Promoted to Academy Admin' });
      setFound(null);
      setEmail('');
      loadList();
    } catch (e) {
      toast({ title: 'Promotion failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (a) => {
    if (!confirm(`Revoke the ${ROLE_LABEL[a.role_name] || a.role_name} role from this user?`)) return;
    setBusy(true);
    try {
      await academyApi.revokeRole(a.user_id, a.role_name);
      toast({ title: 'Role revoked' });
      loadList();
    } catch (e) {
      toast({ title: 'Revoke failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (a, to) => {
    if (!to) return;
    // App Admin is the built-in platform role, granted additively: the member's
    // Student/Parent/Coach assignment is untouched.
    if (to === 'app_admin') {
      if (!confirm(`Make ${a.user_name || a.user_email || 'this user'} an app Admin? This grants full administrator access to the app.`)) return;
      setBusy(true);
      try {
        await academyApi.grantAppAdmin(a.user_id);
        toast({ title: 'App Admin granted', description: 'The member now has full administrator access.' });
      } catch (e) {
        toast({ title: 'Promotion failed', description: e.message, variant: 'destructive' });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!confirm(`Change this user's role from ${ROLE_LABEL[a.role_name]} to ${ROLE_LABEL[to]}?`)) return;
    setBusy(true);
    try {
      await academyApi.changeRole(a.user_id, a.role_name, to);
      toast({ title: 'Role changed', description: `${ROLE_LABEL[a.role_name]} → ${ROLE_LABEL[to]}` });
      loadList();
    } catch (e) {
      // Partial-failure messages (old revoked, new not assigned) arrive from the
      // backend describing the actual state; refresh so the table reflects it.
      toast({ title: 'Role change failed', description: e.message, variant: 'destructive' });
      loadList();
    } finally {
      setBusy(false);
    }
  };

  if (rolesLoading) return <p className="text-muted-foreground">Loading…</p>;
  // A failed role lookup must never read as "you are not an administrator".
  if (rolesError) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="font-medium flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Could not verify your permissions
          </p>
          <p className="text-sm text-muted-foreground">
            Your academy roles could not be loaded, so no role changes can be made right now.
            This is a loading failure, not a permission denial.
          </p>
          <Button size="sm" onClick={reloadRoles}>Try again</Button>
        </CardContent>
      </Card>
    );
  }
  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Administrator authority is required to manage roles.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Role administration
        </h1>
        <p className="text-muted-foreground">
          {isAcademyAdmin
            ? 'Assign Student, Parent, or Coach, promote a member to app Admin, or grant Academy Admin. Grants keep existing roles; the last active Academy Admin cannot be removed.'
            : 'Change members between Student, Parent, and Coach. Coach-from-parent and Admin grants are reserved for Academy Admins.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> Find a member</CardTitle>
          <CardDescription>
            {isAcademyAdmin
              ? 'Search by email to assign a role or promote to Academy Admin.'
              : 'Search by email to assign Student or Parent.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="member@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
            <Button onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Search'}</Button>
          </div>
          {found && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-sm">
                <span className="font-medium">{found.full_name || 'Unknown'}</span> · {found.email}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => assign('student')} disabled={busy}>Assign Student</Button>
                <Button size="sm" variant="outline" onClick={() => assign('parent')} disabled={busy}>Assign Parent</Button>
                {isAcademyAdmin && (
                  <Button size="sm" variant="outline" onClick={() => assign('coach')} disabled={busy}>Assign Coach</Button>
                )}
              </div>
              {isAcademyAdmin && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <Button size="sm" onClick={promoteToAdmin} disabled={busy}>
                    <Crown className="h-3.5 w-3.5" /> Promote to Academy Admin
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Adds Academy Admin access. Existing roles are kept.
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserCog className="h-4 w-4" /> Role assignments</CardTitle>
          <CardDescription>{loadingList ? 'Loading…' : `${assignments.length} assignment(s)`}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No assignments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const targets = targetsFor(a);
                  return (
                    <TableRow key={a.id} className={a.is_active ? '' : 'opacity-60'}>
                      <TableCell>
                        <div className={cn('font-medium', !a.is_active && 'text-muted-foreground line-through')}>
                          {a.user_name || 'Unknown'}
                        </div>
                        <div className="text-xs text-muted-foreground">{a.user_email || a.user_id}</div>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{ROLE_LABEL[a.role_name] || a.role_name}</Badge></TableCell>
                      <TableCell>
                        {a.is_active
                          ? <Badge>Active</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.assigned_date ? new Date(a.assigned_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right">
                        {a.is_active ? (
                          <div className="flex justify-end gap-1">
                            {targets.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" disabled={busy}>
                                    <ArrowLeftRight className="h-3.5 w-3.5" /> Change role <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {targets.map((to) => (
                                    <DropdownMenuItem key={to} onSelect={() => changeRole(a, to)}>
                                      {to === 'app_admin' ? 'Make App Admin' : `Change to ${ROLE_LABEL[to]}`}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {isAcademyAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => revoke(a)} disabled={busy}>Revoke</Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No active actions</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}