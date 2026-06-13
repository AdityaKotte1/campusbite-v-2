import { Badge, type BadgeProps } from '@/components/ui/badge';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import type { OrderStatus } from '@/types';

const STATUS_VARIANTS: Record<OrderStatus, BadgeProps['variant']> = {
  payment_pending: 'warning',
  confirmed: 'info',
  preparing: 'brand',
  ready: 'success',
  collected: 'default',
  cancelled: 'danger',
  refunded: 'purple',
};

interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const variant = STATUS_VARIANTS[status as OrderStatus] ?? 'default';
  const label = ORDER_STATUS_LABELS[status] ?? status;

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
