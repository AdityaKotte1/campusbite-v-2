// ─── Auth & User Types ─────────────────────────────────────────────────────

export type AdminRole = 'super_admin' | 'canteen_admin' | 'staff';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AdminRole;
  institute_id: string | null;
  assigned_canteen_id: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  institute_id: string | null;
  assigned_canteen_id: string | null;
  is_email_verified: boolean;
  is_phone_verified: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Institute & Canteen ────────────────────────────────────────────────────

export interface Institute {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  pincode: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Canteen {
  id: string;
  institute_id: string;
  name: string;
  code: string;
  description: string | null;
  location: string | null;
  building: string | null;
  floor: string | null;
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  image_url: string | null;
  cover_url: string | null;
  rating: number;
  total_reviews: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Menu Types ─────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  canteen_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  category_id: string | null;
  canteen_id: string;
  name: string;
  description: string | null;
  price_paise: number;
  image_url: string | null;
  images: string[];
  is_available: boolean;
  is_veg: boolean;
  prep_time_minutes: number;
  calories: number | null;
  serving_size: string | null;
  allergens: string[];
  sort_order: number;
  rating: number;
  total_reviews: number;
  total_orders: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  category?: Category;
  canteen?: Canteen;
}

// ─── Order Types ─────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'payment_pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'collected'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price_paise: number;
  total_price_paise: number;
  special_instructions: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  canteen_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_id: string | null;
  subtotal_paise: number;
  tax_paise: number;
  discount_paise: number;
  total_paise: number;
  special_instructions: string | null;
  delivery_type: string;
  scheduled_for: string | null;
  estimated_prep_time_minutes: number | null;
  actual_prep_time_minutes: number | null;
  ready_at: string | null;
  collected_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
  canteen?: Canteen;
  order_items?: OrderItem[];
}

// ─── QR Token Types ──────────────────────────────────────────────────────────

export type QrTokenStatus = 'active' | 'used' | 'expired' | 'cancelled';

export interface QrToken {
  id: string;
  order_id: string;
  token: string;
  status: QrTokenStatus;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// ─── Staff Types ─────────────────────────────────────────────────────────────

export interface Staff {
  id: string;
  user_id: string;
  canteen_id: string;
  role: string;
  permissions: Record<string, boolean>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
  canteen?: Canteen;
}

// ─── Kiosk Types ─────────────────────────────────────────────────────────────

export type KioskHealthStatus = 'online' | 'degraded' | 'offline';

export interface Kiosk {
  id: string;
  canteen_id: string;
  name: string;
  location: string | null;
  device_id: string;
  api_key_encrypted: string;
  is_active: boolean;
  last_heartbeat: string | null;
  heartbeat_data: Record<string, unknown> | null;
  firmware_version: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  canteen?: Canteen;
}

export interface KioskStatus {
  kiosk_id: string;
  name: string;
  canteen_name: string;
  last_heartbeat: string | null;
  health: KioskHealthStatus;
  printer_status: string | null;
  pending_scans: number;
  is_active: boolean;
}

export interface KioskScan {
  id: string;
  kiosk_id: string;
  token: string;
  order_id: string | null;
  scanned_at: string;
  result: 'success' | 'failure' | 'already_used' | 'expired';
  failure_reason: string | null;
  // Joined
  order?: Order;
}

// ─── Audit Log Types ──────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  user?: User;
}

// ─── Payment Types ────────────────────────────────────────────────────────────

export interface PaymentTransaction {
  id: string;
  order_id: string;
  user_id: string;
  amount_paise: number;
  currency: string;
  payment_method: string;
  payment_gateway: string;
  gateway_transaction_id: string | null;
  gateway_response: Record<string, unknown> | null;
  status: string;
  failure_reason: string | null;
  refund_amount_paise: number;
  refund_id: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  today_revenue_paise: number;
  today_orders: number;
  active_orders: number;
  new_users_today: number;
  revenue_change_pct: number;
  orders_change_pct: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue_paise: number;
  orders: number;
}

export interface TopItem {
  menu_item_id: string;
  name: string;
  total_orders: number;
  total_revenue_paise: number;
}

export interface HourlyOrders {
  hour: number;
  orders: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  total_paise: number;
}

export interface AnalyticsData {
  revenue_over_time: RevenueDataPoint[];
  top_items: TopItem[];
  orders_by_hour: HourlyOrders[];
  payment_methods: PaymentMethodBreakdown[];
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
