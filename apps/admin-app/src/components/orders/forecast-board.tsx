'use client';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

type FRow = { menu_item_id: string; name: string; predicted: number | null; basis: string };
type FData = { today: FRow[]; tomorrow: FRow[] };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ForecastBoard({ canteenId }: { canteenId: string | null }) {
  const { data } = useQuery<{ data: FData }>({
    queryKey: ['forecast', canteenId],
    queryFn: () =>
      axios.get('/api/v1/admin/orders/forecast', { params: { canteen_id: canteenId, date: todayStr() } }).then((r) => r.data),
    enabled: !!canteenId,
  });
  if (!canteenId) return null;
  const today = data?.data.today ?? [];
  const tomorrow = data?.data.tomorrow ?? [];
  const cell = (r: FRow) => (r.predicted == null ? <span className="text-text-3">Not enough data yet</span> : <span className="font-semibold">{r.predicted}</span>);
  return (
    <section className="bg-surface rounded-xl border border-border p-4">
      <h2 className="font-display text-lg font-semibold mb-1">Forecast</h2>
      <p className="text-xs text-text-3 mb-3">Based on this canteen&apos;s recent order history.</p>
      <div className="grid grid-cols-2 gap-6">
        {([['Today', today], ['Tomorrow', tomorrow]] as const).map(([label, rows]) => (
          <div key={label}>
            <p className="text-xs font-semibold uppercase text-text-3 mb-1">{label}</p>
            {rows.length === 0 ? <p className="text-sm text-text-3">No history.</p> : (
              <ul className="text-sm space-y-1">
                {rows.map((r) => <li key={r.menu_item_id} className="flex justify-between"><span>{r.name}</span>{cell(r)}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
