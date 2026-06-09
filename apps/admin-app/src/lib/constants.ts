export const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  canteen_admin: 'Canteen Admin',
  staff: 'Staff',
  student: 'Student',
};

export const ORDER_STATUSES = [
  'payment_pending',
  'confirmed',
  'preparing',
  'ready',
  'collected',
  'cancelled',
  'refunded',
] as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  payment_pending: 'Payment Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  collected: 'Collected',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  payment_pending: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  confirmed: 'text-blue-700 bg-blue-50 border-blue-200',
  preparing: 'text-orange-700 bg-orange-50 border-orange-200',
  ready: 'text-green-700 bg-green-50 border-green-200',
  collected: 'text-gray-700 bg-gray-50 border-gray-200',
  cancelled: 'text-red-700 bg-red-50 border-red-200',
  refunded: 'text-purple-700 bg-purple-50 border-purple-200',
};

// Valid forward transitions for each status
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  payment_pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['collected'],
  collected: [],
  cancelled: ['refunded'],
  refunded: [],
};

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/orders', label: 'Orders', icon: 'ShoppingBag' },
  { href: '/menu', label: 'Menu', icon: 'UtensilsCrossed' },
  { href: '/users', label: 'Users', icon: 'Users' },
  { href: '/staff', label: 'Staff', icon: 'UserCheck' },
  { href: '/analytics', label: 'Analytics', icon: 'BarChart3' },
  { href: '/kiosks', label: 'Kiosks', icon: 'Monitor' },
  { href: '/settings', label: 'Settings', icon: 'Settings' },
  { href: '/audit-logs', label: 'Audit Logs', icon: 'ClipboardList' },
] as const;

export const DATE_RANGE_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
] as const;

export const KIOSK_HEARTBEAT_ONLINE_THRESHOLD = 5 * 60 * 1000; // 5 min
export const KIOSK_HEARTBEAT_DEGRADED_THRESHOLD = 15 * 60 * 1000; // 15 min

export const ITEMS_PER_PAGE = 20;
export const MAX_KIOSK_CACHE_TOKENS = 200;
export const QR_TOKEN_REPLAY_WINDOW_SECONDS = 300;
