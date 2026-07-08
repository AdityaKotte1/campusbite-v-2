export const APP_NAME = 'MunchAdda';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  CANTEENS: '/canteens',
  CART: '/cart',
  ORDERS: '/orders',
  PROFILE: '/profile',
} as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  payment_pending: 'Awaiting Payment',
  payment_failed: 'Payment Failed',
  confirmed: 'Order Confirmed',
  preparing: 'Being Prepared',
  ready: 'Ready for Pickup',
  collected: 'Collected',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  payment_pending: 'text-yellow-600 bg-yellow-50',
  payment_failed: 'text-red-600 bg-red-50',
  confirmed: 'text-blue-600 bg-blue-50',
  preparing: 'text-orange-600 bg-orange-50',
  ready: 'text-green-600 bg-green-50',
  collected: 'text-gray-600 bg-gray-50',
  cancelled: 'text-red-600 bg-red-50',
  refunded: 'text-purple-600 bg-purple-50',
};

export const CANCELLABLE_STATUSES = ['payment_pending'];

export const ACTIVE_ORDER_STATUSES = ['confirmed', 'preparing', 'ready'];

export const TAX_RATE = 0.05; // 5% GST

export const QR_EXPIRY_HOURS = 3;

export const MAX_CART_ITEMS_PER_TYPE = 10;

export const MIN_ORDER_PAISE = 2000; // ₹20

export const CURRENCY = 'INR';

export const DEFAULT_PREP_TIME_MIN = 10;
export const DEFAULT_PREP_TIME_MAX = 30;

export const POLLING_INTERVAL_MS = 30000; // 30s active-order poll — halves request/egress volume vs 15s; combined with ETag/304 on the orders API, unchanged polls transfer ~nothing

// With Supabase Realtime driving instant order-status updates, polling is demoted
// to a slow safety net (catches anything missed while a socket was dropped). Each
// safety poll returns 304 via the ETag handler unless something actually changed.
export const SAFETY_POLL_INTERVAL_MS = 60000; // 60s backstop alongside Realtime

// Fallback poll cadence used when the Realtime channel is NOT connected (the
// publication migration isn't applied, or the socket dropped). Without this we'd
// silently regress to the slow 60s backstop and lose the responsiveness Realtime
// was meant to provide, so we poll faster (30s) until Realtime reconnects.
export const REALTIME_FALLBACK_POLL_INTERVAL_MS = 30000; // 30s when Realtime is down
