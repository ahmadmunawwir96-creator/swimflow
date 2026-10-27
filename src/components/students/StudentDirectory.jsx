import React, { useCallback, useEffect, useState } from 'react';
import { academyApi } from '@/lib/academy';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import DirectoryNotice from '@/components/students/DirectoryNotice';
import StudentTable from '@/components/students/StudentTable';
import StudentCardList from '@/components/students/StudentCardList';
import { Search, Users, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'left', label: 'Left' }
];

// Every read goes through the authorized server function — this component never
// queries the Student entity directly, so an unauthorized viewer gets a refusal
// from the server rather than a client-side query.
export default function StudentDirectory() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState({ search: '', status: 'all', branch: '' });
  const [branches, setBranches] = useState([]);
  const [scope, setScope] = useState(null);
  const [students, setStudents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [moreError, setMoreError] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMoreError(null);
    setDenied(false);
    try {
      const res = await academyApi.listStudents({
        search: query.search,
        status: query.status,
        branch_id: query.branch || '',
        limit: PAGE_SIZE
      });
      setStudents(Array.isArray(res?.students) ? res.students : []);
      setBranches(Array.isArray(res?.branches) ? res.branches : []);
      setScope(res?.scope || null);
      setCursor(res?.next_cursor || null);
      setHasMore(!!res?.has_more);
    } catch (e) {
      if (e.status === 401 || e.status === 403) setDenied(true);
      else setError(e.message || 'The student directory could not be loaded.');
      setStudents([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await academyApi.listStudents({
        search: query.search,
        status: query.status,
        branch_id: query.branch || '',
        limit: PAGE_SIZE,
        cursor
      });
      setStudents((prev) => [...prev, ...(res?.students || [])]);
      setCursor(res?.next_cursor || null);
      setHasMore(!!res?.has_more);
    } catch (e) {
      // Keeps the swimmers already on screen — only the extra page failed.
      setMoreError(e.message || 'More swimmers could not be loaded right now.');
    } finally {
      setLoadingMore(false);
    }
  };

  const submitSearch = (e) => {
    e.preventDefault();
    setQuery((q) => ({ ...q, search: searchInput.trim() }));
  };

  const reset = () => {
    setSearchInput('');
    setQuery({ search: '', status: 'all', branch: '' });
  };

  const filtered = !!query.search || query.status !== 'all' || !!query.branch;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-brand" /> Students
        </CardTitle>
        <CardDescription>
          Swimmers in your authorized branches. Open a swimmer to see their full profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <form onSubmit={submitSearch} className="flex gap-2 flex-1">
            <Input
              placeholder="Search swimmer by name"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search swimmer by name"
            />
            <Button type="submit" className="bg-brand text-brand-foreground hover:opacity-90">
              <Search className="h-4 w-4" /> Search
            </Button>
          </form>
          <Select value={query.status} onValueChange={(v) => setQuery((q) => ({ ...q, status: v }))}>
            <SelectTrigger className="sm:w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {branches.length > 1 && (
            <Select
              value={query.branch || 'all'}
              onValueChange={(v) => setQuery((q) => ({ ...q, branch: v === 'all' ? '' : v }))}
            >
              <SelectTrigger className="sm:w-48" aria-label="Filter by branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={reset} disabled={!filtered && !searchInput}>
            <RefreshCw className="h-4 w-4" /> Reset
          </Button>
        </div>

        {loading ? (
          <DirectoryNotice loading title="Loading swimmers…" />
        ) : denied ? (
          <DirectoryNotice
            icon={<ShieldAlert className="h-6 w-6" />}
            title="Admins only"
            description="You do not have permission to browse swimmer profiles."
          />
        ) : error ? (
          <DirectoryNotice
            icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
            title="Directory temporarily unavailable"
            description={error}
            actionLabel="Try again"
            onAction={load}
          />
        ) : students.length === 0 ? (
          <DirectoryNotice
            icon={<Users className="h-6 w-6" />}
            title={filtered ? 'No swimmers match these filters' : 'No swimmers yet'}
            description={
              filtered
                ? 'Try a different name or status.'
                : 'Swimmer profiles appear here once members complete onboarding.'
            }
            actionLabel={filtered ? 'Clear filters' : null}
            onAction={filtered ? reset : null}
          />
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {students.length} swimmer{students.length === 1 ? '' : 's'}
                {query.search ? ` matching “${query.search}”` : ''}
              </span>
              {scope && (
                <span>
                  {scope.all_branches
                    ? 'All branches'
                    : branches.map((b) => b.name).join(', ') || 'No branch in scope'}
                </span>
              )}
            </div>
            {/* Phone: compact list, no horizontal scrolling. Tablet and up: the table. */}
            <div className="md:hidden">
              <StudentCardList students={students} />
            </div>
            <div className="hidden md:block">
              <StudentTable students={students} />
            </div>
            {moreError && (
              <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {moreError}
                </p>
                <Button size="sm" variant="outline" onClick={loadMore}>
                  Try again
                </Button>
              </div>
            )}
            {hasMore && !moreError && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full sm:w-auto"
                >
                  {loadingMore ? 'Loading…' : 'Load more swimmers'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}