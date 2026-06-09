import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  iconColor?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  change,
  icon,
  iconColor = 'bg-brand-pale text-brand',
  className,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div
      className={cn(
        'bg-surface rounded-xl border border-border p-5 shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-text-2">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconColor)}>
          {icon}
        </div>
      </div>

      <div className="text-2xl font-bold text-text mb-1">{value}</div>

      {change !== undefined && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            isPositive ? 'text-green' : 'text-red-600'
          )}
        >
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          <span>
            {isPositive ? '+' : ''}
            {change.toFixed(1)}% vs yesterday
          </span>
        </div>
      )}
    </div>
  );
}
