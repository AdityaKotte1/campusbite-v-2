'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, RefreshCw } from 'lucide-react';
import { OrderCard } from '@/components/order/order-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ACTIVE_ORDER_STATUSES, POLLING_INTERVAL_MS } from '@/lib/constants';
import type { Order } from '@/types';

async function fetchOrders(): Promise<Order[]> {
  const res = await fetch('/api/v1/orders');
  if (!res.ok) throw new Error('Failed to fetch orders');
  const json = await res.json();
  return json.data;
}

export default function OrdersPage() {
  const { data: orders, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
    refetchInterval: POLLING_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const activeOrders = orders?.filter((o) =>
    ACTIVE_ORDER_STATUSES.includes(o.status)
  ) ?? [];

  const pastOrders = orders?.filter(
    (o) => !ACTIVE_ORDER_STATUSES.includes(o.status)
  ) ?? [];

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="eyebrow mb-1">Your activity</p>
          <h1 className="font-display font-semibold tracking-tight text-2xl text-text">My Orders</h1>
          <div className="rule-amber mt-2" />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh orders"
          className="p-2 rounded-full text-text-3 hover:text-brand hover:bg-brand-pale transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <p className="text-text-2 text-sm mb-3">Failed to load orders</p>
          <button
            onClick={() => refetch()}
            className="text-sm text-brand font-medium hover:text-brand-dark cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="space-y-6">
          {/* Active Orders */}
          {activeOrders.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="status-dot-open" />
                <h2 className="eyebrow">Active Orders</h2>
              </div>
              <div className="space-y-3">
                {activeOrders.map((order) => (
                  <OrderCard key={order.id} order={order} isActive />
                ))}
              </div>
            </section>
          )}

          {/* Past Orders */}
          {pastOrders.length > 0 && (
            <section>
              <h2 className="eyebrow mb-3">Past Orders</h2>
              <div className="space-y-3">
                {pastOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-amber-pale rounded-full flex items-center justify-center mb-5">
            <Receipt className="w-9 h-9 text-amber-dark" />
          </div>
          <h2 className="font-display font-semibold tracking-tight text-2xl text-text mb-2">No orders yet</h2>
          <p className="text-text-2 text-sm mb-6">
            Your order history will appear here once you place your first order.
          </p>
          <Button size="lg" asChild className="cursor-pointer">
            <a href="/canteens">Browse Canteens</a>
          </Button>
        </div>
      )}
    </div>
  );
}
