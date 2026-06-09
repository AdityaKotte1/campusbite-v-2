'use client';

import { CheckCircle2, Circle, Clock, Package, Utensils, ShoppingBag } from 'lucide-react';
import type { Order, OrderStatus } from '@/types';
import { formatDate } from '@/lib/formatting';
import { cn } from '@/lib/utils';

interface OrderTrackerProps {
  order: Order;
}

interface TimelineStep {
  status: OrderStatus;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const TIMELINE_STEPS: TimelineStep[] = [
  {
    status: 'confirmed',
    label: 'Order Confirmed',
    description: 'Your order has been accepted',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  {
    status: 'preparing',
    label: 'Being Prepared',
    description: 'The canteen is preparing your food',
    icon: <Utensils className="w-4 h-4" />,
  },
  {
    status: 'ready',
    label: 'Ready for Pickup',
    description: 'Your order is ready! Show your QR code',
    icon: <Package className="w-4 h-4" />,
  },
  {
    status: 'collected',
    label: 'Collected',
    description: 'Enjoy your meal!',
    icon: <ShoppingBag className="w-4 h-4" />,
  },
];

const STATUS_ORDER: OrderStatus[] = [
  'payment_pending',
  'confirmed',
  'preparing',
  'ready',
  'collected',
];

function getStepState(
  stepStatus: OrderStatus,
  currentStatus: OrderStatus
): 'completed' | 'current' | 'upcoming' {
  if (
    currentStatus === 'cancelled' ||
    currentStatus === 'payment_failed' ||
    currentStatus === 'refunded'
  ) {
    return 'upcoming';
  }

  const stepIdx = STATUS_ORDER.indexOf(stepStatus);
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  if (stepIdx < currentIdx) return 'completed';
  if (stepIdx === currentIdx) return 'current';
  return 'upcoming';
}

export function OrderTracker({ order }: OrderTrackerProps) {
  const isTerminal = ['cancelled', 'payment_failed', 'refunded'].includes(order.status);

  return (
    <div className="bg-white rounded-2xl border border-border p-4">
      {/* Special states */}
      {isTerminal && (
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl mb-4',
            order.status === 'refunded'
              ? 'bg-purple-50 border border-purple-200'
              : 'bg-red-50 border border-red-200'
          )}
        >
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
              order.status === 'refunded' ? 'bg-purple-100' : 'bg-red-100'
            )}
          >
            <span className="text-base">
              {order.status === 'refunded' ? '↩️' : '✕'}
            </span>
          </div>
          <div>
            <p
              className={cn(
                'text-sm font-semibold',
                order.status === 'refunded' ? 'text-purple-700' : 'text-red-700'
              )}
            >
              {order.status === 'cancelled'
                ? 'Order Cancelled'
                : order.status === 'refunded'
                ? 'Refund Initiated'
                : 'Payment Failed'}
            </p>
            {order.cancellation_reason && (
              <p className="text-xs text-text-2 mt-0.5">{order.cancellation_reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />

        <div className="space-y-5">
          {TIMELINE_STEPS.map((step, index) => {
            const state = getStepState(step.status, order.status);
            const isLast = index === TIMELINE_STEPS.length - 1;

            return (
              <div key={step.status} className="relative flex items-start gap-4 pl-0">
                {/* Step indicator */}
                <div
                  className={cn(
                    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all',
                    state === 'completed' &&
                      'bg-green border-green text-white',
                    state === 'current' &&
                      'bg-brand border-brand text-white shadow-md',
                    state === 'upcoming' &&
                      'bg-white border-border text-text-3'
                  )}
                >
                  {state === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : state === 'current' ? (
                    <div className="relative">
                      {step.icon}
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping opacity-75" />
                    </div>
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </div>

                {/* Step content */}
                <div className={cn('flex-1 pb-1', !isLast && 'pb-0')}>
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      state === 'completed' && 'text-green',
                      state === 'current' && 'text-brand',
                      state === 'upcoming' && 'text-text-3'
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      'text-xs mt-0.5',
                      state === 'upcoming' ? 'text-text-3' : 'text-text-2'
                    )}
                  >
                    {step.description}
                  </p>
                  {state === 'current' && order.estimated_ready_at && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-brand" />
                      <span className="text-xs text-brand font-medium">
                        Est. {formatDate(order.estimated_ready_at)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ready state — prominent call to action */}
      {order.status === 'ready' && (
        <div className="mt-4 p-3 bg-green-light border border-green/30 rounded-xl">
          <p className="text-sm font-bold text-green-dark text-center">
            Your order is ready! Show your QR code to collect.
          </p>
        </div>
      )}
    </div>
  );
}
