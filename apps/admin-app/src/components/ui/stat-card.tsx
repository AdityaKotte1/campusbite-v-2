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
        'group bg-surface rounded-xl border border-border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-border-2',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="eyebrow">{label}</span>
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110',
            iconColor
          )}
        >
          {icon}
        </div>
      </div>

      <div className="font-display text-3xl font-semibold text-text mb-1 tabular-nums tracking-tight">
        {value}
      </div>

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
