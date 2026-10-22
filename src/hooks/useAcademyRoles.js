import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

function pageItems(p) {
  return Array.isArray(p) ? p : (p?.items || []);
}

// Loads the current user's active academy roles via client SDK.
// Reads UserRole (RLS permits owner read) and Role (read open) — no new backend
// function needed. UI aid only; all privileged writes stay server-gated.
export function useAcademyRoles() {
  const { user, isAuthenticated } = useAuth();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const urPage = await base44.entities.UserRole.filter(
        { user_id: user.id, is_active: true },
        { limit: 100 }
      );
      const rolePage = await base44.entities.Role.filter({}, { limit: 100 });
      const roleMap = {};
      for (const r of pageItems(rolePage)) roleMap[r.id] = r.name;
      const names = pageItems(urPage)
        .map((a) => roleMap[a.role_id])
        .filter(Boolean);
      setRoles(names);
      setError(null);
    } catch (e) {
      setError(e);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    roles,
    loading,
    error,
    reload: load,
    isAcademyAdmin: roles.includes('admin'),
    isCoach: roles.includes('coach'),
    isParent: roles.includes('parent'),
    isStudent: roles.includes('student')
  };
}