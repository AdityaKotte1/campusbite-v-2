// ============================================================
// @munchadda/shared — Public API
// ============================================================

// Domain models
export type {
  // Enumerations
  UserRole,
  OrderStatus,
  PaymentStatus,
  DeliveryType,
  QRTokenStatus,
  CouponDiscountType,
  NotificationType,
  AuditAction,
  LoyaltyPointTransactionType,
  KioskScanResult,
  PaymentGateway,
  // Entities
  Institute,
  Canteen,
  Category,
  MenuItemImage,
  NutritionalInfo,
  MenuItem,
  User,
  Address,
  Order,
  OrderItem,
  ScanMetadata,
  QRToken,
  PrinterConfig,
  Kiosk,
  KioskScan,
  DailyToken,
  KioskOfflineQueue,
  Staff,
  Coupon,
  UserCoupon,
  Favorite,
  Review,
  LoyaltyPoint,
  AuditLog,
  Notification,
  PaymentTransaction,
} from './types/models';

// API types
export { ErrorCode } from './types/api';
export type {
  ApiError,
  ApiResponse,
  PaginationMeta,
  PaginatedResponse,
  PaginationParams,
  SortParams,
  AuthTokens,
  LoginResponse,
  CreateOrderItemPayload,
  CreateOrderPayload,
  OrderSummary,
  RazorpayOrderPayload,
  VerifyPaymentPayload,
  QRTokenResponse,
  KioskScanPayload,
  KioskReceiptItem,
  KioskReceiptResponse,
  ValidateCouponPayload,
  ValidateCouponResponse,
  CanteenStats,
} from './types/api';

// Formatting utilities
export {
  formatPrice,
  paiseToRupees,
  rupeesToPaise,
  formatDate,
  formatTime,
  formatDateOnly,
  formatRelativeTime,
  formatOrderNumber,
  formatDuration,
  getOrderStatusLabel,
  getOrderStatusColor,
  getOrderStatusTextColor,
  formatPhone,
  truncate,
  formatRating,
} from './utils/formatting';

// Validation schemas (Zod)
export {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  addAddressSchema,
  updateAddressSchema,
  orderItemSchema,
  createOrderSchema,
  couponSchema,
  manageCouponSchema,
  createReviewSchema,
  menuItemImageSchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  kioskScanSchema,
  kioskHeartbeatSchema,
} from './utils/validation';

// Validation input types
export type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
  AddAddressInput,
  UpdateAddressInput,
  OrderItemInput,
  CreateOrderInput,
  CouponInput,
  ManageCouponInput,
  CreateReviewInput,
  CreateMenuItemInput,
  UpdateMenuItemInput,
  KioskScanInput,
  KioskHeartbeatInput,
} from './utils/validation';
