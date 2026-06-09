// ============================================================
// CampusBite — Zod Validation Schemas
// ============================================================

import { z } from 'zod';

// ----------------------------------------------------------
// Common reusable field schemas
// ----------------------------------------------------------

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .email('Please enter a valid email address')
  .toLowerCase()
  .trim();

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
  .optional();

const uuidSchema = z.string().uuid('Invalid ID format');

const pincodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits');

// ----------------------------------------------------------
// Auth Schemas
// ----------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirm_password: z.string({ required_error: 'Please confirm your password' }),
    full_name: z
      .string({ required_error: 'Full name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters')
      .trim(),
    phone: phoneSchema,
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
    confirm_password: z.string({ required_error: 'Please confirm your password' }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ----------------------------------------------------------
// Profile Schemas
// ----------------------------------------------------------

export const updateProfileSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
    .optional(),
  phone: phoneSchema,
  avatar_url: z.string().url('Invalid avatar URL').optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ----------------------------------------------------------
// Address Schemas
// ----------------------------------------------------------

export const addAddressSchema = z.object({
  label: z
    .string({ required_error: 'Label is required' })
    .min(1, 'Label is required')
    .max(50, 'Label must not exceed 50 characters')
    .trim(),
  line1: z
    .string({ required_error: 'Address line 1 is required' })
    .min(5, 'Address must be at least 5 characters')
    .max(200, 'Address must not exceed 200 characters')
    .trim(),
  line2: z
    .string()
    .max(200, 'Address line 2 must not exceed 200 characters')
    .trim()
    .optional()
    .nullable(),
  city: z
    .string({ required_error: 'City is required' })
    .min(2, 'City must be at least 2 characters')
    .max(100)
    .trim(),
  state: z
    .string({ required_error: 'State is required' })
    .min(2, 'State must be at least 2 characters')
    .max(100)
    .trim(),
  pincode: pincodeSchema,
  is_default: z.boolean().optional().default(false),
});

export type AddAddressInput = z.infer<typeof addAddressSchema>;

export const updateAddressSchema = addAddressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

// ----------------------------------------------------------
// Order Schemas
// ----------------------------------------------------------

export const orderItemSchema = z.object({
  menu_item_id: uuidSchema,
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be a whole number')
    .min(1, 'Minimum quantity is 1')
    .max(20, 'Maximum quantity per item is 20'),
  customization_notes: z
    .string()
    .max(500, 'Customization note must not exceed 500 characters')
    .trim()
    .optional()
    .nullable(),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const createOrderSchema = z.object({
  canteen_id: uuidSchema,
  items: z
    .array(orderItemSchema)
    .min(1, 'Order must contain at least one item')
    .max(30, 'Order cannot contain more than 30 items'),
  delivery_type: z.enum(['pickup', 'table_delivery']).optional().default('pickup'),
  coupon_code: z
    .string()
    .max(30, 'Coupon code is too long')
    .trim()
    .toUpperCase()
    .optional()
    .nullable(),
  special_instructions: z
    .string()
    .max(500, 'Special instructions must not exceed 500 characters')
    .trim()
    .optional()
    .nullable(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ----------------------------------------------------------
// Coupon Schemas
// ----------------------------------------------------------

export const couponSchema = z.object({
  coupon_code: z
    .string({ required_error: 'Coupon code is required' })
    .min(3, 'Coupon code must be at least 3 characters')
    .max(30, 'Coupon code must not exceed 30 characters')
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]+$/, 'Coupon code can only contain letters, numbers, - and _'),
  canteen_id: uuidSchema,
  subtotal_paise: z
    .number()
    .int('Amount must be a whole number')
    .min(0, 'Amount cannot be negative'),
});

export type CouponInput = z.infer<typeof couponSchema>;

// Admin: create/update coupon
export const manageCouponSchema = z
  .object({
    canteen_id: uuidSchema.optional().nullable(),
    code: z
      .string({ required_error: 'Coupon code is required' })
      .min(3)
      .max(30)
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]+$/),
    description: z.string().max(500).trim().optional().nullable(),
    discount_type: z.enum(['percentage', 'flat']),
    discount_value: z.number().positive('Discount value must be positive'),
    min_order_paise: z.number().int().min(0).optional().nullable(),
    max_discount_paise: z.number().int().min(0).optional().nullable(),
    usage_limit: z.number().int().positive().optional().nullable(),
    per_user_limit: z.number().int().min(1).max(100).default(1),
    valid_from: z.string().datetime({ message: 'Invalid start date' }),
    valid_until: z
      .string()
      .datetime({ message: 'Invalid end date' })
      .optional()
      .nullable(),
    is_active: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.discount_type === 'percentage') {
        return data.discount_value > 0 && data.discount_value <= 100;
      }
      return data.discount_value > 0;
    },
    {
      message: 'Percentage discount must be between 1 and 100',
      path: ['discount_value'],
    }
  )
  .refine(
    (data) => {
      if (data.valid_until) {
        return new Date(data.valid_until) > new Date(data.valid_from);
      }
      return true;
    },
    {
      message: 'End date must be after start date',
      path: ['valid_until'],
    }
  );

export type ManageCouponInput = z.infer<typeof manageCouponSchema>;

// ----------------------------------------------------------
// Review Schemas
// ----------------------------------------------------------

export const createReviewSchema = z.object({
  order_id: uuidSchema,
  canteen_id: uuidSchema,
  menu_item_id: uuidSchema.optional().nullable(),
  rating: z
    .number({ required_error: 'Rating is required' })
    .int()
    .min(1, 'Minimum rating is 1')
    .max(5, 'Maximum rating is 5'),
  title: z
    .string()
    .max(100, 'Title must not exceed 100 characters')
    .trim()
    .optional()
    .nullable(),
  body: z
    .string()
    .max(1000, 'Review must not exceed 1000 characters')
    .trim()
    .optional()
    .nullable(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// ----------------------------------------------------------
// Menu Item Schemas (Admin)
// ----------------------------------------------------------

export const menuItemImageSchema = z.object({
  url: z.string().url('Invalid image URL'),
  alt: z.string().max(200).optional().nullable(),
  is_primary: z.boolean().default(false),
});

export const createMenuItemSchema = z.object({
  canteen_id: uuidSchema,
  category_id: uuidSchema,
  name: z
    .string({ required_error: 'Item name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(150)
    .trim(),
  description: z.string().max(1000).trim().optional().nullable(),
  price_paise: z
    .number({ required_error: 'Price is required' })
    .int('Price must be a whole number in paise')
    .min(100, 'Minimum price is ₹1'),
  original_price_paise: z.number().int().min(0).optional().nullable(),
  images: z.array(menuItemImageSchema).max(5, 'Maximum 5 images allowed').default([]),
  allergens: z.array(z.string().trim()).default([]),
  is_vegetarian: z.boolean().default(false),
  is_vegan: z.boolean().default(false),
  is_available: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  prep_time_minutes: z.number().int().min(0).max(120).optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export const updateMenuItemSchema = createMenuItemSchema.partial().omit({ canteen_id: true });
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

// ----------------------------------------------------------
// Kiosk schemas (internal use)
// ----------------------------------------------------------

export const kioskScanSchema = z.object({
  token: z
    .string({ required_error: 'Token is required' })
    .uuid('Token must be a valid UUID'),
  kiosk_id: uuidSchema,
  scanned_at: z.string().datetime({ message: 'Invalid scan timestamp' }),
  offline: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export type KioskScanInput = z.infer<typeof kioskScanSchema>;

export const kioskHeartbeatSchema = z.object({
  kiosk_id: uuidSchema,
  device_id: z.string().min(1),
  offline_mode: z.boolean().default(false),
  queue_length: z.number().int().min(0).default(0),
});

export type KioskHeartbeatInput = z.infer<typeof kioskHeartbeatSchema>;
