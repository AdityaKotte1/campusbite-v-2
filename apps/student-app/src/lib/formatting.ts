import { format, formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Format paise to Indian Rupee string.
 * e.g. 1250 → "₹12.50"
 */
export function formatPrice(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Format ISO string to Indian Standard Time nicely.
 * e.g. "2024-06-01T10:30:00Z" → "1 Jun 2024, 4:00 PM"
 */
export function formatDate(iso: string): string {
  try {
    const date = parseISO(iso);
    return format(date, 'd MMM yyyy, h:mm a');
  } catch {
    return iso;
  }
}

/**
 * Format ISO string to relative time.
 * e.g. "2 mins ago"
 */
export function formatRelativeTime(iso: string): string {
  try {
    const date = parseISO(iso);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return iso;
  }
}

/**
 * Format duration in minutes to human-readable string.
 * e.g. 15 → "15 mins", 90 → "1 hr 30 mins"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hr${hours !== 1 ? 's' : ''}`;
  }
  return `${hours} hr ${mins} min${mins !== 1 ? 's' : ''}`;
}

/**
 * Truncate text to given max length with ellipsis.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate order number in CB-YYMMDD-XXXXXX format.
 * e.g. CB-240601-A3F9K2
 */
export function generateOrderNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CB-${yy}${mm}${dd}-${suffix}`;
}

/**
 * Format time string (HH:MM) to 12-hour format.
 * e.g. "14:30" → "2:30 PM"
 */
export function formatTime(time: string): string {
  try {
    const [hourStr, minuteStr] = time.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
  } catch {
    return time;
  }
}

/**
 * Format file size in bytes to human-readable.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format a number with Indian numbering system.
 * e.g. 1234567 → "12,34,567"
 */
export function formatIndianNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}

/**
 * Format countdown from now to expiry ISO string.
 * Returns { hours, minutes, seconds, isExpired }
 */
export function getCountdownFromNow(expiryIso: string): {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
} {
  const now = Date.now();
  const expiry = new Date(expiryIso).getTime();
  const diff = expiry - now;

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, isExpired: false, totalSeconds };
}
