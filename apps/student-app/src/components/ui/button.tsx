import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-brand text-white hover:bg-brand-dark shadow-warm hover:shadow-lg',
        secondary:
          'bg-surface border border-border-2 text-text hover:bg-bg-2 hover:border-text-3',
        ghost:
          'bg-transparent text-text-2 hover:bg-bg-2 hover:text-text',
        outline:
          'border border-brand text-brand bg-transparent hover:bg-brand-pale',
        danger:
          'bg-red-600 text-white hover:bg-red-700 shadow-md hover:shadow-lg',
        'danger-outline':
          'border border-red-300 text-red-600 bg-transparent hover:bg-red-50',
        success:
          'bg-green text-white hover:bg-green-dark shadow-md hover:shadow-lg',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-lg',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    // With asChild, Radix Slot requires a single React element child — so we
    // pass the child through untouched (no spinner injection, no disabled prop).
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
