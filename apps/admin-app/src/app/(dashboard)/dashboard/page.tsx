'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  IndianRupee,
  ShoppingBag,
  Clock,
  Users,
  Loader2,
  Building2,
  Store,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { OrdersChart } from '@/components/dashboard/orders-chart';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyCompact, formatCurrency, formatDateTime } from '@/lib/formatting';
import { useAuthStore } from '@/store/auth-store';
import { useScopeStore } from '@/store/scope-store';
import type { DashboardStats, RevenueDataPoint, Order, Canteen, Institute } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  stats: DashboardStats;
  revenue_over_time: RevenueDataPoint[];
  recent_orders: Order[];
}

interface InstituteOverviewRow extends Institute {
  canteen_count: number;
  today_orders: number;
  admin: { full_name: string | null; email: string } | null;
}

interface CanteenWithStats extends Canteen {
  today_revenue_paise?: number;
  today_orders?: number;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { instituteId, canteenId } = useScopeStore();
  const role = (user as { role?: string } | null)?.role;

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard', instituteId, canteenId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      const { data } = await axios.get('/api/v1/admin/dashboard', { params });
      return data.data;
    },
    refetchInterval: 60 * 1000,
  });

  if (error) {
    return (
      <div className="text-center py-20 text-text-3">
        Failed to load dashboard data.
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Today's Revenue"
          value={stats ? formatCurrencyCompact(stats.today_revenue_paise) : '—'}
          change={stats?.revenue_change_pct}
          icon={<IndianRupee className="w-5 h-5" />}
          iconColor="bg-brand-pale text-brand"
        />
        <StatCard
          label="Orders Today"
          value={stats ? String(stats.today_orders) : '—'}
          change={stats?.orders_change_pct}
          icon={<ShoppingBag className="w-5 h-5" />}
          iconColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Active Orders"
          value={stats ? String(stats.active_orders) : '—'}
          icon={<Clock className="w-5 h-5" />}
          iconColor="bg-amber-pale text-amber"
        />
        {role !== 'staff' && (
          <StatCard
            label="New Users Today"
            value={stats ? String(stats.new_users_today) : '—'}
            icon={<Users className="w-5 h-5" />}
            iconColor="bg-green-light text-green"
          />
        )}
      </div>

      {/* ── Charts Row (not shown for staff) ── */}
      {role !== 'staff' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display tracking-tight">Revenue (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-56 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-text-3" />
                </div>
              ) : (
                <RevenueChart data={data?.revenue_over_time ?? []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display tracking-tight">Orders (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-56 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-text-3" />
                </div>
              ) : (
                <OrdersChart data={data?.revenue_over_time ?? []} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Recent Orders ── */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-tight">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-text-3" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['Order #', 'Customer', 'Amount', 'Status', 'Time'].map((h) => (
                      <th
                        key={h}
                        className="h-10 px-5 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent_orders ?? []).map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border last:border-0 hover:bg-bg-2 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-text-2">
                        {order.order_number}
                      </td>
                      <td className="px-5 py-3 text-text">
                        {order.user?.full_name ?? order.user?.email ?? '—'}
                      </td>
                      <td className="px-5 py-3 font-medium text-text">
                        {formatCurrency(order.total_paise)}
                      </td>
                      <td className="px-5 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-5 py-3 text-text-3 text-xs">
                        {formatDateTime(order.created_at)}
                      </td>
                    </tr>
                  ))}
                  {!data?.recent_orders?.length && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-text-3">
                        No recent orders
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Role-based sections below charts ── */}
      {role === 'super_admin' && <InstituteOverview />}
      {role === 'canteen_admin' && <CanteenOverview />}
    </div>
  );
}

// ─── Institute Overview (super_admin only) ────────────────────────────────────

function InstituteOverview() {
  const { data, isLoading, error } = useQuery<{ data: InstituteOverviewRow[] }>({
    queryKey: ['institutes-overview'],
    queryFn: () => axios.get('/api/v1/admin/institutes').then((r) => r.data),
    refetchInterval: 2 * 60 * 1000,
  });

  const institutes = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Building2 className="w-5 h-5 text-brand" />
        <CardTitle className="font-display tracking-tight">Institutes Overview</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-text-3" />
          </div>
        ) : error ? (
          <p className="px-5 py-6 text-sm text-text-3">Failed to load institutes.</p>
        ) : institutes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-3">No institutes found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Institute', 'City', 'Canteens', "Today's Orders", 'Admin', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="h-10 px-5 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {institutes.map((inst) => (
                  <tr
                    key={inst.id}
                    className="border-b border-border last:border-0 hover:bg-bg-2 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-text">{inst.name}</p>
                      <p className="text-xs text-text-3 font-mono">{inst.code}</p>
                    </td>
                    <td className="px-5 py-3 text-text-2">{inst.city ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 text-text font-medium">
                        <Store className="w-3.5 h-3.5 text-text-3" />
                        {inst.canteen_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text font-medium">{inst.today_orders}</td>
                    <td className="px-5 py-3 text-text-2">
                      {inst.admin ? (
                        <div>
                          <p className="text-text">{inst.admin.full_name ?? inst.admin.email}</p>
                          {inst.admin.full_name && (
                            <p className="text-xs text-text-3">{inst.admin.email}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-3 text-xs italic">Not assigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={inst.is_active ? 'success' : 'danger'}>
                        {inst.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Canteen Overview (canteen_admin only) ────────────────────────────────────

function CanteenOverview() {
  const { data, isLoading, error } = useQuery<{ data: CanteenWithStats[] }>({
    queryKey: ['canteens-overview'],
    queryFn: () => axios.get('/api/v1/admin/canteens').then((r) => r.data),
    refetchInterval: 60 * 1000,
  });

  const canteens = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Store className="w-5 h-5 text-brand" />
        <CardTitle className="font-display tracking-tight">Your Canteens</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-text-3" />
          </div>
        ) : error ? (
          <p className="text-sm text-text-3">Failed to load canteens.</p>
        ) : canteens.length === 0 ? (
          <p className="text-sm text-text-3">No canteens found for your institute.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {canteens.map((canteen) => (
              <div
                key={canteen.id}
                className="rounded-xl border border-border bg-bg-2 p-4 space-y-3"
              >
                {/* Name + open/closed badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-text">{canteen.name}</p>
                    {canteen.location && (
                      <p className="text-xs text-text-3 mt-0.5">{canteen.location}</p>
                    )}
                  </div>
                  <Badge variant={canteen.is_open ? 'success' : 'danger'} className="gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        canteen.is_open ? 'bg-green' : 'bg-red-500'
                      }`}
                    />
                    {canteen.is_open ? 'Open' : 'Closed'}
                  </Badge>
                </div>

                {/* Hours */}
                <p className="text-xs text-text-3">
                  Hours: {canteen.opens_at} – {canteen.closes_at}
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-4 pt-1 border-t border-border">
                  <div>
                    <p className="text-xs text-text-3">Today Revenue</p>
                    <p className="text-sm font-semibold text-text">
                      {canteen.today_revenue_paise != null
                        ? formatCurrencyCompact(canteen.today_revenue_paise)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-3">Orders Today</p>
                    <p className="text-sm font-semibold text-text">
                      {canteen.today_orders ?? '—'}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <Badge variant={canteen.is_active ? 'success' : 'danger'} className="text-xs">
                      {canteen.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
