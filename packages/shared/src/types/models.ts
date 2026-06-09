// ============================================================
// CampusBite — Shared Domain Models
// All monetary values are in paise (integer).
// All IDs are UUIDs (string).
// All timestamps are ISO 8601 strings.
// ============================================================

// ----------------------------------------------------------
// Enumerations
// ----------------------------------------------------------

export type UserRole = 'student' | 'staff' | 'canteen_admin' | 'super_admin';

export type OrderStatus =
  | 'payment_pending'
  | 'payment_failed'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'collected'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export type DeliveryType = 'pickup' | 'table_delivery';

export type QRTokenStatus = 'active' | 'used' | 'expired' | 'revoked';

export type CouponDiscountType = 'percentage' | 'flat';

export type NotificationType =
  | 'order_confirmed'
  | 'order_preparing'
  | 'order_ready'
  | 'order_collected'
  | 'order_cancelled'
  | 'payment_success'
  | 'payment_failed'
  | 'refund_initiated'
  | 'coupon_applied'
  | 'system_alert';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'view'
  | 'export';

// ----------------------------------------------------------
// Institute
// ----------------------------------------------------------

export interface Institute {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  address: string | null;
  city: string;
  state: string;
  pincode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------
// Canteen
// ----------------------------------------------------------

export interface Canteen {
  id: string;
  institute_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  phone: string | null;
  email: string | null;
  opening_time: string | null; // "HH:MM" format
  closing_time: string | null; // "HH:MM" format
  is_open: boolean;
  is_active: boolean;
  prep_time_minutes: number;
  tax_percentage: number; // stored as decimal e.g. 5.00 for 5%
  created_at: string;
  updated_at: string;
  // Relations (optional, populated when joined)
  institute?: Institute;
}

// ----------------------------------------------------------
// Category
// ----------------------------------------------------------

export interface Category {
  id: string;
  canteen_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  canteen?: Canteen;
  menu_items?: MenuItem[];
}

// ----------------------------------------------------------
// Menu Item
// ----------------------------------------------------------

export interface MenuItemImage {
  url: string;
  alt: string | null;
  is_primary: boolean;
}

export interface NutritionalInfo {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
}

export interface MenuItem {
  id: string;
  canteen_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_paise: number; // in paise, e.g. 5000 = ₹50.00
  original_price_paise: number | null; // for showing strikethrough price
  images: MenuItemImage[]; // JSONB array
  allergens: string[]; // e.g. ["gluten", "dairy", "nuts"]
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_available: boolean;
  is_featured: boolean;
  prep_time_minutes: number | null;
  nutritional_info: NutritionalInfo | null; // JSONB
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Relations
  canteen?: Canteen;
  category?: Category;
}

// ----------------------------------------------------------
// User
// ----------------------------------------------------------

export interface User {
  id: string; // matches auth.users.id
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  institute_id: string | null;
  assigned_canteen_id: string | null; // for canteen_admin / staff
  is_active: boolean;
  is_email_verified: boolean;
  loyalty_points_balance: number;
  created_at: string;
  updated_at: string;
  // Relations
  institute?: Institute;
  assigned_canteen?: Canteen;
}

// ----------------------------------------------------------
// Address
// ----------------------------------------------------------

export interface Address {
  id: string;
  user_id: string;
  label: string; // e.g. "Home", "Hostel"
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------
// Order
// ----------------------------------------------------------

export interface Order {
  id: string;
  order_number: string; // human-readable e.g. "CB-20241215-0042"
  user_id: string;
  canteen_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  delivery_type: DeliveryType;
  subtotal_paise: number;
  tax_paise: number;
  discount_paise: number;
  total_paise: number;
  special_instructions: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
  estimated_ready_at: string | null;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  refunded_at: string | null;
  refund_amount_paise: number | null;
  created_at: string;
  updated_at: string;
  // Relations
  user?: User;
  canteen?: Canteen;
  order_items?: OrderItem[];
  qr_token?: QRToken;
  payment_transaction?: PaymentTransaction;
}

// ----------------------------------------------------------
// Order Item
// ----------------------------------------------------------

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  menu_item_name: string; // snapshot at time of order
  menu_item_image_url: string | null; // snapshot
  quantity: number;
  unit_price_paise: number; // snapshot at time of order
  total_price_paise: number;
  customization_notes: string | null;
  created_at: string;
  // Relations
  menu_item?: MenuItem;
}

// ----------------------------------------------------------
// QR Token
// ----------------------------------------------------------

export interface ScanMetadata {
  device_os?: string;
  app_version?: string;
  ip_address?: string;
  [key: string]: unknown;
}

export interface QRToken {
  id: string;
  order_id: string;
  token: string; // UUID used as the actual QR code value
  status: QRTokenStatus;
  kiosk_id: string | null; // which kiosk scanned it
  scan_metadata: ScanMetadata | null; // JSONB
  expires_at: string;
  used_at: string | null;
  version: number; // optimistic locking version counter
  created_at: string;
  updated_at: string;
  // Relations
  order?: Order;
  kiosk?: Kiosk;
}

// ----------------------------------------------------------
// Kiosk
// ----------------------------------------------------------

export interface PrinterConfig {
  enabled: boolean;
  paper_width_mm: number;
  copies: number;
  usb_vendor_id?: string;
  usb_product_id?: string;
}

export interface Kiosk {
  id: string;
  canteen_id: string;
  name: string;
  device_id: string; // unique hardware identifier
  api_key_encrypted: string; // AES-256 encrypted API key stored in DB
  last_heartbeat: string | null;
  printer_config: PrinterConfig | null; // JSONB
  offline_mode: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  canteen?: Canteen;
}

// ----------------------------------------------------------
// Kiosk Scan
// ----------------------------------------------------------

export type KioskScanResult =
  | 'success'
  | 'already_used'
  | 'expired'
  | 'revoked'
  | 'invalid_token'
  | 'network_error';

export interface KioskScan {
  id: string;
  kiosk_id: string;
  qr_token_id: string | null;
  raw_token_value: string;
  scan_result: KioskScanResult;
  print_attempted: boolean;
  print_success: boolean | null;
  offline_scan: boolean; // was device offline when scanned?
  synced_at: string | null; // when offline scan was synced
  scanned_at: string;
  // Relations
  kiosk?: Kiosk;
  qr_token?: QRToken;
}

// ----------------------------------------------------------
// Daily Token
// ----------------------------------------------------------

export interface DailyToken {
  id: string;
  canteen_id: string;
  order_id: string;
  date: string; // "YYYY-MM-DD"
  token_number: number; // sequential per canteen per day
  created_at: string;
  // Relations
  canteen?: Canteen;
  order?: Order;
}

// ----------------------------------------------------------
// Kiosk Offline Queue
// ----------------------------------------------------------

export interface KioskOfflineQueue {
  id: string;
  kiosk_id: string;
  raw_token_value: string;
  scanned_at: string; // original scan time (offline)
  synced: boolean;
  synced_at: string | null;
  sync_result: string | null; // JSON result from server after sync
  created_at: string;
}

// ----------------------------------------------------------
// Staff
// ----------------------------------------------------------

export interface Staff {
  id: string;
  user_id: string;
  canteen_id: string;
  employee_id: string | null;
  designation: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  user?: User;
  canteen?: Canteen;
}

// ----------------------------------------------------------
// Coupon
// ----------------------------------------------------------

export interface Coupon {
  id: string;
  canteen_id: string | null; // null = platform-wide coupon
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number; // percentage (0-100) or flat paise amount
  min_order_paise: number | null;
  max_discount_paise: number | null; // cap for percentage coupons
  usage_limit: number | null; // total uses allowed across all users
  used_count: number;
  per_user_limit: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------
// User Coupon (tracks per-user redemption)
// ----------------------------------------------------------

export interface UserCoupon {
  id: string;
  user_id: string;
  coupon_id: string;
  order_id: string;
  discount_applied_paise: number;
  used_at: string;
  // Relations
  coupon?: Coupon;
  order?: Order;
}

// ----------------------------------------------------------
// Favorite
// ----------------------------------------------------------

export interface Favorite {
  id: string;
  user_id: string;
  menu_item_id: string;
  created_at: string;
  // Relations
  menu_item?: MenuItem;
}

// ----------------------------------------------------------
// Review
// ----------------------------------------------------------

export interface Review {
  id: string;
  user_id: string;
  order_id: string;
  canteen_id: string;
  menu_item_id: string | null; // null = canteen-level review
  rating: number; // 1-5
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null; // admin user_id
  created_at: string;
  updated_at: string;
  // Relations
  user?: User;
  canteen?: Canteen;
  menu_item?: MenuItem;
}

// ----------------------------------------------------------
// Loyalty Point
// ----------------------------------------------------------

export type LoyaltyPointTransactionType =
  | 'earned_order'
  | 'redeemed_order'
  | 'bonus'
  | 'expiry'
  | 'adjustment';

export interface LoyaltyPoint {
  id: string;
  user_id: string;
  order_id: string | null;
  transaction_type: LoyaltyPointTransactionType;
  points: number; // positive = earned, negative = redeemed
  balance_after: number;
  description: string | null;
  expires_at: string | null;
  created_at: string;
}

// ----------------------------------------------------------
// Audit Log
// ----------------------------------------------------------

export interface AuditLog {
  id: string;
  user_id: string | null; // null for system actions
  action: AuditAction;
  resource_type: string; // e.g. "order", "menu_item", "user"
  resource_id: string | null;
  old_values: Record<string, unknown> | null; // JSONB
  new_values: Record<string, unknown> | null; // JSONB
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ----------------------------------------------------------
// Notification
// ----------------------------------------------------------

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null; // JSONB — extra context e.g. order_id
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// ----------------------------------------------------------
// Payment Transaction
// ----------------------------------------------------------

export type PaymentGateway = 'razorpay' | 'manual' | 'wallet';

export interface PaymentTransaction {
  id: string;
  order_id: string;
  user_id: string;
  gateway: PaymentGateway;
  gateway_order_id: string | null; // razorpay order id
  gateway_payment_id: string | null; // razorpay payment id
  gateway_signature: string | null; // razorpay signature
  amount_paise: number;
  currency: string; // "INR"
  status: PaymentStatus;
  failure_reason: string | null;
  refund_id: string | null;
  refund_amount_paise: number | null;
  refunded_at: string | null;
  raw_response: Record<string, unknown> | null; // JSONB full gateway payload
  created_at: string;
  updated_at: string;
  // Relations
  order?: Order;
}
