import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StudentProfileForm from '@/components/StudentProfileForm';
import { academyApi } from '@/lib/academy';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import { useToast } from '@/components/ui/use-toast';
import { Pencil, User, Users, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

function pageItems(p) {
  return Array.isArray(p) ? p : p?.items || [];
}

export default function MyProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isParent } = useAcademyRoles();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const p = await base44.entities.Student.filter(
        { account_id: user.id },
        { sort: '-created_date', limit: 50 }
      );
      setStudents(pageItems(p));
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  const saveEdit = async (values) => {
    setSubmitting(true);
    try {
      await academyApi.updateMyProfile({ student_id: editing.id, ...values });
      toast({ title: 'Profile updated' });
      setEditing(null);
      load();
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold">My swimmer profiles</h1>
          <p className="text-muted-foreground">add something else here</p>
        </div>
        {isParent &&
        <Button asChild size="sm">
            <Link to="/create-dependent"><UserPlus className="h-4 w-4" /> Add dependent</Link>
          </Button>
        }
      </div>

      {loading ?
      <p className="text-muted-foreground">Loading…</p> :
      students.length === 0 ?
      <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No profiles yet. Create a self profile or add a dependent to get started.
          </CardContent>
        </Card> :

      <div className="grid gap-3">
          {students.map((s) =>
        <Card key={s.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {s.ownership_type === 'self' ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                      {s.full_name}
                    </CardTitle>
                    <CardDescription>
                      {s.ownership_type === 'self' ? 'Self-managed' : `Dependent (${s.relationship})`} · DOB {s.date_of_birth}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{s.status}</Badge>
                    <Badge variant="outline" className="capitalize">{(s.consent_status || '').replace('_', ' ')}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground mb-3">
                  {s.gender && <span>Gender: <span className="capitalize text-foreground">{s.gender}</span></span>}
                  {s.swimming_level && <span>Level: <span className="capitalize text-foreground">{s.swimming_level}</span></span>}
                  {s.emergency_contact_name && <span>Emergency: <span className="text-foreground">{s.emergency_contact_name}</span></span>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </CardContent>
            </Card>
        )}
        </div>
      }

      <Dialog open={!!editing} onOpenChange={(o) => {if (!o) setEditing(null);}}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
          {editing &&
          <StudentProfileForm
            mode="edit"
            initialValues={editing}
            submitting={submitting}
            onSubmit={saveEdit}
            onCancel={() => setEditing(null)} />

          }
        </DialogContent>
      </Dialog>
    </div>);

}