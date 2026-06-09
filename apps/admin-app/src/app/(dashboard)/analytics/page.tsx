'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatChartDate } from '@/lib/formatting';
import type { AnalyticsData } from '@/types';

const DAYS_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

const PIE_COLORS = ['#E8390E', '#00A877', '#3B82F6', '#F59E0B', '#8B5CF6'];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<{ data: AnalyticsData }>({
    queryKey: ['analytics', days],
    queryFn: () => axios.get(`/api/v1/admin/analytics?days=${days}`).then((r) => r.data),
  });

  const analytics = data?.data;

  const revenueData = (analytics?.revenue_over_time ?? []).map((d) => ({
    ...d,
    date: formatChartDate(d.date),
    revenue: d.revenue_paise / 100,
  }));

  const topItems = analytics?.top_items ?? [];
  const hourlyOrders = (analytics?.orders_by_hour ?? []).map((d) => ({
    ...d,
    label: `${d.hour}:00`,
  }));
  const paymentMethods = analytics?.payment_methods ?? [];

  return (
    <div className="space-y-6">
      {/* Date Range */}
      <div className="flex items-center gap-3">
        {DAYS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              days === opt.value
                ? 'bg-brand text-white'
                : 'bg-surface border border-border text-text-2 hover:text-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Revenue over time */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-text-3" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={revenueData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: number) => [`₹${v.toFixed(0)}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#E8390E" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top Items */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Items by Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-text-3" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topItems} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip />
                  <Bar dataKey="total_orders" fill="#E8390E" radius={[0, 4, 4, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Orders by Hour */}
        <Card>
          <CardHeader>
            <CardTitle>Orders by Hour of Day</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-text-3" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hourlyOrders} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} width={35} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#00A877" radius={[4, 4, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col lg:flex-row items-center gap-8">
          {isLoading ? (
            <div className="h-48 w-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-text-3" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width={240} height={200}>
                <PieChart>
                  <Pie
                    data={paymentMethods}
                    dataKey="count"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={false}
                  >
                    {paymentMethods.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 flex-1">
                {paymentMethods.map((pm, i) => (
                  <div key={pm.method} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-sm font-medium text-text capitalize">{pm.method}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text">{pm.count} orders</p>
                      <p className="text-xs text-text-3">{formatCurrency(pm.total_paise)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
