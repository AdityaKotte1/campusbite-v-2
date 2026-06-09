'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatChartDate } from '@/lib/formatting';
import type { RevenueDataPoint } from '@/types';

interface OrdersChartProps {
  data: RevenueDataPoint[];
}

function CustomTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !payload || !(payload as unknown[]).length) return null;
  const p = (payload as { value: number }[])[0];
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-md text-sm">
      <p className="text-text-2 text-xs mb-0.5">{label as string}</p>
      <p className="font-semibold text-text">{p.value} orders</p>
    </div>
  );
}

export function OrdersChart({ data }: OrdersChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    date: formatChartDate(d.date),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#999' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#999' }}
          axisLine={false}
          tickLine={false}
          width={35}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="orders"
          stroke="#00A877"
          strokeWidth={2}
          dot={{ r: 3, fill: '#00A877' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
