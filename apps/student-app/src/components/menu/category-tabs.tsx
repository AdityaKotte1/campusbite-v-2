'use client';

import { useRef } from 'react';
import type { Category } from '@/types';
import { cn } from '@/lib/utils';

interface CategoryTabsProps {
  categories: Category[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function CategoryTabs({ categories, selectedId, onSelect }: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleSelect(id: string) {
    onSelect(id);
    // Scroll selected tab into view
    const container = scrollRef.current;
    if (container) {
      const btn = container.querySelector(`[data-category="${id}"]`) as HTMLButtonElement;
      if (btn) {
        const containerRect = container.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const scrollLeft = container.scrollLeft + btnRect.left - containerRect.left - containerRect.width / 2 + btnRect.width / 2;
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }

  if (categories.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto scrollbar-hide"
    >
      {categories.map((category) => {
        const isSelected = category.id === selectedId;
        return (
          <button
            key={category.id}
            data-category={category.id}
            onClick={() => handleSelect(category.id)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
              isSelected
                ? 'bg-brand text-white shadow-sm'
                : 'bg-white border border-border text-text-2 hover:border-brand-light hover:text-brand'
            )}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
