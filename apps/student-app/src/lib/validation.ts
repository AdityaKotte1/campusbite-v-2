import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .min(1, 'Full name is required')
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be at most 100 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirm_password: z.string().min(1, 'Please confirm your password'),
    accept_terms: z.boolean().refine((val) => val === true, {
      message: 'You must accept the terms and conditions',
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const createOrderSchema = z.object({
  canteen_id: z.string().uuid('Invalid canteen'),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid('Invalid menu item'),
        quantity: z.number().int().min(1).max(10),
        special_note: z.string().max(200).optional(),
      })
    )
    .min(1, 'At least one item is required')
    .max(20, 'Too many items'),
  special_instructions: z.string().max(500).optional(),
  coupon_code: z.string().max(50).optional(),
});

export const updateProfileSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  phone: z
    .string()
    .regex(/^(\+91)?[6-9]\d{9}$/, 'Please enter a valid Indian mobile number')
    .nullable()
    .optional(),
  avatar_url: z.string().url('Invalid URL').nullable().optional(),
});

export const addAddressSchema = z.object({
  label: z
    .string()
    .min(1, 'Label is required')
    .max(50, 'Label must be at most 50 characters'),
  line1: z
    .string()
    .min(1, 'Address line 1 is required')
    .max(200, 'Too long'),
  line2: z.string().max(200, 'Too long').nullable().optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: z
    .string()
    .regex(/^\d{6}$/, 'Pincode must be a 6-digit number'),
  is_default: z.boolean().default(false),
});

export const applyCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Coupon code is required')
    .max(50)
    .toUpperCase(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddAddressInput = z.infer<typeof addAddressSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
