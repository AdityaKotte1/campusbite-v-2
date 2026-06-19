'use client';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

type PrepRow = { menu_item_id: string; name: string; to_cook: number; ready: number };

export function PrepBoard({ canteenId }: { canteenId: string | null }) {
  const { data } = useQuery<{ data: PrepRow[] }>({
    queryKey: ['prep', canteenId],
    queryFn: () => axios.get('/api/v1/admin/orders/prep', { params: { canteen_id: canteenId } }).then((r) => r.data),
    enabled: !!canteenId,
    refetchInterval: 30_000,
  });
  if (!canteenId) return <p className="text-sm text-text-3">Select a canteen to see the prep board.</p>;
  const rows = data?.data ?? [];
  return (
    <section className="bg-surface rounded-xl border border-border p-4">
      <h2 className="font-display text-lg font-semibold mb-3">Prep Board</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-text-3">Nothing to prepare right now.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-text-3 text-xs uppercase">
            <th className="text-left py-1">Item</th><th className="text-right">To cook</th><th className="text-right">Ready</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.menu_item_id} className="border-t border-border">
                <td className="py-1.5">{r.name}</td>
                <td className="text-right font-semibold text-brand">{r.to_cook}</td>
                <td className="text-right text-text-2">{r.ready}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
