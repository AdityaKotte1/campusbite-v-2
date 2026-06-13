import * as React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-gradient-to-r from-bg-2 via-border to-bg-2 bg-[length:200%_100%] rounded-md',
        className
      )}
      style={{
        animation: 'skeleton-loading 1.5s ease-in-out infinite',
      }}
      {...props}
    />
  );
}

// Preset skeleton shapes
function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4 rounded',
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-surface rounded-xl border border-border p-4 space-y-3', className)}>
      <Skeleton className="w-full h-32 rounded-xl" />
      <SkeletonText lines={2} />
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-20 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
