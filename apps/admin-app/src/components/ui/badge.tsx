import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-border-2 bg-bg-2 text-text-2',
        brand: 'border-brand/20 bg-brand-pale text-brand-dark',
        success: 'border-green/20 bg-green-light text-green-dark',
        warning: 'border-amber/25 bg-amber-pale text-amber-dark',
        amber: 'border-amber/25 bg-amber-pale text-amber-dark',
        danger: 'border-red-200 bg-red-50 text-red-700',
        info: 'border-blue-200 bg-blue-50 text-blue-700',
        outline: 'border-border-2 bg-transparent text-text-2',
        purple: 'border-purple-200 bg-purple-50 text-purple-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
