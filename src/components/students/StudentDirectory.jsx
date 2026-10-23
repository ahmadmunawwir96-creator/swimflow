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
import { Search, Users, ShieldAlert, RefreshCw } from 'lucide-react';

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
  const [query, setQuery] = useState({ search: '', status: 'all' });
  const [students, setStudents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const res = await academyApi.listStudents({
        search: query.search,
        status: query.status,
        limit: PAGE_SIZE
      });
      setStudents(Array.isArray(res?.students) ? res.students : []);
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
    setError(null);
    try {
      const res = await academyApi.listStudents({
        search: query.search,
        status: query.status,
        limit: PAGE_SIZE,
        cursor
      });
      setStudents((prev) => [...prev, ...(res?.students || [])]);
      setCursor(res?.next_cursor || null);
      setHasMore(!!res?.has_more);
    } catch (e) {
      setError(e.message || 'More swimmers could not be loaded.');
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
    setQuery({ search: '', status: 'all' });
  };

  const filtered = !!query.search || query.status !== 'all';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-brand" /> Swimmer profiles
        </CardTitle>
        <CardDescription>
          Academy-wide directory. Medical notes, emergency contacts and payment details are not
          shown here.
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
          <Button variant="outline" onClick={reset} disabled={!filtered && !searchInput}>
            <RefreshCw className="h-4 w-4" /> Reset
          </Button>
        </div>

        {loading ? (
          <DirectoryNotice loading title="Loading swimmers…" />
        ) : denied ? (
          <DirectoryNotice
            icon={<ShieldAlert className="h-6 w-6" />}
            title="Academy administrators only"
            description="You do not have permission to browse academy-wide swimmer profiles."
          />
        ) : error ? (
          <DirectoryNotice
            icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
            title="Directory unavailable"
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
            </div>
            <StudentTable students={students} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {hasMore && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
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