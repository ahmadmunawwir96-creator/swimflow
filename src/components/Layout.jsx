import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  Waves,
  LayoutDashboard,
  User,
  Users,
  LogOut,
  GraduationCap,
  CalendarDays,
  Repeat,
  Menu as MenuIcon,
  X
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Shared layout. Navigation is a single link list rendered two ways: inline from
// md upwards, and as a stacked panel behind a toggle below md. Neither variant can
// push links off screen at 320px — the narrow one is vertical, never a wide row.
export default function Layout() {
  const { user, logout } = useAuth();
  const { isAcademyAdmin, isParent, isStudent, error: rolesError, reload: reloadRoles } = useAcademyRoles();
  // An app admin reaches the same role-management page, so the link must show
  // for them too (the page and every backend call re-check authority).
  const isAppAdmin = user?.role === 'admin';
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // A navigation closes the panel, so the next screen is never hidden behind it.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const displayName = user?.display_name || user?.full_name || user?.email || '';

  const links = [];
  // Academy Admin is additive — a promoted parent/coach keeps their own swimmer
  // profiles. Never hide this from them.
  if (isParent || isStudent) {
    links.push({ to: '/my-profile', label: 'My profiles', icon: User });
  }
  if (isAcademyAdmin || isAppAdmin) {
    links.push({ to: '/admin-roles', label: 'Staff & roles', icon: Users });
  }
  // The directory is Academy Admin only — the server refuses the built-in
  // platform admin, so the link is not shown to them.
  if (isAcademyAdmin) {
    links.push({ to: '/admin-students', label: 'Swimmers', icon: GraduationCap });
  }
  if (isAcademyAdmin) {
    links.push({ to: '/admin/classes', label: 'Schedule', icon: CalendarDays });
  }
  if (isAcademyAdmin) {
    links.push({ to: '/admin/class-groups', label: 'Groups', icon: Repeat });
  }
  // Members get the read-only timetable. Coaches get no schedule link yet —
  // their own view is a later phase.
  if (isParent || isStudent) {
    links.push({ to: '/classes', label: 'Classes', icon: CalendarDays });
  }

  const linkClass = ({ isActive }) =>
    cn(
      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <Waves className="h-5 w-5" aria-hidden="true" /> Swimflow
          </Link>

          <nav className="hidden items-center gap-1 xl:flex" aria-label="Main">
            <NavLink to="/" className={linkClass} end>
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Dashboard
            </NavLink>
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            {/* Role lookup failure must be visible — otherwise a promoted admin
                silently loses their admin navigation with no explanation. */}
            {rolesError && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden text-destructive sm:inline-flex"
                onClick={reloadRoles}
              >
                Roles unavailable — retry
              </Button>
            )}
            <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground 2xl:inline">
              {displayName}
            </span>
            <Button variant="outline" size="sm" className="hidden xl:inline-flex" onClick={() => logout()}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Logout
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <MenuIcon className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {menuOpen && (
          <div
            id="mobile-nav"
            className="border-t xl:hidden"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenuOpen(false);
            }}
          >
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-3" aria-label="Main menu">
              {displayName && (
                <p className="truncate px-3 pb-1 text-xs text-muted-foreground">{displayName}</p>
              )}
              <NavLink to="/" className={linkClass} end>
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Dashboard
              </NavLink>
              {links.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={linkClass}>
                  <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                </NavLink>
              ))}
              {rolesError && (
                <Button variant="ghost" size="sm" className="justify-start text-destructive" onClick={reloadRoles}>
                  Roles unavailable — retry
                </Button>
              )}
              <Button variant="outline" size="sm" className="mt-1 justify-start" onClick={() => logout()}>
                <LogOut className="h-4 w-4" aria-hidden="true" /> Logout
              </Button>
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 py-6 sm:px-4">
        <Outlet />
      </main>
    </div>
  );
}