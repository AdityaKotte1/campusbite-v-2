import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatting';
import {
  KIOSK_HEARTBEAT_ONLINE_THRESHOLD,
  KIOSK_HEARTBEAT_DEGRADED_THRESHOLD,
} from '@/lib/constants';
import type { KioskHealthStatus } from '@/types';

function getKioskHealth(lastHeartbeat: string | null): KioskHealthStatus {
  if (!lastHeartbeat) return 'offline';
  const diff = Date.now() - new Date(lastHeartbeat).getTime();
  if (diff < KIOSK_HEARTBEAT_ONLINE_THRESHOLD) return 'online';
  if (diff < KIOSK_HEARTBEAT_DEGRADED_THRESHOLD) return 'degraded';
  return 'offline';
}

const HEALTH_STYLES: Record<KioskHealthStatus, { dot: string; label: string; text: string }> = {
  online: { dot: 'bg-green', label: 'Online', text: 'text-green-dark' },
  degraded: { dot: 'bg-amber', label: 'Degraded', text: 'text-amber-dark' },
  offline: { dot: 'bg-red-500', label: 'Offline', text: 'text-red-700' },
};

interface KioskStatusIndicatorProps {
  lastHeartbeat: string | null;
  showTime?: boolean;
  className?: string;
}

export function KioskStatusIndicator({
  lastHeartbeat,
  showTime = true,
  className,
}: KioskStatusIndicatorProps) {
  const health = getKioskHealth(lastHeartbeat);
  const { dot, label, text } = HEALTH_STYLES[health];

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className={cn('w-2 h-2 rounded-full shrink-0', dot, health === 'online' && 'animate-pulse')} />
      <span className={cn('text-xs font-medium', text)}>{label}</span>
      {showTime && lastHeartbeat && (
        <span className="text-xs text-text-3">· {formatRelativeTime(lastHeartbeat)}</span>
      )}
    </div>
  );
}

export { getKioskHealth };
