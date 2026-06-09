'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Star, Clock, MapPin } from 'lucide-react';
import type { Canteen } from '@/types';
import { cn } from '@/lib/utils';

interface CanteenCardProps {
  canteen: Canteen;
  className?: string;
}

export function CanteenCard({ canteen, className }: CanteenCardProps) {
  return (
    <Link href={`/menu/${canteen.id}`} className="block">
      <div
        className={cn(
          'bg-white rounded-2xl border border-border overflow-hidden',
          'hover:shadow-md hover:border-border-2 transition-all duration-200 active:scale-[0.99]',
          className
        )}
      >
        <div className="flex gap-0">
          {/* Image */}
          <div className="relative w-28 h-28 flex-shrink-0">
            {canteen.image_url ? (
              <Image
                src={canteen.image_url}
                alt={canteen.name}
                fill
                className="object-cover"
                sizes="112px"
              />
            ) : (
              <div className="w-full h-full bg-brand-pale flex items-center justify-center">
                <svg className="w-10 h-10 text-brand opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-3 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-bold text-text leading-tight line-clamp-2">
                {canteen.name}
              </h3>
              <span
                className={cn(
                  'flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  canteen.is_open
                    ? 'bg-green-light text-green-dark'
                    : 'bg-gray-100 text-gray-500'
                )}
              >
                {canteen.is_open ? 'Open' : 'Closed'}
              </span>
            </div>

            {/* Rating */}
            {canteen.rating > 0 && (
              <div className="flex items-center gap-1 mb-1.5">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="text-xs font-medium text-text">
                  {canteen.rating.toFixed(1)}
                </span>
                {canteen.total_reviews > 0 && (
                  <span className="text-xs text-text-3">({canteen.total_reviews})</span>
                )}
              </div>
            )}

            {/* Hours */}
            {canteen.opens_at && (
              <div className="flex items-center gap-1 text-text-3 mb-1.5">
                <Clock className="w-3 h-3" />
                <span className="text-xs">{canteen.opens_at} – {canteen.closes_at}</span>
              </div>
            )}

            {/* Location */}
            {canteen.location && (
              <div className="flex items-center gap-1 text-text-3">
                <MapPin className="w-3 h-3" />
                <span className="text-xs truncate">{canteen.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
