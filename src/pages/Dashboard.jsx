import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Users, User, ShieldCheck, ArrowRight, Compass } from 'lucide-react';

function pageItems(p) {
  return Array.isArray(p) ? p : (p?.items || []);
}

export default function Dashboard() {
  const { user } = useAuth();
  const { roles, isAcademyAdmin, isParent, loading } = useAcademyRoles();
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const p = await base44.entities.Student.filter(
          { account_id: user.id },
          { sort: '-created_date', limit: 50 }
        );
        setStudents(pageItems(p));
      } catch {
        setStudents([]);
      } finally {
        setLoadingStudents(false);
      }
    })();
  }, [user]);

  const empty = !loadingStudents && students.length === 0 && roles.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-semibold">
          Welcome{user?.full_name ? `, ${user.full_name}` : ''}
        </h1>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {loading ? (
            <Badge variant="secondary">Loading roles…</Badge>
          ) : roles.length ? (
            roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>
            ))
          ) : (
            <Badge variant="outline">No academy role yet</Badge>
          )}
        </div>
      </div>

      {empty && (
        <Card className="border-primary/40">
          <CardContent className="py-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-medium">New here?</p>
              <p className="text-sm text-muted-foreground">Complete onboarding to set up your profile and roles.</p>
            </div>
            <Button asChild>
              <Link to="/onboarding"><Compass className="h-4 w-4" /> Start onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" /> My swimmer profiles</CardTitle>
            <CardDescription>{loadingStudents ? 'Loading…' : `${students.length} profile(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm"><Link to="/my-profile">View profiles <ArrowRight className="h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4" /> Create a self profile</CardTitle>
            <CardDescription>Manage your own swimmer profile</CardDescription>
          </CardHeader>
          <CardContent><Button asChild size="sm"><Link to="/create-self-profile">Create self profile</Link></Button></CardContent>
        </Card>

        {isParent && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Add a dependent</CardTitle>
              <CardDescription>Create a profile for a swimmer you manage</CardDescription>
            </CardHeader>
            <CardContent><Button asChild size="sm"><Link to="/create-dependent">Add dependent</Link></Button></CardContent>
          </Card>
        )}

        {isAcademyAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Role administration</CardTitle>
              <CardDescription>Assign or revoke academy roles</CardDescription>
            </CardHeader>
            <CardContent><Button asChild size="sm"><Link to="/admin-roles">Manage roles</Link></Button></CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}