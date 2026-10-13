import React from 'react';
import { Link } from 'react-router-dom';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Users, ShieldCheck } from 'lucide-react';

export default function Onboarding() {
  const { isAcademyAdmin, isParent, loading } = useAcademyRoles();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-heading font-semibold">Let's get you set up</h1>
        <p className="text-muted-foreground mt-1">
          Tell us how you'll use Swimflow. Parents can also hold a self-managed swimmer profile.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" /> I'm a swimmer</CardTitle>
            <CardDescription>Create a self-managed profile to book classes and track progress.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link to="/create-self-profile">Create my profile</Link></Button></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> I'm a parent/guardian</CardTitle>
            <CardDescription>
              {isParent ? 'Add and manage swimmer profiles for your children.' : 'An academy admin must assign you the parent role first.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isParent ? (
              <Button asChild><Link to="/create-dependent">Add a dependent</Link></Button>
            ) : (
              <Button variant="outline" disabled>Parent role required</Button>
            )}
          </CardContent>
        </Card>

        {isAcademyAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Academy admin</CardTitle>
              <CardDescription>Assign roles to members of your academy.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild variant="outline"><Link to="/admin-roles">Manage roles</Link></Button></CardContent>
          </Card>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Detecting your roles…</p>}
    </div>
  );
}