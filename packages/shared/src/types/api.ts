// ============================================================
// MunchAdda — API Response Types & Error Codes
// ============================================================

// ----------------------------------------------------------
// Error Code Enum
// ----------------------------------------------------------

export enum ErrorCode {
  // Authentication errors (AUTH)
  AUTH_001 = 'AUTH_001', // Invalid credentials
  AUTH_002 = 'AUTH_002', // Email not verified
  AUTH_003 = 'AUTH_003', // Token expired
  AUTH_004 = 'AUTH_004', // Token invalid or malformed
  AUTH_005 = 'AUTH_005', // Account disabled or not found

  // Validation errors (VAL)
  VAL_001 = 'VAL_001', // Required field missing
  VAL_002 = 'VAL_002', // Field format invalid (e.g. bad email)
  VAL_003 = 'VAL_003', // Field value out of range
  VAL_004 = 'VAL_004', // Payload schema mismatch

  // Authorization errors (AUTHZ)
  AUTHZ_001 = 'AUTHZ_001', // Insufficient role/permissions
  AUTHZ_002 = 'AUTHZ_002', // Resource belongs to another user
  AUTHZ_003 = 'AUTHZ_003', // Action not permitted in current state

  // Resource errors (RES)
  RES_001 = 'RES_001', // Resource not found
  RES_002 = 'RES_002', // Resource already exists (conflict)
  RES_003 = 'RES_003', // Resource is no longer available
  RES_004 = 'RES_004', // Resource limit exceeded

  // Business logic errors (BIZ)
  BIZ_001 = 'BIZ_001', // Canteen is closed
  BIZ_002 = 'BIZ_002', // Menu item unavailable or out of stock
  BIZ_003 = 'BIZ_003', // Coupon invalid, expired, or limit reached
  BIZ_004 = 'BIZ_004', // Order cannot be cancelled in current status

  // Server / infrastructure errors (SRV)
  SRV_001 = 'SRV_001', // Internal server error
  SRV_002 = 'SRV_002', // Payment gateway error
  SRV_003 = 'SRV_003', // Database error
  SRV_004 = 'SRV_004', // External service unavailable (e.g. Razorpay, Sentry)
}

// ----------------------------------------------------------
// API Error shape
// ----------------------------------------------------------

export interface ApiError {
  /** Machine-readable error code */
  code: ErrorCode | string;
  /** Human-readable message safe to display in UI */
  message: string;
  /** Optional field-level validation details */
  field?: string;
  /** Optional additional structured context */
  details?: Record<string, unknown>;
}

// ----------------------------------------------------------
// Base API Response
// ----------------------------------------------------------

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
      /** Optional informational message (e.g. "Order placed successfully") */
      message?: string;
    }
  | {
      success: false;
      error: ApiError;
      /** HTTP status hint (optional, mirrors the HTTP status code) */
      status?: number;
    };

// ----------------------------------------------------------
// Pagination
// ----------------------------------------------------------

export interface PaginationMeta {
  /** Cursor for the next page (null if this is the last page) */
  next_cursor: string | null;
  /** Whether there are more records after this page */
  has_more: boolean;
  /** Total count of records matching the query (can be expensive — omit if not needed) */
  total_count?: number;
  /** Number of records returned in this response */
  count: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ----------------------------------------------------------
// Common request shapes
// ----------------------------------------------------------

export interface PaginationParams {
  cursor?: string;
  limit?: number; // default 20, max 100
}

export interface SortParams {
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ----------------------------------------------------------
// Auth-specific response types
// ----------------------------------------------------------

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix timestamp
}

export interface LoginResponse {
  tokens: AuthTokens;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    avatar_url: string | null;
  };
}

// ----------------------------------------------------------
// Order-specific API types
// ----------------------------------------------------------

export interface CreateOrderItemPayload {
  menu_item_id: string;
  quantity: number;
  customization_notes?: string;
}

export interface CreateOrderPayload {
  canteen_id: string;
  items: CreateOrderItemPayload[];
  delivery_type?: 'pickup' | 'table_delivery';
  coupon_code?: string;
  special_instructions?: string;
}

export interface OrderSummary {
  subtotal_paise: number;
  tax_paise: number;
  discount_paise: number;
  total_paise: number;
  coupon_code: string | null;
  coupon_discount_paise: number;
  estimated_ready_minutes: number;
}

export interface RazorpayOrderPayload {
  razorpay_order_id: string;
  razorpay_key_id: string;
  amount_paise: number;
  currency: string;
  order_id: string; // our internal order ID
  order_number: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
}

export interface VerifyPaymentPayload {
  order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// ----------------------------------------------------------
// QR Token / Kiosk API types
// ----------------------------------------------------------

export interface QRTokenResponse {
  token: string;
  expires_at: string;
  order_number: string;
  canteen_name: string;
}

export interface KioskScanPayload {
  token: string;
  kiosk_id: string;
  scanned_at: string; // ISO timestamp (important for offline sync)
  offline: boolean;
  metadata?: Record<string, unknown>;
}

export interface KioskReceiptItem {
  name: string;
  quantity: number;
  unit_price_paise: number;
  total_price_paise: number;
}

export interface KioskReceiptResponse {
  success: true;
  token_number: number;
  order_number: string;
  canteen_name: string;
  student_name: string;
  items: KioskReceiptItem[];
  subtotal_paise: number;
  tax_paise: number;
  discount_paise: number;
  total_paise: number;
  collected_at: string;
}

// ----------------------------------------------------------
// Coupon validation
// ----------------------------------------------------------

export interface ValidateCouponPayload {
  coupon_code: string;
  canteen_id: string;
  subtotal_paise: number;
}

export interface ValidateCouponResponse {
  valid: boolean;
  coupon_id: string;
  discount_paise: number;
  message: string;
}

// ----------------------------------------------------------
// Admin dashboard types
// ----------------------------------------------------------

export interface CanteenStats {
  today_orders: number;
  today_revenue_paise: number;
  pending_orders: number;
  avg_prep_time_minutes: number;
  popular_items: Array<{
    menu_item_id: string;
    name: string;
    order_count: number;
  }>;
}
