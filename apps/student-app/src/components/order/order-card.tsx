'use client';

import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatRelativeTime } from '@/lib/formatting';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import type { Order } from '@/types';
import { cn } from '@/lib/utils';

interface OrderCardProps {
  order: Order;
  isActive?: boolean;
}

export function OrderCard({ order, isActive = false }: OrderCardProps) {
  const statusBadgeVariant = (() => {
    switch (order.status) {
      case 'ready':
        return 'success';
      case 'confirmed':
      case 'preparing':
        return 'warning';
      case 'cancelled':
      case 'payment_failed':
        return 'error';
      case 'collected':
        return 'default';
      default:
        return 'brand';
    }
  })();

  const itemsPreview = order.items?.slice(0, 3).map((i) => i.name).join(', ');
  const extraItems = (order.items?.length ?? 0) - 3;

  return (
    <Link href={`/orders/${order.id}`} className="block">
      <div
        className={cn(
          'bg-surface rounded-2xl border overflow-hidden transition-all duration-200',
          'hover:shadow-md active:scale-[0.99] cursor-pointer',
          isActive
            ? 'border-brand/40 shadow-sm'
            : 'border-border'
        )}
      >
        {/* Active indicator strip */}
        {isActive && (
          <div className="h-1 bg-brand" />
        )}

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-display font-semibold tracking-tight text-sm text-text tabular-nums">{order.order_number}</p>
                {isActive && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand">
                    <span className="inline-block w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-xs text-text-2 mt-0.5">
                {order.canteen?.name ?? 'Canteen'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant={statusBadgeVariant}>
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </Badge>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </div>
          </div>

          {/* Items preview */}
          {itemsPreview && (
            <p className="text-xs text-text-2 mb-2 line-clamp-1">
              {itemsPreview}
              {extraItems > 0 && ` +${extraItems} more`}
            </p>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-text-3">
              <Clock className="w-3 h-3" />
              <span className="text-xs tabular-nums">{formatRelativeTime(order.created_at)}</span>
            </div>
            <span className="font-display font-semibold tracking-tight text-base text-text tabular-nums">
              {formatPrice(order.total_paise)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
