// ─── Enums / Union Types ─────────────────────────────────────────────────────

export type UserRole = 'student' | 'canteen_staff' | 'canteen_admin' | 'super_admin';

export type OrderStatus =
  | 'payment_pending'
  | 'payment_failed'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'collected'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type PaymentMethod = 'razorpay' | 'wallet' | 'cash';

export type DietaryTag = 'veg' | 'non_veg' | 'egg' | 'vegan';

// ─── Core Models ─────────────────────────────────────────────────────────────

export interface Institute {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Canteen {
  id: string;
  institute_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  location: string | null;
  opens_at: string;  // HH:MM
  closes_at: string; // HH:MM
  is_open: boolean;
  rating: number;
  total_reviews: number;
  is_active: boolean;
  // When false, "Pay by cash" is hidden at checkout for this canteen (online only).
  cash_payments_enabled?: boolean;
  created_at: string;
  updated_at: string;
  institute?: Institute;
}

export interface Category {
  id: string;
  canteen_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  separate_billing: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  canteen_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price_paise: number;
  is_veg: boolean;
  prep_time_minutes: number;
  is_available: boolean;
  sort_order: number;
  stock_enabled?: boolean;
  stock_count?: number | null;
  created_at: string;
  updated_at: string;
  category?: Category;
  canteen?: Canteen;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  institute_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institute?: Institute;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  canteen_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  subtotal_paise: number;
  tax_paise: number;
  discount_paise: number;
  total_paise: number;
  coupon_code: string | null;
  special_instructions: string | null;
  estimated_ready_at: string | null;
  collected_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  canteen?: Canteen;
  items?: OrderItem[];
  qr_token?: QRToken;
  user?: User;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  price_paise: number;
  quantity: number;
  subtotal_paise: number;
  special_note: string | null;
  created_at: string;
  menu_item?: MenuItem;
}

export interface QRToken {
  id: string;
  order_id: string;
  token: string;
  expires_at: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  used_at: string | null;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  amount_paise: number;
  currency: string;
  status: PaymentStatus;
  gateway_response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  min_order_paise: number;
  max_discount_paise: number | null;
  usage_limit: number | null;
  used_count: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  canteen_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'order_update' | 'promo' | 'system';
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

// ─── Cart Types ───────────────────────────────────────────────────────────────

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

// ─── Form Input Types ─────────────────────────────────────────────────────────

export interface LoginFormInput {
  email: string;
  password: string;
}

export interface RegisterFormInput {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
  accept_terms: boolean;
}

export interface UpdateProfileFormInput {
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
}

export interface AddAddressFormInput {
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export interface CreateOrderFormInput {
  canteen_id: string;
  items: Array<{ menu_item_id: string; quantity: number; special_note?: string }>;
  special_instructions?: string;
  coupon_code?: string;
}

export interface ApplyCouponFormInput {
  code: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ─── Payment Types ────────────────────────────────────────────────────────────

export interface RazorpayOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  order_number: string;
  canteen_name: string;
}

export interface RazorpayVerifyInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  order_id: string;
}

// ─── Filter Types ─────────────────────────────────────────────────────────────

export interface CanteenFilters {
  search?: string;
  is_open?: boolean;
  cuisine_tag?: string;
}

export interface MenuFilters {
  category_id?: string;
  is_veg?: boolean;
  search?: string;
  is_available?: boolean;
}

export interface OrderFilters {
  status?: OrderStatus;
  page?: number;
  per_page?: number;
}
