import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Waves, LayoutDashboard, User, Users, LogOut, GraduationCap } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Layout() {
  const { user, logout } = useAuth();
  const { isAcademyAdmin, isParent, isStudent, error: rolesError, reload: reloadRoles } = useAcademyRoles();
  // An app admin reaches the same role-management page, so the link must show
  // for them too (the page and every backend call re-check authority).
  const isAppAdmin = user?.role === 'admin';
  const navigate = useNavigate();

  const linkClass = ({ isActive }) =>
    cn(
      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Waves className="h-5 w-5" /> Swimflow
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" className={linkClass} end>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </NavLink>
            {/* Academy Admin is additive — a promoted parent/coach keeps their
                own swimmer profiles. Never hide this from them. */}
            {(isParent || isStudent) && (
              <NavLink to="/my-profile" className={linkClass}>
                <User className="h-4 w-4" /> My Profiles
              </NavLink>
            )}
            {(isAcademyAdmin || isAppAdmin) && (
              <NavLink to="/admin-roles" className={linkClass}>
                <Users className="h-4 w-4" /> Roles
              </NavLink>
            )}
            {/* The directory is Academy Admin only — the server refuses the
                built-in platform admin, so the link is not shown to them. */}
            {isAcademyAdmin && (
              <NavLink to="/admin-students" className={linkClass}>
                <GraduationCap className="h-4 w-4" /> Swimmers
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {/* Role lookup failure must be visible — otherwise a promoted admin
                silently loses their admin navigation with no explanation. */}
            {rolesError && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={reloadRoles}>
                Roles unavailable — retry
              </Button>
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.display_name || user?.full_name || user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}