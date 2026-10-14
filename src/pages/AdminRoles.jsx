import React, { useEffect, useState } from 'react';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
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
import { academyApi } from '@/lib/academy';
import { useToast } from '@/components/ui/use-toast';
import { Search, ShieldCheck, UserCog } from 'lucide-react';

export default function AdminRoles() {
  const { isAcademyAdmin, loading: rolesLoading } = useAcademyRoles();
  const { toast } = useToast();
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
    if (isAcademyAdmin) loadList();
    else setLoadingList(false);
  }, [isAcademyAdmin]);

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
      toast({ title: `Assigned ${role_name} role` });
      loadList();
    } catch (e) {
      toast({ title: 'Assignment failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (a) => {
    if (!confirm(`Revoke ${a.role_name} role from this user?`)) return;
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

  if (rolesLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isAcademyAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Academy administrator authority is required to manage roles.
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
        <p className="text-muted-foreground">Find a member by email and assign or revoke academy roles.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> Find a member</CardTitle>
          <CardDescription>Search by email to assign a role.</CardDescription>
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
            <div className="rounded-md border p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium">{found.full_name || 'Unknown'}</span> · {found.email}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => assign('student')} disabled={busy}>Assign student</Button>
                <Button size="sm" variant="outline" onClick={() => assign('parent')} disabled={busy}>Assign parent</Button>
                <Button size="sm" variant="outline" onClick={() => assign('coach')} disabled={busy}>Assign coach</Button>
                <Button size="sm" variant="outline" onClick={() => assign('admin')} disabled={busy}>Assign admin</Button>
              </div>
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.user_name || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">{a.user_email || a.user_id}</div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{a.role_name}</Badge></TableCell>
                    <TableCell><Badge variant={a.is_active ? 'default' : 'outline'}>{a.is_active ? 'active' : 'inactive'}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.assigned_date ? new Date(a.assigned_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>{a.is_active && <Button size="sm" variant="ghost" onClick={() => revoke(a)} disabled={busy}>Revoke</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}