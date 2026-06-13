import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-bg-2 text-text-2',
        success: 'bg-green-light text-green-dark',
        warning: 'bg-amber-pale text-amber-dark',
        error: 'bg-red-50 text-red-700',
        info: 'bg-blue-50 text-blue-700',
        brand: 'bg-brand-pale text-brand',
        amber: 'bg-amber-pale text-amber-dark',
        outline: 'border border-border-2 text-text-2 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
