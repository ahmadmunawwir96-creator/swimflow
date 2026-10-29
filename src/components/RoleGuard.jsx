import { useAuth } from '@/lib/AuthContext';
import { useAcademyRoles } from '@/hooks/useAcademyRoles';

// UI aid only — never a security boundary. Every privileged write remains
// server-gated in its backend function (caller authorization + RLS).
export default function RoleGuard({
  requireRoles = [],
  requirePlatformAdmin = false,
  fallback = null,
  children
}) {
  const { user } = useAuth();
  const { roles, loading } = useAcademyRoles();

  if (loading) return null;
  if (requirePlatformAdmin && user?.role === 'admin') return children;
  if (requireRoles.some((r) => roles.includes(r))) return children;
  return fallback;
}