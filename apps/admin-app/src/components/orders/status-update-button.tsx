'use client';

import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { VALID_STATUS_TRANSITIONS, ORDER_STATUS_LABELS } from '@/lib/constants';
import type { OrderStatus } from '@/types';

interface StatusUpdateButtonProps {
  orderId: string;
  currentStatus: OrderStatus;
  onUpdate: (orderId: string, newStatus: string) => Promise<void>;
}

export function StatusUpdateButton({
  orderId,
  currentStatus,
  onUpdate,
}: StatusUpdateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];

  if (validTransitions.length === 0) {
    return <span className="text-xs text-text-3">No actions</span>;
  }

  const handleUpdate = async (newStatus: string) => {
    setIsOpen(false);
    setIsLoading(true);
    try {
      await onUpdate(orderId, newStatus);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-1 text-xs font-medium text-text-2 hover:text-text border border-border rounded-md px-2 py-1 hover:bg-bg transition disabled:opacity-60"
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <>
            Update Status
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-36">
            {validTransitions.map((status) => (
              <button
                key={status}
                onClick={() => handleUpdate(status)}
                className="w-full text-left px-3 py-2 text-sm text-text hover:bg-bg transition"
              >
                {ORDER_STATUS_LABELS[status] ?? status}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
