// ============================================================
// MunchAdda — Formatting Utilities
// All monetary input is in paise (integer).
// Dates are formatted in IST (Asia/Kolkata, UTC+5:30).
// ============================================================

import type { OrderStatus } from '../types/models';

// ----------------------------------------------------------
// Currency
// ----------------------------------------------------------

/**
 * Converts a paise integer to a formatted Indian Rupee string.
 * @example formatPrice(5050) → "₹50.50"
 * @example formatPrice(10000) → "₹100.00"
 */
export function formatPrice(paise: number): string {
  if (!Number.isFinite(paise)) return '₹0.00';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Converts paise to rupees as a plain number (useful for calculations/display).
 * @example paiseToRupees(5050) → 50.5
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Converts rupees to paise integer.
 * @example rupeesToPaise(50.5) → 5050
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

// ----------------------------------------------------------
// Date / Time
// ----------------------------------------------------------

const IST_LOCALE = 'en-IN';
const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Formats an ISO datetime string into a human-readable IST datetime.
 * @example formatDate("2024-12-15T07:45:00Z") → "15 Dec 2024, 01:15 PM"
 */
export function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Invalid date';

    return new Intl.DateTimeFormat(IST_LOCALE, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: IST_TIMEZONE,
    })
      .format(date)
      .replace(',', ','); // ensure consistent comma placement
  } catch {
    return 'Invalid date';
  }
}

/**
 * Formats an ISO datetime string to time only (IST).
 * @example formatTime("2024-12-15T07:45:00Z") → "01:15 PM"
 */
export function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Invalid time';

    return new Intl.DateTimeFormat(IST_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: IST_TIMEZONE,
    }).format(date);
  } catch {
    return 'Invalid time';
  }
}

/**
 * Formats an ISO date string to date only (IST).
 * @example formatDateOnly("2024-12-15T07:45:00Z") → "15 Dec 2024"
 */
export function formatDateOnly(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Invalid date';

    return new Intl.DateTimeFormat(IST_LOCALE, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: IST_TIMEZONE,
    }).format(date);
  } catch {
    return 'Invalid date';
  }
}

/**
 * Returns a relative time string (e.g. "2 minutes ago", "just now").
 * Falls back to formatDate for older timestamps.
 */
export function formatRelativeTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Invalid date';

    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffSeconds < 30) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    // Older than a day → full date
    return formatDate(iso);
  } catch {
    return 'Invalid date';
  }
}

// ----------------------------------------------------------
// Order Number
// ----------------------------------------------------------

/**
 * Formats a raw order number for display.
 * Assumes format "CB-YYYYMMDD-NNNN" — returns as-is but validates.
 * @example formatOrderNumber("CB-20241215-0042") → "#CB-20241215-0042"
 */
export function formatOrderNumber(num: string): string {
  if (!num || typeof num !== 'string') return '#—';
  const cleaned = num.trim().toUpperCase();
  return cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
}

// ----------------------------------------------------------
// Duration
// ----------------------------------------------------------

/**
 * Converts a duration in minutes to a human-readable string.
 * @example formatDuration(5)   → "5 mins"
 * @example formatDuration(60)  → "1 hr"
 * @example formatDuration(90)  → "1 hr 30 mins"
 * @example formatDuration(0)   → "0 mins"
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes === 0) return '0 mins';

  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hrs === 0) return `${mins} min${mins !== 1 ? 's' : ''}`;
  if (mins === 0) return `${hrs} hr${hrs !== 1 ? 's' : ''}`;
  return `${hrs} hr${hrs !== 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
}

// ----------------------------------------------------------
// Order Status Labels
// ----------------------------------------------------------

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  payment_pending: 'Payment Pending',
  payment_failed: 'Payment Failed',
  confirmed: 'Order Confirmed',
  preparing: 'Being Prepared',
  ready: 'Ready for Pickup',
  collected: 'Collected',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/**
 * Returns a human-readable label for an order status.
 * @example getOrderStatusLabel("ready") → "Ready for Pickup"
 */
export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

// ----------------------------------------------------------
// Order Status Colors (Tailwind CSS classes)
// ----------------------------------------------------------

/**
 * Maps order statuses to Tailwind CSS color classes (text + background pair).
 * Returns a string like "text-yellow-700 bg-yellow-100" suitable for badges.
 */
export function getOrderStatusColor(status: string): string {
  const colorMap: Record<OrderStatus, string> = {
    payment_pending: 'text-yellow-700 bg-yellow-100',
    payment_failed: 'text-red-700 bg-red-100',
    confirmed: 'text-blue-700 bg-blue-100',
    preparing: 'text-orange-700 bg-orange-100',
    ready: 'text-green-700 bg-green-100',
    collected: 'text-gray-700 bg-gray-100',
    cancelled: 'text-red-700 bg-red-50',
    refunded: 'text-purple-700 bg-purple-100',
  };

  return colorMap[status as OrderStatus] ?? 'text-gray-700 bg-gray-100';
}

/**
 * Returns just the Tailwind text color class for an order status.
 * @example getOrderStatusTextColor("ready") → "text-green-600"
 */
export function getOrderStatusTextColor(status: string): string {
  const colorMap: Record<OrderStatus, string> = {
    payment_pending: 'text-yellow-600',
    payment_failed: 'text-red-600',
    confirmed: 'text-blue-600',
    preparing: 'text-orange-600',
    ready: 'text-green-600',
    collected: 'text-gray-500',
    cancelled: 'text-red-500',
    refunded: 'text-purple-600',
  };

  return colorMap[status as OrderStatus] ?? 'text-gray-600';
}

// ----------------------------------------------------------
// Misc helpers
// ----------------------------------------------------------

/**
 * Formats a phone number for display with country code.
 * @example formatPhone("9876543210") → "+91 98765 43210"
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

/**
 * Truncates text to a given length with an ellipsis.
 * @example truncate("Hello World", 8) → "Hello Wo…"
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/**
 * Converts a rating (1-5) to a display string of stars.
 * @example formatRating(4) → "★★★★☆"
 */
export function formatRating(rating: number): string {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}
