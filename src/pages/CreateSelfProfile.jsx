import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentProfileForm from '@/components/StudentProfileForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { academyApi } from '@/lib/academy';
import { useToast } from '@/components/ui/use-toast';

export default function CreateSelfProfile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await academyApi.createSelfProfile(values);
      toast({ title: 'Profile created' });
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
        <h1 className="text-2xl font-heading font-semibold">Create your swimmer profile</h1>
        <p className="text-muted-foreground">This profile represents you as a swimmer.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>Only you and academy admins can see this.</CardDescription>
        </CardHeader>
        <CardContent>
          <StudentProfileForm mode="self" submitting={submitting} onSubmit={onSubmit} onCancel={() => navigate(-1)} />
        </CardContent>
      </Card>
    </div>
  );
}