import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Waves, LayoutDashboard, User, Users, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Layout() {
  const { user, logout } = useAuth();
  const { isAcademyAdmin, isParent, isStudent } = useAcademyRoles();
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
            {(isParent || isStudent) && !isAcademyAdmin && (
              <NavLink to="/my-profile" className={linkClass}>
                <User className="h-4 w-4" /> My Profiles
              </NavLink>
            )}
            {isAcademyAdmin && (
              <NavLink to="/admin-roles" className={linkClass}>
                <Users className="h-4 w-4" /> Roles
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-2">
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