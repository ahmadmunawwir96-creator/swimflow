import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

// Loads the current user's active academy roles from the backend.
//
// Why a backend function instead of two client reads: the previous version
// filtered UserRole + Role directly from the browser. Any read that failed or
// came back empty silently produced roles = [] — so a promoted Academy Admin
// simply lost the admin navigation and dashboard options with no error shown,
// and the result could differ between a refresh and a fresh login. The function
// resolves the same records server-side with the service role, so recognition is
// consistent and matches exactly what the server gates check.
//
// UI aid only; every privileged write stays server-gated.
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
      const res = await base44.functions.invoke('getMyAcademyRoles', {});
      const next = Array.isArray(res?.data?.roles) ? res.data.roles : [];
      setRoles(next);
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