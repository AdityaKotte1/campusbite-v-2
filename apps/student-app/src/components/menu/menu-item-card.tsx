'use client';

import Image from 'next/image';
import { Plus, Minus, Clock, UtensilsCrossed } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem } from '@/types';
import { formatPrice, formatDuration } from '@/lib/formatting';
import { useCartStore } from '@/store/cart-store';
import { useUIStore } from '@/store/ui-store';
import { cn } from '@/lib/utils';

interface MenuItemCardProps {
  item: MenuItem;
  disabled?: boolean;
  className?: string;
}

export function MenuItemCard({ item, disabled = false, className }: MenuItemCardProps) {
  const { items, addItem, removeItem, updateQuantity } = useCartStore();
  const showToast = useUIStore((s) => s.showToast);

  const cartEntry = items.find((ci) => ci.menuItem.id === item.id);
  const quantity = cartEntry?.quantity ?? 0;

  const isVeg = item.is_veg ?? false;

  function handleAdd() {
    if (disabled) {
      showToast('This canteen is currently closed', 'error');
      return;
    }
    if (!item.is_available) {
      showToast('This item is currently unavailable', 'error');
      return;
    }
    const result = addItem(item);
    if (!result.ok) {
      showToast(result.reason ?? 'This item can’t be added to your cart', 'error');
    }
  }

  function handleDecrease() {
    if (quantity === 1) {
      removeItem(item.id);
    } else {
      updateQuantity(item.id, quantity - 1);
    }
  }

  function handleIncrease() {
    if (quantity >= 10) {
      showToast('Maximum 10 of the same item per order', 'info');
      return;
    }
    updateQuantity(item.id, quantity + 1);
  }

  return (
    <div
      className={cn(
        'group bg-surface rounded-xl border border-border overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg hover:border-border-2',
        (!item.is_available || disabled) && 'opacity-60',
        className
      )}
    >
      {/* Image */}
      <div className="relative w-full aspect-[4/3] bg-bg-2 overflow-hidden">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 200px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-amber-pale">
            <UtensilsCrossed className="w-8 h-8 text-amber/60" strokeWidth={1.5} />
          </div>
        )}

        {/* Unavailable overlay */}
        {!item.is_available && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-xs font-semibold text-text-2 bg-white px-2 py-1 rounded-lg shadow-sm">
              Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        {/* Veg/Non-veg indicator + name */}
        <div className="flex items-start gap-1.5 mb-1">
          <span
            className={cn(
              'mt-0.5 flex-shrink-0 w-3 h-3 rounded-sm border-2 flex items-center justify-center',
              isVeg
                ? 'border-green'
                : 'border-red-500'
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isVeg ? 'bg-green' : 'bg-red-500'
              )}
            />
          </span>
          <h3 className="text-xs font-semibold text-text leading-tight line-clamp-2 flex-1">
            {item.name}
          </h3>
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-[11px] text-text-3 mb-1.5 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}

        {/* Prep time */}
        {item.prep_time_minutes > 0 && (
          <div className="flex items-center gap-1 text-text-3 mb-2">
            <Clock className="w-2.5 h-2.5" />
            <span className="text-[11px]">{formatDuration(item.prep_time_minutes)}</span>
          </div>
        )}

        {/* Price + Add button */}
        <div className="flex items-center justify-between mt-auto">
          <span className="font-display text-base font-semibold text-text tabular-nums">
            {formatPrice(item.price_paise)}
          </span>

          <AnimatePresence mode="wait">
            {quantity === 0 ? (
              <motion.button
                key="add"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={handleAdd}
                disabled={!item.is_available || disabled}
                className="w-7 h-7 bg-brand text-white rounded-lg flex items-center justify-center hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.div
                key="controls"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 bg-brand-pale rounded-lg p-0.5"
              >
                <button
                  onClick={handleDecrease}
                  className="w-6 h-6 bg-brand text-white rounded-md flex items-center justify-center hover:bg-brand-dark transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-bold text-brand w-4 text-center">
                  {quantity}
                </span>
                <button
                  onClick={handleIncrease}
                  disabled={quantity >= 10}
                  className="w-6 h-6 bg-brand text-white rounded-md flex items-center justify-center hover:bg-brand-dark disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
