import { cn } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import type { OrderStatus } from '@/types';

const STATUS_STYLES: Record<OrderStatus, string> = {
  payment_pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-orange-50 text-orange-700 border-orange-200',
  ready: 'bg-green-light text-green-dark border-green/20',
  collected: 'bg-bg text-text-2 border-border',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-purple-50 text-purple-700 border-purple-200',
};

interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const style = STATUS_STYLES[status as OrderStatus] ?? 'bg-bg text-text-2 border-border';
  const label = ORDER_STATUS_LABELS[status] ?? status;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium',
        style,
        className
      )}
    >
      {label}
    </span>
  );
}
