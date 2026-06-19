'use client';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useScopeStore } from '@/store/scope-store';

type Inst = { id: string; name: string };
type Canteen = { id: string; name: string; institute_id?: string };

export function ScopeSelector() {
  const { instituteId, canteenId, setInstitute, setCanteen } = useScopeStore();

  const { data: institutes } = useQuery<{ data: Inst[] }>({
    queryKey: ['scope-institutes'],
    queryFn: () => axios.get('/api/v1/admin/institutes').then((r) => r.data),
  });
  const { data: canteens } = useQuery<{ data: Canteen[] }>({
    queryKey: ['scope-canteens', instituteId],
    queryFn: () =>
      axios
        .get('/api/v1/admin/canteens', { params: instituteId ? { institute_id: instituteId } : {} })
        .then((r) => r.data),
  });

  const sel = 'h-9 px-2 rounded-lg border border-border bg-surface text-sm text-text';
  return (
    <div className="flex items-center gap-2">
      <select className={sel} value={instituteId ?? ''} onChange={(e) => setInstitute(e.target.value || null)}>
        <option value="">All institutes</option>
        {(institutes?.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <select className={sel} value={canteenId ?? ''} onChange={(e) => setCanteen(e.target.value || null)}>
        <option value="">All canteens</option>
        {(canteens?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
