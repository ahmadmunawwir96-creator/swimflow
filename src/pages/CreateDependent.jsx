import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentProfileForm from '@/components/StudentProfileForm';
import RoleGuard from '@/components/RoleGuard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { academyApi } from '@/lib/academy';
import { useToast } from '@/components/ui/use-toast';

export default function CreateDependent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await academyApi.createDependentProfile(values);
      toast({ title: 'Dependent profile created' });
      navigate('/my-profile');
    } catch (e) {
      toast({ title: 'Could not create profile', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-semibold">Add a dependent</h1>
        <p className="text-muted-foreground">Create a swimmer profile for someone you manage.</p>
      </div>
      <RoleGuard
        requireRoles={['parent']}
        fallback={
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              A verified parent academy role is required to add a dependent. Ask an academy admin to assign it.
            </CardContent>
          </Card>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Dependent details</CardTitle>
            <CardDescription>You can add children, wards, or siblings.</CardDescription>
          </CardHeader>
          <CardContent>
            <StudentProfileForm mode="dependent" submitting={submitting} onSubmit={onSubmit} onCancel={() => navigate(-1)} />
          </CardContent>
        </Card>
      </RoleGuard>
    </div>
  );
}