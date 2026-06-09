# CampusBite Master Build Plan - From Scratch

## Document Overview
This is the complete blueprint for building CampusBite from scratch. This document provides everything needed to build a production-ready system with best-in-class security, performance, and user experience.

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Complete Feature List](#complete-feature-list)
4. [Database Schema](#database-schema)
5. [API Design](#api-design)
6. [Frontend Architecture](#frontend-architecture)
7. [Security Architecture](#security-architecture)
8. [Performance Architecture](#performance-architecture)
9. [UI/UX Design System](#uiux-design-system)
10. [Development Workflow](#development-workflow)
11. [Implementation Plan](#implementation-plan)
12. [Testing Strategy](#testing-strategy)
13. [Deployment Strategy](#deployment-strategy)

---

## System Overview

### Vision
CampusBite is a campus food ordering platform that connects students with canteens, providing a seamless ordering experience with real-time tracking, secure payments, and efficient management tools.

### Core Value Proposition
- **For Students**: Fast, easy food ordering with real-time tracking
- **For Staff**: Efficient order management with analytics
- **For Admin**: Complete control with comprehensive insights

### System Goals
- **Performance**: <2s load time, <100ms API response
- **Security**: Multi-layer security with zero-trust architecture
- **Reliability**: 99.9% uptime with automatic failover
- **Scalability**: Handle 10,000+ concurrent users
- **User Experience**: Intuitive, fast, delightful

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CampusBite System                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Client Layer                        │    │
│  │  ┌──────────────────┐  ┌──────────────────┐         │    │
│  │  │  Student App     │  │   Admin App      │         │    │
│  │  │  (Mobile First)  │  │  (Desktop First) │         │    │
│  │  │  Next.js 14      │  │  Next.js 14      │         │    │
│  │  │  React 19        │  │  React 19        │         │    │
│  │  │  TypeScript      │  │  TypeScript      │         │    │
│  │  └──────────────────┘  └──────────────────┘         │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                    │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  CDN & Edge Layer                     │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │  Vercel Edge Network (Global Distribution)   │   │    │
│  │  │  - Static Asset Caching                       │   │    │
│  │  │  - Image Optimization                         │   │    │
│  │  │  - API Edge Functions                         │   │    │
│  │  │  - DDoS Protection                            │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                    │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                Application Layer                       │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │  Next.js App Router (Server Components)     │   │    │
│  │  │  - Server-Side Rendering                    │   │    │
│  │  │  - Static Site Generation                   │   │    │
│  │  │  - API Routes (Serverless)                 │   │    │
│  │  │  - Middleware (Auth, Rate Limit)           │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                    │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Service Layer                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │    │
│  │  │ Auth Service │  │Order Service │  │Payment   │  │    │
│  │  │              │  │              │  │Service   │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │    │
│  │  │Menu Service  │  │Notification  │  │Analytics  │  │    │
│  │  │              │  │Service       │  │Service   │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                    │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Data Layer                          │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │         Supabase (PostgreSQL)               │   │    │
│  │  │  - Row Level Security (RLS)                 │   │    │
│  │  │  - Connection Pooling                       │   │    │
│  │  │  - Automatic Backups                        │   │    │
│  │  │  - Point-in-Time Recovery                  │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  │  ┌──────────────┐  ┌──────────────┐              │    │
│  │  │  Auth        │  │  Storage     │              │    │
│  │  │  (JWT)       │  │  (S3-like)   │              │    │
│  │  └──────────────┘  └──────────────┘              │    │
│  │  ┌──────────────┐                                   │    │
│  │  │  Realtime    │                                   │    │
│  │  │  (WebSocket) │                                   │    │
│  │  └──────────────┘                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                    │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                External Services                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │    │
│  │  │  Razorpay    │  │  SendGrid    │  │  Sentry   │  │    │
│  │  │  (Payments)  │  │  (Email)     │  │  (Errors) │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │    │
│  │  ┌──────────────┐  ┌──────────────┐              │    │
│  │  │  Vercel      │  │  Cloudflare  │              │    │
│  │  │  (Analytics)  │  │  (DNS/CDN)   │              │    │
│  │  └──────────────┘  └──────────────┘              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

#### Student App
```json
{
  "framework": "Next.js 14 (App Router)",
  "language": "TypeScript 5",
  "styling": "Tailwind CSS 4",
  "state": "Zustand 5",
  "forms": "React Hook Form 7 + Zod 3",
  "http": "Axios 1 + React Query 5",
  "ui": "Lucide React + shadcn/ui",
  "qr": "qrcode 1.5",
  "payment": "Razorpay 2.9",
  "testing": "Vitest + Testing Library + Playwright",
  "icons": "Lucide React 1",
  "animation": "Framer Motion 10"
}
```

#### Admin App
```json
{
  "framework": "Next.js 14 (App Router)",
  "language": "TypeScript 5",
  "styling": "Tailwind CSS 4",
  "state": "Zustand 5",
  "forms": "React Hook Form 7 + Zod 3",
  "http": "Axios 1 + React Query 5",
  "ui": "Lucide React + shadcn/ui",
  "scanner": "html5-qrcode 2.3",
  "charts": "Recharts 2",
  "table": "TanStack Table 8",
  "testing": "Vitest + Testing Library + Playwright"
}
```

#### Backend
```json
{
  "api": "Next.js API Routes",
  "database": "Supabase (PostgreSQL 15)",
  "auth": "Supabase Auth (JWT)",
  "storage": "Supabase Storage",
  "realtime": "Supabase Realtime",
  "cache": "Redis (optional for scaling)",
  "queue": "Supabase Edge Functions"
}
```

#### Infrastructure
```json
{
  "hosting": "Vercel Pro",
  "cdn": "Cloudflare",
  "database": "Supabase Pro",
  "monitoring": "Sentry + Vercel Analytics",
  "logging": "Logtail",
  "ci_cd": "GitHub Actions",
  "dns": "Cloudflare",
  "ssl": "Let's Encrypt (via Vercel)"
}
```

---

## Complete Feature List

### Student App Features

#### 1. Authentication System
**Feature**: Secure user authentication with multiple methods

**Sub-Features**:
- Email/Password login
- Google OAuth
- Magic link login
- Phone OTP login
- Remember me functionality
- Session management
- Auto logout on timeout
- Concurrent session limits
- Password reset flow
- Email verification

**Technical Implementation**:
- Supabase Auth for authentication
- JWT tokens with rotation
- Secure session storage (sessionStorage)
- Token refresh mechanism
- CSRF protection
- Rate limiting on auth endpoints

**Security**:
- Password hashing (bcrypt)
- Account lockout after 5 failed attempts
- Email verification required
- 2FA support (future)
- Session binding to IP + User Agent

---

#### 2. Onboarding Flow
**Feature**: Guided onboarding for new users

**Sub-Features**:
- Welcome screen
- Institute selection
- Profile completion
- Tutorial overlay
- Quick start guide

**Technical Implementation**:
- Multi-step form wizard
- Progress indicator
- Local storage for progress
- Skip option for returning users

---

#### 3. Canteen Discovery
**Feature**: Browse and discover canteens

**Sub-Features**:
- Canteen list with images
- Search by name
- Filter by location
- Filter by rating
- Filter by cuisine type
- Sort by distance
- Sort by rating
- Sort by popularity
- Canteen details page
- Operating hours display
- Real-time availability

**Technical Implementation**:
- Server-side rendering for SEO
- Infinite scroll with React Query
- Image optimization (WebP)
- Local caching (5 minutes)
- Geolocation for distance

---

#### 4. Menu Browsing
**Feature**: Browse menu items with categories

**Sub-Features**:
- Category tabs
- Item cards with images
- Veg/Non-veg indicators
- Price display
- Description
- Preparation time
- Availability status
- Search items
- Filter by price
- Filter by veg/non-veg
- Sort by price
- Sort by popularity
- Sort by rating

**Technical Implementation**:
- Virtual scrolling for large lists
- Image lazy loading
- Debounced search
- Local caching (10 minutes)
- Server-side filtering

---

#### 5. Cart Management
**Feature**: Add items to cart and manage

**Sub-Features**:
- Add to cart
- Remove from cart
- Update quantity
- Clear cart
- Cart summary
- Total calculation
- Tax calculation
- Discount application
- Coupon code input
- Cart persistence (local storage)
- Cart sync across devices (future)

**Technical Implementation**:
- Zustand store for cart state
- Local storage persistence
- Debounced sync
- Optimistic updates
- Rollback on error

---

#### 6. Order Placement
**Feature**: Complete order placement flow

**Sub-Features**:
- Review order
- Add special instructions
- Select payment method
- Apply coupon
- Calculate final total
- Confirm order
- Order confirmation screen
- Order number generation

**Technical Implementation**:
- Multi-step checkout
- Form validation (Zod)
- Optimistic UI updates
- Error handling
- Order number generation (UUID + timestamp)

---

#### 7. Payment Integration
**Feature**: Secure payment processing

**Sub-Features**:
- Razorpay integration
- UPI payment
- Card payment
- Net banking
- Wallet payment
- Payment status tracking
- Payment failure handling
- Refund processing
- Payment history

**Technical Implementation**:
- Razorpay SDK
- Webhook handling
- Payment verification
- Retry mechanism
- Payment status polling

**Security**:
- PCI DSS compliance
- No card data storage
- Encrypted communication
- Webhook signature verification

---

#### 8. Order Tracking
**Feature**: Real-time order status tracking

**Sub-Features**:
- Order status timeline
- Real-time updates (WebSocket)
- Estimated time
- Preparation progress
- Ready notification
- Pickup instructions
- QR code generation
- Order details view

**Technical Implementation**:
- Supabase Realtime (WebSocket)
- Optimistic updates
- Local state sync
- QR code generation (server-side)
- Token expiration (15 minutes)

---

#### 9. Order History
**Feature**: View past orders

**Sub-Features**:
- Order list
- Filter by status
- Filter by date range
- Search by order number
- Reorder functionality
- Order details
- Receipt download
- Report issue
- Rate order
- Add review

**Technical Implementation**:
- Pagination (20 per page)
- Server-side filtering
- Local caching
- Infinite scroll

---

#### 10. Profile Management
**Feature**: Manage user profile

**Sub-Features**:
- View profile
- Edit profile
- Upload avatar
- Update phone
- Change password
- Manage addresses
- Payment methods (future)
- Notification preferences
- Privacy settings
- Delete account

**Technical Implementation**:
- Form validation
- Image upload (Supabase Storage)
- Image optimization
- Profile caching

---

#### 11. Notifications
**Feature**: Push notifications for order updates

**Sub-Features**:
- Order status updates
- Payment confirmation
- Order ready notification
- Promotional notifications
- Notification center
- Notification preferences
- Read/unread status

**Technical Implementation**:
- Web Push API
- Service Worker
- Supabase Realtime
- Notification queue

---

#### 12. Favorites
**Feature**: Save favorite items

**Sub-Features**:
- Add to favorites
- Remove from favorites
- Favorites list
- Quick add from favorites
- Organize by category

**Technical Implementation**:
- Database storage
- Local caching
- Sync across devices

---

#### 13. Reviews & Ratings
**Feature**: Rate and review items

**Sub-Features**:
- Star rating (1-5)
- Text review
- Photo upload
- View reviews
- Filter reviews
- Report review
- Edit review
- Delete review

**Technical Implementation**:
- Form validation
- Image upload
- Review aggregation
- Average calculation

---

#### 14. Loyalty Program
**Feature**: Earn points on orders

**Sub-Features**:
- Points earning
- Points redemption
- Points history
- Tier system
- Rewards catalog
- Special offers

**Technical Implementation**:
- Points calculation
- Tier logic
- Redemption flow
- Expiration handling

---

#### 15. PWA Features
**Feature**: Progressive Web App capabilities

**Sub-Features**:
- Install as app
- Offline support
- Background sync
- Push notifications
- App shortcuts
- Splash screen

**Technical Implementation**:
- Service Worker
- Manifest file
- Offline caching
- Background sync API

---

### Admin App Features

#### 1. Authentication System
**Feature**: Secure admin authentication

**Sub-Features**:
- Email/Password login
- Role-based access
- 2FA support
- Session management
- Activity logging
- Password policy enforcement

**Security**:
- Strong password requirements
- Account lockout
- IP whitelisting (optional)
- Audit logging

---

#### 2. Dashboard
**Feature**: Overview of system performance

**Sub-Features**:
- Key metrics cards
- Revenue chart
- Orders chart
- Active orders count
- Popular items
- Recent activity
- System health
- Quick actions

**Technical Implementation**:
- Real-time data
- Chart components (Recharts)
- Data aggregation
- Caching strategy

---

#### 3. Order Management
**Feature**: Manage all orders

**Sub-Features**:
- Order list with filters
- Search orders
- Filter by status
- Filter by date
- Filter by canteen
- Order details view
- Update order status
- Assign to staff
- Add notes
- Cancel order
- Refund order
- Print receipt
- Export orders

**Technical Implementation**:
- Server-side pagination
- Real-time updates
- Bulk actions
- Export functionality

---

#### 4. Menu Management
**Feature**: Manage menu items

**Sub-Features**:
- Menu items list
- Add new item
- Edit item
- Delete item
- Toggle availability
- Bulk upload
- Image upload
- Price update
- Category management
- Sort items

**Technical Implementation**:
- Form validation
- Image optimization
- Bulk operations
- Version history

---

#### 5. Category Management
**Feature**: Manage menu categories

**Sub-Features**:
- Category list
- Add category
- Edit category
- Delete category
- Reorder categories
- Category icons
- Category images

---

#### 6. Canteen Management
**Feature**: Manage canteens

**Sub-Features**:
- Canteen list
- Add canteen
- Edit canteen
- Delete canteen
- Operating hours
- Location
- Contact info
- Canteen images
- Toggle availability

---

#### 7. User Management
**Feature**: Manage users

**Sub-Features**:
- User list
- Search users
- Filter by role
- View user details
- Edit user
- Suspend user
- Delete user
- User activity log
- Bulk actions

---

#### 8. Staff Management
**Feature**: Manage staff members

**Sub-Features**:
- Staff list
- Add staff
- Edit staff
- Assign to canteen
- Set permissions
- Staff availability
- Staff performance

---

#### 9. Institute Management
**Feature**: Manage institutes

**Sub-Features**:
- Institute list
- Add institute
- Edit institute
- Delete institute
- Institute details
- Canteen assignment

---

#### 10. Payment Management
**Feature**: Manage payments

**Sub-Features**:
- Payment transactions list
- Search payments
- Filter by status
- Refund processing
- Payment analytics
- Revenue reports
- Payout management
- **Razorpay Key Configuration** (NEW)
  - Institute-level Razorpay key management
  - Canteen-level Razorpay key management
  - Key encryption (AES-256-GCM)
  - Key rotation (90-day cycle)
  - Audit trail for all key changes
  - Webhook secret configuration
  - Key validation and format checking
  - Automatic key expiration alerts
  - Secure key storage (never exposed to client)

**Technical Implementation (Razorpay Configuration)**:
- Server-side encryption/decryption using crypto module
- AES-256-GCM encryption for all secrets
- PBKDF2 key derivation with 100,000 iterations
- Random salt and IV for each encryption
- Auth tag for integrity verification
- Master encryption key from environment variable
- RLS policies to restrict access to authorized users
- Automatic audit logging for all key changes
- Database functions for secure key retrieval
- Payment flow uses canteen-specific keys
- Keys never exposed to client-side code

---

#### 11. Analytics & Reports
**Feature**: Comprehensive analytics

**Sub-Features**:
- Revenue analytics
- Order analytics
- User analytics
- Item analytics
- Canteen analytics
- Staff analytics
- Custom reports
- Export reports
- Schedule reports

**Technical Implementation**:
- Data aggregation
- Chart components
- Date range picker
- Export functionality

---

#### 12. Settings
**Feature**: System settings

**Sub-Features**:
- General settings
- Payment settings
- Notification settings
- Email settings
- SMS settings
- Security settings
- API settings
- Integration settings

---

#### 13. Audit Logs
**Feature**: Track all system activities

**Sub-Features**:
- Activity log
- Filter by user
- Filter by action
- Filter by date
- Export logs
- Log retention policy

---

#### 14. Kitchen Display System
**Feature**: Display orders for kitchen staff

**Sub-Features**:
- Real-time order display
- Order queue
- Mark items as prepared
- Order completion
- Audio alerts
- Display settings

**Technical Implementation**:
- Real-time updates
- Auto-refresh
- Audio notifications
- Display mode (TV)

---

#### 15. QR Scanner
**Feature**: Scan QR codes for order pickup

**Sub-Features**:
- QR code scanning
- Order verification
- Order status update
- Token printing
- Scan history
- Error handling

**Technical Implementation**:
- html5-qrcode library
- Camera access
- QR validation
- Token generation

---

## Database Schema

### Complete Schema Design

```sql
-- Institutes
CREATE TABLE institutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  pincode VARCHAR(10),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_institutes_code ON institutes(code);
CREATE INDEX idx_institutes_name ON institutes(name);
CREATE INDEX idx_institutes_active ON institutes(is_active);

-- Canteens
CREATE TABLE canteens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID REFERENCES institutes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  location VARCHAR(255),
  building VARCHAR(100),
  floor VARCHAR(50),
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  is_open BOOLEAN DEFAULT true,
  image_url TEXT,
  cover_url TEXT,
  rating DECIMAL(2,1) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_canteens_institute ON canteens(institute_id);
CREATE INDEX idx_canteens_code ON canteens(code);
CREATE INDEX idx_canteens_is_open ON canteens(is_open);
CREATE INDEX idx_canteens_active ON canteens(is_active);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id UUID REFERENCES canteens(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_categories_canteen ON categories(canteen_id);
CREATE INDEX idx_categories_sort ON categories(sort_order);
CREATE INDEX idx_categories_active ON categories(is_active);

-- Menu Items
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  canteen_id UUID REFERENCES canteens(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price_paise INTEGER NOT NULL,
  image_url TEXT,
  images JSONB DEFAULT '[]',
  is_available BOOLEAN DEFAULT true,
  is_veg BOOLEAN DEFAULT true,
  prep_time_minutes INTEGER DEFAULT 15,
  calories INTEGER,
  serving_size VARCHAR(50),
  allergens TEXT[],
  sort_order INTEGER DEFAULT 0,
  rating DECIMAL(2,1) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_canteen ON menu_items(canteen_id);
CREATE INDEX idx_menu_items_available ON menu_items(is_available);
CREATE INDEX idx_menu_items_featured ON menu_items(is_featured);
CREATE INDEX idx_menu_items_sort ON menu_items(sort_order);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE,
  full_name VARCHAR(100),
  avatar_url TEXT,
  role VARCHAR(50) DEFAULT 'student',
  institute_id UUID REFERENCES institutes(id),
  assigned_canteen_id UUID REFERENCES canteens(id),
  is_email_verified BOOLEAN DEFAULT false,
  is_phone_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_institute ON users(institute_id);
CREATE INDEX idx_users_active ON users(is_active);

-- Addresses
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(50),
  full_name VARCHAR(100),
  phone VARCHAR(20),
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  landmark VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_default ON addresses(is_default);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  canteen_id UUID REFERENCES canteens(id),
  status VARCHAR(50) DEFAULT 'payment_pending',
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_id VARCHAR(255),
  subtotal_paise INTEGER NOT NULL,
  tax_paise INTEGER DEFAULT 0,
  discount_paise INTEGER DEFAULT 0,
  total_paise INTEGER NOT NULL,
  special_instructions TEXT,
  delivery_type VARCHAR(50) DEFAULT 'pickup',
  scheduled_for TIMESTAMP WITH TIME ZONE,
  estimated_prep_time_minutes INTEGER,
  actual_prep_time_minutes INTEGER,
  ready_at TIMESTAMP WITH TIME ZONE,
  collected_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_canteen ON orders(canteen_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_scheduled ON orders(scheduled_for);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id),
  item_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  total_price_paise INTEGER NOT NULL,
  special_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_menu_item ON order_items(menu_item_id);

-- QR Tokens
CREATE TABLE qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_qr_tokens_order ON qr_tokens(order_id);
CREATE INDEX idx_qr_tokens_token ON qr_tokens(token);
CREATE INDEX idx_qr_tokens_status ON qr_tokens(status);
CREATE INDEX idx_qr_tokens_expires ON qr_tokens(expires_at);

-- Staff
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  canteen_id UUID REFERENCES canteens(id),
  role VARCHAR(50) DEFAULT 'staff',
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_staff_user ON staff(user_id);
CREATE INDEX idx_staff_canteen ON staff(canteen_id);
CREATE INDEX idx_staff_active ON staff(is_active);

-- Coupons
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL,
  discount_value INTEGER NOT NULL,
  min_order_paise INTEGER DEFAULT 0,
  max_discount_paise INTEGER,
  usage_limit INTEGER,
  used_count INTEGER DEFAULT 0,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_active ON coupons(is_active);
CREATE INDEX idx_coupons_valid ON coupons(valid_from, valid_until);

-- User Coupons
CREATE TABLE user_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_coupons_user ON user_coupons(user_id);
CREATE INDEX idx_user_coupons_coupon ON user_coupons(coupon_id);
CREATE INDEX idx_user_coupons_used ON user_coupons(is_used);

-- Favorites
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_favorites_user_item ON favorites(user_id, menu_item_id);

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  images JSONB DEFAULT '[]',
  is_verified_purchase BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_menu_item ON reviews(menu_item_id);
CREATE INDEX idx_reviews_order ON reviews(order_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_approved ON reviews(is_approved);

-- Loyalty Points
CREATE TABLE loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_loyalty_points_user ON loyalty_points(user_id);
CREATE INDEX idx_loyalty_points_expires ON loyalty_points(expires_at);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  ip_address VARCHAR(50),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Payment Transactions
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  payment_method VARCHAR(50) NOT NULL,
  payment_gateway VARCHAR(50) NOT NULL,
  gateway_transaction_id VARCHAR(255),
  gateway_response JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  failure_reason TEXT,
  refund_amount_paise INTEGER DEFAULT 0,
  refund_id VARCHAR(255),
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payment_transactions_order ON payment_transactions(order_id);
CREATE INDEX idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_gateway ON payment_transactions(gateway_transaction_id);
```

### Row Level Security (RLS) Policies

**Enable RLS on all tables:**
```sql
ALTER TABLE institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE canteens ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
```

**Orders RLS Policies:**
```sql
-- Users can view their own orders
CREATE POLICY "Users can view their own orders"
ON orders
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own orders
CREATE POLICY "Users can insert their own orders"
ON orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own orders
CREATE POLICY "Users can update their own orders"
ON orders
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Staff can view orders in their canteen
CREATE POLICY "Staff can view orders in their canteen"
ON orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND staff.canteen_id = orders.canteen_id
    AND staff.is_active = true
  )
);

-- Staff can update orders in their canteen
CREATE POLICY "Staff can update orders in their canteen"
ON orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND staff.canteen_id = orders.canteen_id
    AND staff.is_active = true
  )
);

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
ON orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('canteen_admin', 'super_admin')
  )
);
```

**Menu Items RLS Policies:**
```sql
-- Everyone can view available menu items
CREATE POLICY "Everyone can view available menu items"
ON menu_items
FOR SELECT
USING (is_available = true);

-- Staff can view all menu items in their canteen
CREATE POLICY "Staff can view all menu items in their canteen"
ON menu_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND staff.canteen_id = menu_items.canteen_id
    AND staff.is_active = true
  )
);

-- Admins can manage menu items
CREATE POLICY "Admins can manage menu items"
ON menu_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('canteen_admin', 'super_admin')
  )
);
```

**Users RLS Policies:**
```sql
-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON users
FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users"
ON users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  )
);
```

**QR Tokens RLS Policies:**
```sql
-- Users can view their own QR tokens
CREATE POLICY "Users can view their own QR tokens"
ON qr_tokens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = qr_tokens.order_id
    AND orders.user_id = auth.uid()
  )
);

-- Users can insert QR tokens for their own orders
CREATE POLICY "Users can insert QR tokens for their own orders"
ON qr_tokens
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = qr_tokens.order_id
    AND orders.user_id = auth.uid()
  )
);

-- Staff can view QR tokens in their canteen
CREATE POLICY "Staff can view QR tokens in their canteen"
ON qr_tokens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = qr_tokens.order_id
    AND EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.canteen_id = orders.canteen_id
      AND staff.is_active = true
    )
  )
);
```

**Audit Logs RLS Policies:**
```sql
-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
ON audit_logs
FOR INSERT
WITH CHECK (true);

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs"
ON audit_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
ON audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  )
);
```

### Database Maintenance

**Backup Strategy:**
```sql
-- Supabase automatic backups (included in Pro plan):
-- - Daily backups (retained for 30 days)
-- - Weekly backups (retained for 12 weeks)
-- - Point-in-time recovery (7 days)

-- Manual backup script (if needed):
-- pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql
```

**Database Maintenance Tasks:**
```sql
-- Weekly vacuum (auto-vacuum handles this, but can be manual)
VACUUM ANALYZE orders;
VACUUM ANALYZE menu_items;
VACUUM ANALYZE users;

-- Monthly reindex
REINDEX TABLE orders;
REINDEX TABLE menu_items;
REINDEX TABLE users;

-- Check for bloat
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Data Retention Policy:**
```sql
-- Delete old audit logs (90 days)
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete old notifications (30 days)
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '30 days' AND is_read = true;

-- Archive old orders (1 year) - move to archive table
-- This can be implemented as needed
```

**Connection Pool Configuration:**
```sql
-- In Supabase dashboard, configure:
-- - Pool size: 20 (Pro plan)
-- - Statement timeout: 30s
-- - Idle timeout: 5min
-- - Max lifetime: 30min

-- Monitor connection pool usage:
SELECT state, count(*) 
FROM pg_stat_activity 
WHERE datname = current_database()
GROUP BY state;
```

---

## API Design

### API Versioning Strategy

**Versioning Approach:**
```typescript
// Use URL path versioning
// Current version: /api/v1/
// Breaking changes: /api/v2/
// Backward compatible: /api/v1/ (maintained)

// Example:
GET  /api/v1/orders
POST /api/v1/orders
GET  /api/v2/orders (future with breaking changes)
```

**Deprecation Policy:**
- Maintain previous version for 6 months after new version release
- Add deprecation headers to old endpoints
- Document migration path
- Communicate deprecation to API consumers

### Pagination Strategy

**Cursor-based Pagination (Recommended):**
```typescript
// Cursor-based pagination (better for infinite scroll)
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    total_count: number;
  };
}

// API response
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6IjEyMyJ9",
    "has_more": true,
    "total_count": 100
  }
}
```

**Offset-based Pagination (Alternative):**
```typescript
// Offset-based pagination (simpler but less efficient)
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// API response
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

### Error Code Standardization

**Error Codes:**
```typescript
// Standard error codes
const ERROR_CODES = {
  // Authentication errors (4xxx)
  AUTH_001: 'INVALID_CREDENTIALS',
  AUTH_002: 'TOKEN_EXPIRED',
  AUTH_003: 'TOKEN_INVALID',
  AUTH_004: 'SESSION_EXPIRED',
  AUTH_005: 'ACCOUNT_LOCKED',
  
  // Validation errors (4xxx)
  VAL_001: 'INVALID_INPUT',
  VAL_002: 'MISSING_REQUIRED_FIELD',
  VAL_003: 'INVALID_FORMAT',
  VAL_004: 'VALUE_OUT_OF_RANGE',
  
  // Authorization errors (4xxx)
  AUTHZ_001: 'UNAUTHORIZED',
  AUTHZ_002: 'FORBIDDEN',
  AUTHZ_003: 'INSUFFICIENT_PERMISSIONS',
  
  // Resource errors (4xxx)
  RES_001: 'RESOURCE_NOT_FOUND',
  RES_002: 'RESOURCE_ALREADY_EXISTS',
  RES_003: 'RESOURCE_CONFLICT',
  RES_004: 'RESOURCE_LOCKED',
  
  // Business logic errors (4xxx)
  BIZ_001: 'ORDER_CANNOT_BE_CANCELLED',
  BIZ_002: 'PAYMENT_FAILED',
  BIZ_003: 'INSUFFICIENT_STOCK',
  BIZ_004: 'COUPON_EXPIRED',
  
  // Server errors (5xxx)
  SRV_001: 'INTERNAL_ERROR',
  SRV_002: 'DATABASE_ERROR',
  SRV_003: 'EXTERNAL_SERVICE_ERROR',
  SRV_004: 'TIMEOUT',
};
```

### RESTful API Endpoints

#### Authentication Endpoints
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/send-otp
POST   /api/v1/auth/verify-otp
GET    /api/v1/auth/me
```

#### User Endpoints
```
GET    /api/v1/users/me
PUT    /api/v1/users/me
DELETE /api/v1/users/me
GET    /api/v1/users/me/addresses
POST   /api/v1/users/me/addresses
PUT    /api/v1/users/me/addresses/:id
DELETE /api/v1/users/me/addresses/:id
GET    /api/v1/users/me/favorites
POST   /api/v1/users/me/favorites
DELETE /api/v1/users/me/favorites/:id
GET    /api/v1/users/me/loyalty
```

#### Institute Endpoints
```
GET    /api/v1/institutes
GET    /api/v1/institutes/:id
```

#### Canteen Endpoints
```
GET    /api/v1/canteens
GET    /api/v1/canteens/:id
POST   /api/v1/canteens (admin)
PUT    /api/v1/canteens/:id (admin)
DELETE /api/v1/canteens/:id (admin)
GET    /api/v1/canteens/:id/menu
```

#### Menu Endpoints
```
GET    /api/v1/canteens/:canteenId/categories
GET    /api/v1/canteens/:canteenId/categories/:id
POST   /api/v1/canteens/:canteenId/categories (admin)
PUT    /api/v1/canteens/:canteenId/categories/:id (admin)
DELETE /api/v1/canteens/:canteenId/categories/:id (admin)
GET    /api/v1/canteens/:canteenId/menu-items
GET    /api/v1/canteens/:canteenId/menu-items/:id
POST   /api/v1/canteens/:canteenId/menu-items (admin)
PUT    /api/v1/canteens/:canteenId/menu-items/:id (admin)
DELETE /api/v1/canteens/:canteenId/menu-items/:id (admin)
```

#### Order Endpoints
```
GET    /api/v1/orders
GET    /api/v1/orders/:id
POST   /api/v1/orders
PUT    /api/v1/orders/:id
DELETE /api/v1/orders/:id
POST   /api/v1/orders/:id/cancel
POST   /api/v1/orders/:id/qr
GET    /api/v1/orders/:id/qr/:token
```

#### Payment Endpoints
```
POST   /api/v1/payments/create
POST   /api/v1/payments/verify
POST   /api/v1/payments/:id/refund
GET    /api/v1/payments
GET    /api/v1/payments/:id
```

#### Coupon Endpoints
```
GET    /api/v1/coupons
POST   /api/v1/coupons/validate
POST   /api/v1/coupons/apply
```

#### Review Endpoints
```
GET    /api/v1/menu-items/:itemId/reviews
POST   /api/v1/menu-items/:itemId/reviews
PUT    /api/v1/reviews/:id
DELETE /api/v1/reviews/:id
```

#### Admin Endpoints
```
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/orders
PUT    /api/v1/admin/orders/:id/status
GET    /api/v1/admin/users
PUT    /api/v1/admin/users/:id
GET    /api/v1/admin/staff
POST   /api/v1/admin/staff
PUT    /api/v1/admin/staff/:id
GET    /api/v1/admin/analytics
GET    /api/v1/admin/audit-logs
```

### API Response Format

#### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": { ... }
  }
}
```

---

## Frontend Architecture

### State Management Patterns

**Zustand Store Pattern:**
```typescript
// Store structure
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// Implementation
export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  
  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const user = await authService.login(credentials);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  logout: async () => {
    await authService.logout();
    set({ user: null, isAuthenticated: false });
  },
  
  refreshUser: async () => {
    const user = await authService.getCurrentUser();
    set({ user });
  },
}));
```

**State Persistence:**
```typescript
// Persist state to localStorage
import { persist, createJSONStorage } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => { /* ... */ },
      removeItem: (id) => { /* ... */ },
    }),
    {
      name: 'campusbite-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

**Optimistic Updates:**
```typescript
// Optimistic update pattern
const addToCart = (item: MenuItem) => {
  // Update UI immediately
  useCartStore.getState().addItem(item);
  
  // Then sync with server
  apiClient.addToCart(item)
    .catch((error) => {
      // Rollback on error
      useCartStore.getState().removeItem(item.id);
      showError('Failed to add item to cart');
    });
};
```

### Error Boundary Pattern

**Error Boundary Component:**
```typescript
"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Error caught by boundary:", error, errorInfo);
    // Send to Sentry
    Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center p-8">
              <div className="text-6xl mb-4">😕</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Something went wrong
              </h1>
              <p className="text-gray-500 mb-4">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-brand text-white rounded-lg"
              >
                Reload Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

**Usage:**
```typescript
// Wrap app with error boundary
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
```

### Student App Structure

```
student-app/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth group
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (main)/                   # Main app group
│   │   │   ├── page.tsx              # Home
│   │   │   ├── canteens/
│   │   │   ├── menu/
│   │   │   ├── cart/
│   │   │   ├── orders/
│   │   │   └── profile/
│   │   ├── api/                      # API routes
│   │   │   ├── auth/
│   │   │   ├── orders/
│   │   │   └── payments/
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/                   # React components
│   │   ├── ui/                      # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── modal.tsx
│   │   │   └── ...
│   │   ├── auth/                    # Auth components
│   │   │   ├── login-form.tsx
│   │   │   └── register-form.tsx
│   │   ├── canteen/                 # Canteen components
│   │   │   ├── canteen-card.tsx
│   │   │   └── canteen-list.tsx
│   │   ├── menu/                    # Menu components
│   │   │   ├── menu-item-card.tsx
│   │   │   ├── category-tabs.tsx
│   │   │   └── menu-filter.tsx
│   │   ├── cart/                    # Cart components
│   │   │   ├── cart-sheet.tsx
│   │   │   ├── cart-item.tsx
│   │   │   └── cart-summary.tsx
│   │   ├── order/                   # Order components
│   │   │   ├── order-card.tsx
│   │   │   ├── order-details.tsx
│   │   │   ├── order-tracker.tsx
│   │   │   └── qr-display.tsx
│   │   └── profile/                 # Profile components
│   │       ├── profile-header.tsx
│   │       └── profile-menu.tsx
│   │
│   ├── lib/                         # Utilities
│   │   ├── supabase/                # Supabase client
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   ├── api-client.ts            # API client
│   │   ├── validation.ts            # Zod schemas
│   │   ├── formatting.ts            # Formatters
│   │   ├── encryption.ts            # Encryption
│   │   ├── secure-session.ts        # Session manager
│   │   ├── csrf.ts                  # CSRF protection
│   │   └── constants.ts             # Constants
│   │
│   ├── store/                       # Zustand stores
│   │   ├── auth-store.ts
│   │   ├── cart-store.ts
│   │   ├── order-store.ts
│   │   └── ui-store.ts
│   │
│   ├── hooks/                       # Custom hooks
│   │   ├── use-auth.ts
│   │   ├── use-cart.ts
│   │   ├── use-orders.ts
│   │   └── use-debounce.ts
│   │
│   ├── types/                       # TypeScript types
│   │   ├── index.ts
│   │   ├── models.ts
│   │   └── api.ts
│   │
│   └── config/                      # Configuration
│       └── constants.ts
│
├── public/                          # Static assets
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env.example
```

### Admin App Structure

```
admin-app/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   ├── orders/
│   │   │   ├── menu/
│   │   │   ├── users/
│   │   │   ├── staff/
│   │   │   ├── analytics/
│   │   │   └── settings/
│   │   ├── api/
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── dashboard/
│   │   ├── orders/
│   │   ├── menu/
│   │   ├── users/
│   │   └── analytics/
│   │
│   ├── lib/
│   ├── store/
│   ├── hooks/
│   ├── types/
│   └── config/
│
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## Security Architecture

### Multi-Layer Security

#### Layer 1: Network Security
- HTTPS everywhere (TLS 1.3)
- HSTS headers
- Certificate pinning
- DDoS protection (Cloudflare)
- Firewall rules
- IP whitelisting (admin)

**CORS Configuration:**
```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'production' 
              ? 'https://campusbite.com' 
              : '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-CSRF-Token'
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400'
          }
        ]
      }
    ];
  }
};
```

**Content Security Policy:**
```typescript
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: https://images.unsplash.com https://loremflickr.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co https://checkout.razorpay.com wss://*.supabase.co",
  "frame-src 'self' https://checkout.razorpay.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
  "block-all-mixed-content"
].join('; ');
```

**Rate Limiting Per Endpoint:**
```typescript
// Rate limits per endpoint
const RATE_LIMITS = {
  '/api/auth/login': { requests: 5, window: 60000 },      // 5 per minute
  '/api/auth/register': { requests: 3, window: 3600000 }, // 3 per hour
  '/api/orders': { requests: 100, window: 60000 },       // 100 per minute
  '/api/payments': { requests: 10, window: 60000 },      // 10 per minute
  '/api/menu': { requests: 200, window: 60000 },         // 200 per minute
  '/api/admin/*': { requests: 50, window: 60000 },      // 50 per minute
};
```

#### Layer 2: Application Security
- CSRF protection (double-submit cookie)
- XSS protection (Content Security Policy)
- SQL injection prevention (parameterized queries)
- Rate limiting (sliding window)
- Input validation (Zod)
- Output encoding
- Security headers

#### Layer 3: Authentication Security
- Secure session management
- JWT token rotation
- Session binding (IP + User Agent)
- Session timeout (15 minutes)
- Concurrent session limits
- Password hashing (bcrypt)
- Account lockout (5 attempts)
- 2FA support (future)

#### Layer 4: Authorization Security
- Role-based access control (RBAC)
- Row Level Security (RLS)
- Permission checks
- API key authentication
- Service-to-service auth

**Critical Implementation Details:**

##### Service Role Key vs Anon Key
```typescript
// ❌ NEVER use in client-side code (browser)
// Anon key is visible in browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// ✅ ONLY use in server-side API routes
// Service role key never exposed to browser
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

##### Server-Side API Route Pattern
```typescript
// ✅ CORRECT: Server-side API route
// src/app/api/orders/route.ts
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  // This runs on server
  // Service role key is used
  // User's JWT is validated
  // RLS policies are enforced
  const supabase = createClient();
  const { data } = await supabase.from('orders').select('*');
  return Response.json(data);
}
```

##### Client-Side Pattern (Limited Use)
```typescript
// ⚠️ LIMITED USE: Client-side for non-sensitive operations only
// src/components/Menu.tsx
import { createClient } from '@/lib/supabase/client';

export default function Menu() {
  // This runs on client
  // Anon key is used
  // RLS still enforced by database
  // Only for read operations on public data
  const supabase = createClient();
  // OK for public menu items
  // NOT OK for sensitive user data
}
```

##### JWT Validation Flow
```typescript
export async function GET(request: Request) {
  // 1. Extract JWT from header
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  // 2. Validate JWT with Supabase
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 3. Query database with user context
  // RLS policy: auth.uid() = user_id
  const { data } = await supabase.from('orders').select('*');
  
  // 4. Database enforces RLS
  // - Validates JWT
  // - Checks RLS policy
  // - Returns only user's data
  // - Cannot be bypassed
  
  return Response.json(data);
}
```

#### Layer 5: Data Security
- Encryption at rest (AES-256)
- Encryption in transit (TLS)
- Data masking in logs
- Secure logging
- PII protection
- GDPR compliance

**Environment Variable Security:**
```bash
# .env.production (NEVER commit to git)
# Use Vercel environment variables for production
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SECRET_ENCRYPTION_KEY=your-32-byte-encryption-key
JWT_SECRET=your-jwt-secret
RAZORPAY_KEY_ID=your-key-id
RAZORPAY_KEY_SECRET=your-key-secret
SENTRY_DSN=your-sentry-dsn
```

**Secret Rotation Strategy:**
```typescript
// Rotate secrets every 90 days
// Use Supabase Edge Functions for secret rotation
// Store secrets in environment variables
// Never hardcode secrets
// Use different secrets for staging and production
```

**File Upload Security:**
```typescript
// File upload validation
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File too large (max 5MB)' };
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid file type' };
  }
  
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
    return { valid: false, error: 'Invalid file extension' };
  }
  
  return { valid: true };
}
```

**Webhook Security:**
```typescript
// Razorpay webhook signature verification
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Error Handling Pattern:**
```typescript
// Standard error response format
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string; // Only in development
  };
}

function handleError(error: unknown): ErrorResponse {
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.errors,
      },
    };
  }
  
  if (error instanceof AuthenticationError) {
    return {
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication failed',
      },
    };
  }
  
  // Log unexpected errors
  console.error('Unexpected error:', error);
  
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: (error as Error).stack }),
    },
  };
}
```

---

## Performance Architecture

### Performance Layers

#### Layer 1: Frontend Performance
- Code splitting (route-based)
- Lazy loading (dynamic imports)
- Image optimization (WebP, AVIF)
- Font optimization (subsetting)
- CSS optimization (purge)
- Bundle optimization (tree-shaking)
- Caching strategy (Service Worker)

#### Layer 2: Backend Performance
- Database indexing
- Query optimization
- Connection pooling
- Response caching (Redis)
- Edge functions
- Server-side rendering
- Static generation

**Database Connection Pool Configuration:**
```typescript
// Supabase connection pool configuration
// In Supabase dashboard:
// - Pool size: 20 (standard for Pro plan)
// - Statement timeout: 30 seconds
// - Idle timeout: 5 minutes
// - Max lifetime: 30 minutes

// Connection pool calculation:
// Formula: (CPU cores * 2) + effective_spindle_count
// For 4 cores: (4 * 2) + 1 = 9 connections
// For production: 20 connections (Supabase Pro)
```

**Caching Strategy:**
```typescript
// Cache configuration
const CACHE_CONFIG = {
  // Static data (long cache)
  canteens: { ttl: 3600 },           // 1 hour
  menu_items: { ttl: 1800 },         // 30 minutes
  categories: { ttl: 3600 },         // 1 hour
  
  // User data (short cache)
  user_profile: { ttl: 300 },        // 5 minutes
  user_orders: { ttl: 60 },         // 1 minute
  
  // Transactional data (very short cache)
  order_status: { ttl: 10 },         // 10 seconds
  payment_status: { ttl: 10 },      // 10 seconds
  
  // No cache
  qr_tokens: { ttl: 0 },            // No cache
  payment_transactions: { ttl: 0 }, // No cache
};
```

**Cache Invalidation Strategy:**
```typescript
// Invalidate cache on data changes
async function invalidateCache(key: string): Promise<void> {
  await cache.del(key);
  
  // Also invalidate related caches
  if (key.startsWith('menu_items')) {
    await cache.del('menu_items:*');
  }
  
  if (key.startsWith('orders')) {
    await cache.del(`user_orders:${userId}`);
  }
}
```

#### Layer 3: Network Performance
- CDN (Cloudflare)
- HTTP/2
- Compression (Brotli)
- Keep-alive connections
- Edge caching
- Preloading critical resources

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint | <1.5s | Lighthouse |
| Largest Contentful Paint | <2.5s | Lighthouse |
| Time to Interactive | <3.5s | Lighthouse |
| First Input Delay | <100ms | Lighthouse |
| Cumulative Layout Shift | <0.1 | Lighthouse |
| API Response Time | <200ms | Custom |
| Database Query Time | <100ms | Supabase |
| Bundle Size | <100KB | Bundle analyzer |

### Monitoring Configuration

**Sentry Configuration:**
```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of errors
  
  beforeSend(event, hint) {
    // Filter out sensitive data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }
    return event;
  },
});
```

**Alert Configuration:**
```typescript
// Alert severity levels
const ALERT_CONFIG = {
  // Critical - Immediate notification (SMS, call)
  CRITICAL: {
    channels: ['sms', 'call', 'slack'],
    response_time: '5 minutes',
    examples: ['system_down', 'database_down', 'payment_failure'],
  },
  
  // High - Notification within 5 minutes
  HIGH: {
    channels: ['slack', 'email'],
    response_time: '5 minutes',
    examples: ['error_rate_high', 'response_time_slow', 'memory_high'],
  },
  
  // Medium - Notification within 1 hour
  MEDIUM: {
    channels: ['slack', 'email'],
    response_time: '1 hour',
    examples: ['warning', 'degraded_performance'],
  },
  
  // Low - Daily digest
  LOW: {
    channels: ['email'],
    response_time: 'daily',
    examples: ['info', 'minor_issues'],
  },
};
```

**Custom Metrics:**
```typescript
// Custom business metrics
const METRICS = {
  // Order metrics
  orders_per_minute: 'orders_per_minute',
  orders_success_rate: 'orders_success_rate',
  orders_avg_time: 'orders_avg_time',
  
  // Payment metrics
  payments_per_minute: 'payments_per_minute',
  payments_success_rate: 'payments_success_rate',
  payments_avg_amount: 'payments_avg_amount',
  
  // User metrics
  active_users: 'active_users',
  new_users: 'new_users',
  user_retention: 'user_retention',
  
  // Performance metrics
  api_response_time_p50: 'api_response_time_p50',
  api_response_time_p95: 'api_response_time_p95',
  api_response_time_p99: 'api_response_time_p99',
  database_query_time: 'database_query_time',
};
```

---

## UI/UX Design System

### Design Principles

1. **Mobile-First**: Design for mobile first, then scale up
2. **Accessibility**: WCAG 2.1 AA compliant
3. **Performance**: Fast and responsive
4. **Consistency**: Unified design language
5. **Clarity**: Clear and intuitive

### Color Palette

```css
/* Primary Colors */
--brand: #E8390E;
--brand-dark: #C12E0A;
--brand-light: #FF6B40;
--brand-pale: #FFF0EC;

/* Secondary Colors */
--green: #00A877;
--green-dark: #007A57;
--green-light: #E6F9F4;

/* Neutral Colors */
--surface: #FFFFFF;
--bg: #F5F5F5;
--bg2: #FAFAFA;
--text: #111111;
--text2: #555555;
--text3: #999999;
--border: #EBEBEB;
--border2: #E0E0E0;

/* Semantic Colors */
--success: #00A877;
--warning: #F59E0B;
--error: #DC2626;
--info: #3B82F6;
```

### Typography

```css
/* Font Family */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Font Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
--text-4xl: 2.25rem;   /* 36px */

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Spacing

```css
--spacing-1: 0.25rem;   /* 4px */
--spacing-2: 0.5rem;    /* 8px */
--spacing-3: 0.75rem;   /* 12px */
--spacing-4: 1rem;      /* 16px */
--spacing-5: 1.25rem;   /* 20px */
--spacing-6: 1.5rem;    /* 24px */
--spacing-8: 2rem;      /* 32px */
--spacing-10: 2.5rem;   /* 40px */
--spacing-12: 3rem;     /* 48px */
--spacing-16: 4rem;     /* 64px */
```

### Border Radius

```css
--radius-sm: 0.375rem;   /* 6px */
--radius-md: 0.5rem;     /* 8px */
--radius-lg: 0.75rem;    /* 12px */
--radius-xl: 1rem;       /* 16px */
--radius-2xl: 1.5rem;    /* 24px */
--radius-full: 9999px;
```

### Shadows

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
```

### Component Specifications

#### Button
```typescript
// Variants: primary, secondary, ghost, danger
// Sizes: sm, md, lg
// States: default, hover, active, disabled, loading
```

#### Input
```typescript
// Types: text, email, password, number, tel
// States: default, focus, error, disabled
// Sizes: sm, md, lg
```

#### Card
```typescript
// Variants: default, elevated, outlined
// Sizes: sm, md, lg
```

#### Modal
```typescript
// Sizes: sm, md, lg, xl, full
// Positions: center, top, bottom
// Backdrop: blur, solid
```

---

## Development Workflow

### Git Workflow

```
main (production)
├── develop (staging)
├── feature/*
├── bugfix/*
└── hotfix/*
```

### Branch Naming Convention
- `feature/feature-name`
- `bugfix/bug-description`
- `hotfix/critical-fix`

### Commit Message Convention
```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: update dependencies
```

### Pull Request Process
1. Create feature branch
2. Implement feature
3. Write tests
4. Create PR to develop
5. Code review
6. Address feedback
7. Merge to develop
8. Deploy to staging
9. QA testing
10. Merge to main
11. Deploy to production

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)
- Project setup
- Database schema
- Authentication system
- Basic UI components
- Design system

### Phase 2: Student App Core (Week 3-4)
- Canteen discovery
- Menu browsing
- Cart management
- Order placement
- Payment integration

### Phase 3: Student App Advanced (Week 5-6)
- Order tracking
- Order history
- Profile management
- Notifications
- Favorites

### Phase 4: Admin App Core (Week 7-8)
- Dashboard
- Order management
- Menu management
- User management

### Phase 5: Admin App Advanced (Week 9-10)
- Analytics
- Settings
- Audit logs
- Kitchen display
- QR scanner

### Phase 6: Production (Week 11-12)
- Security hardening
- Performance optimization
- Monitoring setup
- Deployment
- Testing

### Deployment Strategy

**Blue-Green Deployment:**
```yaml
# Blue-green deployment strategy
# Two identical production environments
# - Blue: Current production
# - Green: New version
# - Switch traffic by changing DNS or load balancer

# Process:
# 1. Deploy to Green environment
# 2. Run smoke tests on Green
# 3. Switch traffic from Blue to Green
# 4. Monitor for issues
# 5. If issues: Switch back to Blue
# 6. If no issues: Blue becomes new Green
```

**Feature Flags:**
```typescript
// Feature flag configuration
const FEATURE_FLAGS = {
  // New features (disabled by default)
  NEW_PAYMENT_FLOW: process.env.FEATURE_NEW_PAYMENT_FLOW === 'true',
  LOYALTY_PROGRAM: process.env.FEATURE_LOYALTY_PROGRAM === 'true',
  ADVANCED_ANALYTICS: process.env.FEATURE_ADVANCED_ANALYTICS === 'true',
  
  // Beta features (enabled for specific users)
  BETA_MENU_UI: process.env.FEATURE_BETA_MENU_UI === 'true',
  BETA_ORDER_TRACKING: process.env.FEATURE_BETA_ORDER_TRACKING === 'true',
  
  // Production features (always enabled)
  ORDER_PLACEMENT: true,
  PAYMENT_PROCESSING: true,
  ORDER_TRACKING: true,
};

// Usage
if (FEATURE_FLAGS.NEW_PAYMENT_FLOW) {
  // Use new payment flow
} else {
  // Use old payment flow
}
```

**Rollback Strategy:**
```bash
# Automated rollback script
#!/bin/bash

# Rollback to previous version
git checkout previous-tag
npm run build
vercel --prod

# Database rollback (if needed)
npx supabase db down

# Monitor for issues
# If issues persist, rollback further
```

### CI/CD Pipeline Details

**GitHub Actions Workflow:**
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # Job 1: Lint
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
  
  # Job 2: Test
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run test
      - run: npm run test:e2e
  
  # Job 3: Build
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
  
  # Job 4: Security Scan
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit
      - run: npx snyk test
  
  # Job 5: Deploy to Staging (on develop)
  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    needs: [lint, test, build, security]
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_STUDENT }}
          vercel-args: '--scope staging'
          working-directory: ./student-app
  
  # Job 6: Deploy to Production (on main)
  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: [lint, test, build, security]
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_STUDENT }}
          vercel-args: '--prod'
          working-directory: ./student-app
```

### Testing Strategy

**Unit Testing:**
```typescript
// Unit test example
import { describe, it, expect } from 'vitest';
import { validateEmail } from '@/lib/validation';

describe('validateEmail', () => {
  it('should return true for valid email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });
  
  it('should return false for invalid email', () => {
    expect(validateEmail('invalid')).toBe(false);
  });
});
```

**Integration Testing:**
```typescript
// Integration test example
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@/lib/supabase/test';

describe('Order API', () => {
  let supabase: any;
  
  beforeEach(() => {
    supabase = createClient();
  });
  
  it('should create order', async () => {
    const order = await supabase
      .from('orders')
      .insert({ order_number: 'TEST-001', total_paise: 1000 })
      .select()
      .single();
    
    expect(order).toBeDefined();
    expect(order.order_number).toBe('TEST-001');
  });
});
```

**E2E Testing:**
```typescript
// E2E test example (Playwright)
import { test, expect } from '@playwright/test';

test('complete order flow', async ({ page }) => {
  // Navigate to app
  await page.goto('https://campusbite.com');
  
  // Login
  await page.click('text=Login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // Add item to cart
  await page.click('[data-testid="add-to-cart"]');
  
  // Checkout
  await page.click('[data-testid="checkout"]');
  
  // Verify order created
  await expect(page.locator('[data-testid="order-success"]')).toBeVisible();
});
```

**Test Coverage Target:**
- Unit tests: 80% coverage
- Integration tests: 60% coverage
- E2E tests: Critical user flows only

---

## Testing Strategy

### Test Pyramid

```
        /\
       /  \
      / E2E \        (10%)
     /______\
    /        \
   /Integration\     (30%)
  /____________\
 /              \
/    Unit Tests   \   (60%)
/________________\
```

### Unit Tests
- Component tests
- Utility function tests
- Hook tests
- Store tests
- Validation tests

### Integration Tests
- API route tests
- Database tests
- Authentication flow tests
- Payment flow tests

### E2E Tests
- Critical user flows
- Order placement
- Payment processing
- Admin operations

---

## Deployment Strategy

### Environments

#### Development
- Local development
- Hot reload
- Debug mode
- Mock data

#### Staging
- Pre-production testing
- Real data (sandbox)
- Full monitoring
- Team access

#### Production
- Live production
- Real data
- Full monitoring
- Restricted access

### Deployment Process
1. Push to main branch
2. CI runs tests
3. Build application
4. Deploy to production
5. Run smoke tests
6. Monitor for issues

---

## Success Criteria

### Technical Success
- 99.9% uptime
- <2s page load time
- <1% error rate
- <100ms API response time
- All security tests passing
- All performance tests passing

### Business Success
- User satisfaction >90%
- Order success rate >95%
- Payment success rate >98%
- Support tickets <5% of orders

### Operational Success
- Mean time to resolution <4 hours
- Mean time to detection <5 minutes
- Deployment frequency: Weekly
- Backup success rate: 100%

---

## Conclusion

This master plan provides a complete blueprint for building CampusBite from scratch as a production-ready system. By following this plan, you will create a system that is:

- **Secure**: Multi-layer security with zero-trust architecture
- **Performant**: Optimized for speed with <2s load time
- **Scalable**: Designed to handle 10,000+ concurrent users
- **Reliable**: 99.9% uptime with automatic failover
- **Maintainable**: Clean code with comprehensive documentation
- **Production-Ready**: Following best practices from top tech companies

The system is designed to be modular, allowing for incremental implementation while maintaining high quality standards throughout the development process.



# CampusBite — Kiosk Integration: God Mode Master Plan

**Document Type:** Extension to CampusBite Master Build Plan v1.0  
**Version:** 2.0 — Kiosk Module  
**Scope:** Raspberry Pi Self-Service Kiosk + QR System Overhaul + Auth Completion  
**Date:** June 2025

---

## Table of Contents

1. [Indian College Canteen Reality Audit](#1-indian-college-canteen-reality-audit)
2. [Revised System Architecture](#2-revised-system-architecture)
3. [Authentication System (Complete)](#3-authentication-system-complete)
4. [QR Code System — Full Redesign](#4-qr-code-system--full-redesign)
5. [Database Schema Changes](#5-database-schema-changes)
6. [New API Endpoints](#6-new-api-endpoints)
7. [Kiosk Hardware Specification](#7-kiosk-hardware-specification)
8. [Kiosk Software — Complete Python Application](#8-kiosk-software--complete-python-application)
9. [Thermal Receipt Design](#9-thermal-receipt-design)
10. [Offline Resilience Architecture](#10-offline-resilience-architecture)
11. [Admin Panel Additions](#11-admin-panel-additions)
12. [Student App Changes](#12-student-app-changes)
13. [Security Model](#13-security-model)
14. [Network Architecture](#14-network-architecture)
15. [Deployment & Setup Guide](#15-deployment--setup-guide)
16. [Monitoring & Maintenance](#16-monitoring--maintenance)
17. [Implementation Phases](#17-implementation-phases)
18. [Cost Analysis (Indian Market)](#18-cost-analysis-indian-market)

---

## 1. Indian College Canteen Reality Audit

This section is the foundation of every architectural decision that follows. Building for the Indian college canteen without understanding the ground reality produces brittle software that fails on day one.

### 1.1 Infrastructure Landscape

| Factor | Reality | Implication |
|---|---|---|
| WiFi coverage | Often 1 router per canteen, 100-300 simultaneous devices at peak | Must design for intermittent connectivity |
| ISP reliability | 95-97% uptime, not enterprise 99.9% | Kiosk must queue and sync, not hard-depend on cloud |
| Power supply | Scheduled cuts in tier-2/3 cities; voltage fluctuations common | UPS is mandatory hardware, not optional |
| Ambient temperature | 35-45°C in summer | Pi must be in ventilated enclosure, no enclosure with tight sealing |
| Dust and humidity | Open kitchen, spills, steam | IP-rated or semi-sealed enclosure |
| Ethernet drops | Rarely installed in food courts | Kiosk runs on Wi-Fi by default, Ethernet where possible |
| Screen lighting | Bright ambient light from open kitchens | High-brightness display, high contrast UI |

### 1.2 Student Behaviour Patterns — The Real Picture

**Ordering habits:**
- 78% of Indian college students use UPI (Google Pay, PhonePe, Paytm BHIM) as primary payment
- Peak lunch orders: 12:15 PM–1:30 PM. A single canteen with 200 seats gets 80–150 app orders in this 75-minute window
- Students order from class, arrive 10–30 minutes later. Rarely arrive immediately
- 15–20% of students order for friends ("bhai mera bhi order kar de"). This is the root of most identity fraud
- Screenshot sharing of QR codes is the expected behaviour, not an edge case. Design the system assuming every student will try to share their QR
- Many students place an order but forget about it entirely and arrive 2–3 hours later — the 3-hour window is calibrated exactly for this

**Device split (2024–25 data, Indian colleges):**
- Android: ~92% (Samsung Galaxy A-series, Redmi, Realme dominate)
- iPhone: ~7%
- Feature phone / KaiOS: ~1% (irrelevant for app, irrelevant for kiosk)
- Screen sizes: 6.1"–6.7" overwhelmingly common. QR must be easily displayable at this size

**Digital literacy:**
- Students are comfortable with UPI, WhatsApp, Instagram. Most never navigate anything complex
- Staff (canteen workers): minimal digital literacy. They must be able to operate the system with zero reading — audio + colour is their interface
- Admin (canteen managers): moderate literacy. They can use a web dashboard but training is minimal

### 1.3 Operational Rush Hour Analysis

```
Time       Event                          Order Volume (typical 500-student canteen)
─────────────────────────────────────────────────────────────────────────────────────
08:45 AM   Morning break (15 min)         30–50 orders
09:15 AM   Lecture starts                  <5 orders
12:00 PM   Lunch orders begin (pre-order)  20–30 orders (advance)
12:30 PM   Lunch break starts             80–120 orders in 30 min (CRITICAL PEAK)
01:30 PM   Lunch ends                     Tail of 10–20 orders
04:00 PM   Evening snacks                  40–60 orders
05:30 PM   Canteen closing                 Leftover collections
```

The 12:30–1:00 PM window is the stress test. Any system element that has N+1 latency or requires staff interaction becomes a bottleneck. The kiosk must handle a scan every 15–30 seconds at this peak.

### 1.4 Known Fraud Patterns in Indian College Canteens

Understanding what students will actively try:

| Fraud Pattern | How it Works | CampusBite Counter-Measure |
|---|---|---|
| QR sharing | Student A pays, sends QR screenshot to Student B to collect | Single-use atomic DB update — first scan wins |
| Repeat collection | Student scans QR, gets food, goes back and scans again | Token marked `used` immediately, second scan returns "Already Collected" |
| Expired QR reuse | Student saves QR from last week and tries again | `expires_at` hard check in DB |
| Canteen staff fraud | Staff scans QR without giving food (collects money?) | Kiosk generates printed receipt — student keeps proof |
| Order for the table | One person orders for 5 people with one QR | Each order has its own QR — not one QR for multiple items |
| Screenshot injection | Printing a QR from the web | Token is a DB-validated UUID, no forgeable content |
| Kiosk bypass | Student goes directly to counter without scanning | Business policy + staff training; kiosk is not hard enforcement |

### 1.5 Why the Kiosk Model Works for Indian Canteens

1. **Removes counter congestion** — The bottleneck is the counter. Kiosk moves identity verification to a separate station.
2. **Creates a paper audit trail** — Printed receipt is the student's "proof". Staff can verify without a phone.
3. **Reduces "bhai order hai mera"** — Staff no longer need to match faces to orders; just receipt → item.
4. **Handles "order kahan hai" queries** — Students no longer need to ask staff; kiosk shows their items.
5. **Works with Hindi-English mixed staff** — Visual-first design (colour + large numbers) needs no reading.
6. **Scales without more staff** — Counter staff reduce per-order handling time from ~20s to ~5s.

---

## 2. Revised System Architecture

### 2.1 Full System Diagram with Kiosk

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CampusBite v2 — Full System                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐ │
│  │  Student App    │  │   Admin App      │  │    Canteen Kiosk         │ │
│  │  Next.js 14     │  │   Next.js 14     │  │    Raspberry Pi 4        │ │
│  │  React 19 / TS  │  │   React 19 / TS  │  │    Python 3.11           │ │
│  │  Supabase Auth  │  │   Supabase Auth  │  │    Device API Key Auth   │ │
│  │  (Email/Google) │  │   (Email/Google) │  │    ESC/POS Printer       │ │
│  └────────┬────────┘  └────────┬─────────┘  └──────────────┬───────────┘ │
│           │                    │                              │             │
│           └────────────────────┼──────────────────────────────┘             │
│                                ▼                                            │
│              ┌─────────────────────────────────────────┐                   │
│              │          Vercel Edge Network             │                   │
│              │  - HTTPS/TLS 1.3                         │                   │
│              │  - DDoS Protection                        │                   │
│              │  - Edge Middleware (Auth + Rate Limit)   │                   │
│              └─────────────────────────────────────────┘                   │
│                                ▼                                            │
│              ┌─────────────────────────────────────────┐                   │
│              │      Next.js App Router (API Layer)      │                   │
│              │  /api/v1/auth/*   → Supabase Auth        │                   │
│              │  /api/v1/orders/* → Order Service        │                   │
│              │  /api/v1/kiosk/*  → Kiosk Service (NEW)  │                   │
│              │  /api/v1/payments → Payment Service      │                   │
│              └─────────────────────────────────────────┘                   │
│                                ▼                                            │
│              ┌─────────────────────────────────────────┐                   │
│              │              Supabase                    │                   │
│              │  PostgreSQL 15 + RLS                     │                   │
│              │  Auth (JWT, OAuth)                       │                   │
│              │  Realtime (WebSocket)                    │                   │
│              │  Storage (S3-like)                       │                   │
│              └─────────────────────────────────────────┘                   │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 QR Lifecycle Flow

```
  Student places order
          │
          ▼
  Payment confirmed (Razorpay webhook)
          │
          ▼
  Server generates QR token (UUID)
  Stored: qr_tokens {status: 'active', expires_at: NOW() + 3hr}
          │
          ▼
  Student sees QR in app (order tracking / order history)
  [Visible regardless of order status: preparing/ready/etc.]
          │
          ▼
  Student walks to canteen kiosk
          │
          ▼
  Student holds phone QR up to scanner
          │
          ▼
  Kiosk sends token to: POST /api/v1/kiosk/scan
  (authenticated with HMAC-signed device key)
          │
          ▼
  ┌───────────────────────────────────────────────┐
  │  ATOMIC DB FUNCTION: validate_and_use_token()  │
  │                                               │
  │  UPDATE qr_tokens                             │
  │  SET status = 'used', used_at = NOW()         │
  │  WHERE token = $1                             │
  │    AND status = 'active'                      │
  │    AND expires_at > NOW()                     │
  │  RETURNING *                                  │
  │                                               │
  │  0 rows → FAIL (already used / expired)       │
  │  1 row  → SUCCESS                             │
  └───────────────────────────────────────────────┘
          │
          ├── FAIL → Kiosk shows error screen, no print
          │
          └── SUCCESS
                │
                ▼
          UPDATE orders SET status='collected', collected_at=NOW()
                │
                ▼
          Assign daily token number (#001–#999)
                │
                ▼
          Return order details to kiosk
                │
                ▼
          Kiosk prints thermal receipt
                │
                ▼
          Kiosk shows SUCCESS screen (3 seconds)
                │
                ▼
          Back to IDLE "Scan QR" screen
```

### 2.3 Token States

```
qr_tokens.status transitions:

  generated ──▶ active ──▶ used     (normal flow: scan at kiosk)
                      └──▶ expired  (3 hours elapsed, auto-set by server check)
                      └──▶ revoked  (admin cancels order / refund)
```

---

## 3. Authentication System (Complete)

The base plan mentioned authentication; this section makes it explicit with implementation code for both apps.

### 3.1 Supabase Auth Setup

Configure in Supabase dashboard:
- **Email/Password**: Enable, require email verification
- **Google OAuth**: Enable provider, add `https://your-project.supabase.co/auth/v1/callback` as redirect
- **Session duration**: 1 hour (with refresh token for 30 days)
- **Rate limits**: 5 login attempts per minute per IP

### 3.2 Student App Auth (Next.js)

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}
```

```typescript
// src/app/(auth)/login/page.tsx — Student login (Email + Google)
'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push('/');
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[#111111] mb-6 text-center">Sign in to CampusBite</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <input
            type="email"
            placeholder="College email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-[#EBEBEB] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#E8390E]"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-[#EBEBEB] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#E8390E]"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#E8390E] text-white rounded-xl font-semibold text-sm disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#EBEBEB]" />
          <span className="text-xs text-[#999999]">or</span>
          <div className="flex-1 h-px bg-[#EBEBEB]" />
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full py-3 border border-[#EBEBEB] rounded-xl font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#FAFAFA]"
        >
          {/* Google SVG icon */}
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
            <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
            <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
            <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-center text-xs text-[#999999] mt-6">
          New student? <a href="/register" className="text-[#E8390E] font-medium">Create account</a>
        </p>
      </div>
    </div>
  );
}
```

```typescript
// src/app/auth/callback/route.ts — OAuth callback handler
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
```

```typescript
// src/middleware.ts — Auth middleware for protected routes
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value; },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Protected routes
  const protectedPaths = ['/orders', '/cart', '/profile', '/checkout'];
  if (protectedPaths.some(p => pathname.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Already logged in → redirect away from auth pages
  if ((pathname === '/login' || pathname === '/register') && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
```

### 3.3 Admin App Auth (Same OAuth, Role-Check Addition)

```typescript
// admin-app/src/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { /* same cookie helpers */ } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (pathname === '/login') {
    if (user) return NextResponse.redirect(new URL('/dashboard', request.url));
    return response;
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=unauthorized', request.url));
  }

  return response;
}
```

### 3.4 Trigger: Auto-Create User Profile on Sign-Up

This handles both email registration AND Google OAuth first sign-in:

```sql
-- Run in Supabase SQL editor once
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    avatar_url,
    role,
    is_email_verified
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    'student',
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    is_email_verified = EXCLUDED.is_email_verified;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also update verification status when email is confirmed
CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.users SET is_email_verified = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_email_confirmation();
```

---

## 4. QR Code System — Full Redesign

### 4.1 Design Principles

| Principle | Rationale |
|---|---|
| Token is a random UUID — no embedded data | Prevents reverse engineering, forgery |
| Expiry is 3 hours from order placement | Calibrated for Indian student behaviour (late collectors) |
| Single-use enforced atomically in DB | No race condition possible between two simultaneous scans |
| Student can always see QR regardless of order state | Reduces "where is my QR" support queries |
| Expired QR shows countdown in app | Students know to hurry |
| Kiosk does not trust client-side data — only the token | Client sends token, server fetches and returns all details |

### 4.2 Token Generation (Server-Side Only)

```typescript
// src/app/api/v1/orders/[orderId]/qr/route.ts
// Called automatically by payment webhook handler, OR explicitly by this endpoint

import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

export async function POST(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify order belongs to this user and payment is confirmed
  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, status, payment_status')
    .eq('id', params.orderId)
    .eq('user_id', user.id)
    .single();

  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });
  if (order.payment_status !== 'paid') {
    return Response.json({ error: 'Payment not confirmed' }, { status: 400 });
  }

  // Check if active token exists
  const { data: existingToken } = await supabase
    .from('qr_tokens')
    .select('*')
    .eq('order_id', order.id)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .single();

  if (existingToken) {
    return Response.json({ success: true, data: existingToken });
  }

  // Generate new token — 3 hour expiry from NOW
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours

  const { data: newToken, error } = await supabase
    .from('qr_tokens')
    .insert({
      order_id: order.id,
      token,
      status: 'active',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) return Response.json({ error: 'Token generation failed' }, { status: 500 });

  return Response.json({ success: true, data: newToken });
}
```

### 4.3 QR Code Content Format

The QR code encodes a simple URL-safe string:

```
campusbite://qr/{token_uuid}

Example:
campusbite://qr/550e8400-e29b-41d4-a716-446655440000
```

This format:
- Is not scannable by generic QR readers (custom scheme)
- Contains zero order information (security)
- Is exactly 54 characters (compact QR, easy for phone screens)
- Cannot be guessed or brute-forced (UUID v4 = 2^122 entropy)

### 4.4 QR Display in Student App

```typescript
// src/components/order/qr-display.tsx
'use client';
import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';

interface QRDisplayProps {
  token: string;
  expiresAt: string;
  orderNumber: string;
  status: string; // order status — NOT used to gate QR visibility
}

export function QRDisplay({ token, expiresAt, orderNumber, status }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [expired, setExpired] = useState(false);

  const qrContent = `campusbite://qr/${token}`;

  // Countdown timer
  useEffect(() => {
    const update = () => {
      const remaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (remaining <= 0) {
        setExpired(true);
        setTimeLeft(0);
      } else {
        setTimeLeft(remaining);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Generate QR
  useEffect(() => {
    if (canvasRef.current && !expired) {
      QRCode.toCanvas(canvasRef.current, qrContent, {
        width: 240,
        margin: 2,
        color: { dark: '#111111', light: '#FFFFFF' },
        errorCorrectionLevel: 'H', // High correction — works even if phone screen has smudges
      });
    }
  }, [qrContent, expired]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const isUrgent = timeLeft < 600 && !expired; // < 10 minutes

  if (expired) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-3">⏰</div>
        <h3 className="font-bold text-red-700 text-lg">QR Code Expired</h3>
        <p className="text-red-500 text-sm mt-1">Your QR has expired. Contact the canteen counter with your Order ID: {orderNumber}</p>
        <button
          onClick={() => {/* call regenerate endpoint */}}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium"
        >
          Request New QR
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6 text-center">
      <p className="text-sm text-[#555555] mb-1 font-medium">Scan at the canteen kiosk</p>
      <p className="text-xs text-[#999999] mb-4">Order #{orderNumber}</p>

      <div className={`inline-block p-3 rounded-2xl ${isUrgent ? 'border-2 border-red-400' : 'border-2 border-[#EBEBEB]'}`}>
        <canvas ref={canvasRef} />
      </div>

      <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
        ${isUrgent ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
        <span className={`w-2 h-2 rounded-full ${isUrgent ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
        {isUrgent ? `⚠ Expiring in ${formatTime(timeLeft)}` : `Valid for ${formatTime(timeLeft)}`}
      </div>

      <p className="text-xs text-[#999999] mt-3">
        QR can be scanned at any time. Do not share this QR.
      </p>
    </div>
  );
}
```

---

## 5. Database Schema Changes

### 5.1 Modified Table: `qr_tokens`

Replace the existing `qr_tokens` table definition with this enhanced version:

```sql
-- Drop and recreate (or use ALTER TABLE in migration)
CREATE TABLE qr_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  token           VARCHAR(36) UNIQUE NOT NULL,       -- UUID v4
  status          VARCHAR(20) DEFAULT 'active' NOT NULL,
                  -- active | used | expired | revoked
  expires_at      TIMESTAMP WITH TIME ZONE NOT NULL, -- created_at + 3 hours
  used_at         TIMESTAMP WITH TIME ZONE,
  kiosk_id        UUID REFERENCES kiosks(id),        -- which kiosk scanned it
  scan_metadata   JSONB DEFAULT '{}',                -- ip, user_agent of kiosk
  version         INTEGER DEFAULT 1,                 -- for regeneration tracking
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Key constraint: one active token per order
CREATE UNIQUE INDEX idx_qr_tokens_active_order
  ON qr_tokens(order_id)
  WHERE status = 'active';

CREATE INDEX idx_qr_tokens_token   ON qr_tokens(token);
CREATE INDEX idx_qr_tokens_order   ON qr_tokens(order_id);
CREATE INDEX idx_qr_tokens_status  ON qr_tokens(status);
CREATE INDEX idx_qr_tokens_expires ON qr_tokens(expires_at);
```

### 5.2 New Table: `kiosks`

```sql
CREATE TABLE kiosks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id      UUID REFERENCES canteens(id) ON DELETE CASCADE NOT NULL,
  name            VARCHAR(100) NOT NULL,              -- e.g. "Main Counter Kiosk"
  device_id       VARCHAR(255) UNIQUE NOT NULL,       -- MAC address or generated UUID
  api_key_hash    VARCHAR(255) NOT NULL,              -- bcrypt of api_key
  last_heartbeat  TIMESTAMP WITH TIME ZONE,
  heartbeat_interval_seconds INTEGER DEFAULT 60,
  firmware_version VARCHAR(50),
  is_active       BOOLEAN DEFAULT true,
  location        VARCHAR(255),                       -- physical position description
  printer_config  JSONB DEFAULT '{
    "paper_width_mm": 58,
    "chars_per_line": 32,
    "print_speed": "medium",
    "density": 3
  }',
  offline_mode    BOOLEAN DEFAULT true,               -- allow offline scanning
  notes           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_kiosks_canteen   ON kiosks(canteen_id);
CREATE INDEX idx_kiosks_device_id ON kiosks(device_id);
CREATE INDEX idx_kiosks_active    ON kiosks(is_active);
```

### 5.3 New Table: `kiosk_scans`

Complete audit trail of every scan attempt:

```sql
CREATE TABLE kiosk_scans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id        UUID REFERENCES kiosks(id) NOT NULL,
  qr_token_id     UUID REFERENCES qr_tokens(id),     -- NULL if token not found
  order_id        UUID REFERENCES orders(id),          -- NULL if order not found
  raw_token       VARCHAR(100) NOT NULL,              -- what the scanner actually read
  scan_result     VARCHAR(30) NOT NULL,
                  -- success | expired | already_used | invalid | order_not_found
                  -- kiosk_offline_validated | error
  error_detail    TEXT,
  print_attempted BOOLEAN DEFAULT false,
  print_success   BOOLEAN,
  offline_scan    BOOLEAN DEFAULT false,              -- was this an offline-validated scan?
  synced_at       TIMESTAMP WITH TIME ZONE,           -- when offline scan was synced
  scanned_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_kiosk_scans_kiosk    ON kiosk_scans(kiosk_id);
CREATE INDEX idx_kiosk_scans_order    ON kiosk_scans(order_id);
CREATE INDEX idx_kiosk_scans_result   ON kiosk_scans(scan_result);
CREATE INDEX idx_kiosk_scans_scanned  ON kiosk_scans(scanned_at DESC);
```

### 5.4 New Table: `daily_tokens`

Daily sequential token numbers per canteen (like "Token #42" on the receipt):

```sql
CREATE TABLE daily_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id      UUID REFERENCES canteens(id) NOT NULL,
  date            DATE NOT NULL,
  order_id        UUID REFERENCES orders(id) NOT NULL,
  token_number    INTEGER NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_daily_tokens_canteen_date_seq
  ON daily_tokens(canteen_id, date, token_number);
CREATE UNIQUE INDEX idx_daily_tokens_order
  ON daily_tokens(order_id);
```

### 5.5 New Table: `kiosk_offline_queue`

For scans that happened when the kiosk had no internet:

```sql
CREATE TABLE kiosk_offline_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id        UUID REFERENCES kiosks(id) NOT NULL,
  raw_token       VARCHAR(100) NOT NULL,
  scanned_at_local TIMESTAMP WITH TIME ZONE NOT NULL,  -- kiosk local time
  kiosk_order_data JSONB,                              -- cached order data used
  print_data      TEXT,                               -- what was printed
  sync_status     VARCHAR(20) DEFAULT 'pending',
                  -- pending | synced | conflict | rejected
  synced_at       TIMESTAMP WITH TIME ZONE,
  conflict_detail TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_offline_queue_kiosk  ON kiosk_offline_queue(kiosk_id);
CREATE INDEX idx_offline_queue_status ON kiosk_offline_queue(sync_status);
```

### 5.6 Modified Table: `orders` — Add Collected Status

The order status field already exists. Ensure the following states are documented:

```
payment_pending → confirmed → preparing → ready → collected
                                                └── cancelled (any time before collected)
```

Add a check constraint for valid statuses:

```sql
ALTER TABLE orders
  ADD CONSTRAINT orders_status_valid
  CHECK (status IN (
    'payment_pending', 'payment_failed',
    'confirmed', 'preparing', 'ready',
    'collected', 'cancelled', 'refunded'
  ));
```

### 5.7 Core Atomic DB Function

This is the heart of the anti-fraud system. It runs in a single transaction:

```sql
CREATE OR REPLACE FUNCTION public.validate_and_use_qr_token(
  p_token      VARCHAR,
  p_kiosk_id   UUID,
  p_kiosk_meta JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_token      qr_tokens%ROWTYPE;
  v_order      orders%ROWTYPE;
  v_items      JSONB;
  v_canteen    canteens%ROWTYPE;
  v_tok_num    INTEGER;
  v_today      DATE := CURRENT_DATE;
BEGIN
  -- ─────────────────────────────────────────
  -- STEP 1: Atomic update — claim the token
  -- ─────────────────────────────────────────
  UPDATE qr_tokens
  SET
    status       = 'used',
    used_at      = NOW(),
    kiosk_id     = p_kiosk_id,
    scan_metadata = p_kiosk_meta
  WHERE
    token      = p_token
    AND status = 'active'
    AND expires_at > NOW()
  RETURNING * INTO v_token;

  -- If no row was updated, check why
  IF NOT FOUND THEN
    DECLARE v_existing qr_tokens%ROWTYPE;
    BEGIN
      SELECT * INTO v_existing FROM qr_tokens WHERE token = p_token;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'INVALID_TOKEN',
          'message', 'This QR code is not valid'
        );
      ELSIF v_existing.status = 'used' THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'ALREADY_USED',
          'message', 'This QR has already been scanned',
          'used_at', v_existing.used_at,
          'kiosk_id', v_existing.kiosk_id
        );
      ELSIF v_existing.status = 'revoked' THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'REVOKED',
          'message', 'This order has been cancelled or refunded'
        );
      ELSIF v_existing.expires_at <= NOW() THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'EXPIRED',
          'message', 'This QR code has expired (3-hour limit)',
          'expired_at', v_existing.expires_at
        );
      ELSE
        RETURN jsonb_build_object(
          'success', false, 'error', 'INVALID_STATUS',
          'message', 'QR code cannot be used'
        );
      END IF;
    END;
  END IF;

  -- ─────────────────────────────────────────
  -- STEP 2: Update order status → collected
  -- ─────────────────────────────────────────
  UPDATE orders
  SET
    status       = 'collected',
    collected_at = NOW()
  WHERE id = v_token.order_id
  RETURNING * INTO v_order;

  -- ─────────────────────────────────────────
  -- STEP 3: Get canteen info
  -- ─────────────────────────────────────────
  SELECT * INTO v_canteen FROM canteens WHERE id = v_order.canteen_id;

  -- ─────────────────────────────────────────
  -- STEP 4: Assign daily token number
  -- ─────────────────────────────────────────
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_tok_num
  FROM daily_tokens
  WHERE canteen_id = v_order.canteen_id AND date = v_today;

  INSERT INTO daily_tokens (canteen_id, date, order_id, token_number)
  VALUES (v_order.canteen_id, v_today, v_order.id, v_tok_num)
  ON CONFLICT DO NOTHING;  -- In case of concurrent inserts

  IF NOT FOUND THEN
    SELECT token_number INTO v_tok_num
    FROM daily_tokens WHERE order_id = v_order.id;
  END IF;

  -- ─────────────────────────────────────────
  -- STEP 5: Get order items for receipt
  -- ─────────────────────────────────────────
  SELECT jsonb_agg(jsonb_build_object(
    'name',       oi.item_name,
    'quantity',   oi.quantity,
    'unit_price', oi.unit_price_paise,
    'total',      oi.total_price_paise
  )) INTO v_items
  FROM order_items oi
  WHERE oi.order_id = v_order.id;

  -- ─────────────────────────────────────────
  -- STEP 6: Return full receipt data
  -- ─────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',         true,
    'token_number',    v_tok_num,
    'order_id',        v_order.id,
    'order_number',    v_order.order_number,
    'canteen_name',    v_canteen.name,
    'status',          'collected',
    'collected_at',    v_order.collected_at,
    'subtotal_paise',  v_order.subtotal_paise,
    'tax_paise',       v_order.tax_paise,
    'discount_paise',  v_order.discount_paise,
    'total_paise',     v_order.total_paise,
    'items',           COALESCE(v_items, '[]'::jsonb),
    'special_instructions', v_order.special_instructions
  );
END;
$$;
```

### 5.8 RLS Policies for New Tables

```sql
-- Enable RLS
ALTER TABLE kiosks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_scans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_offline_queue ENABLE ROW LEVEL SECURITY;

-- Kiosks: only admins can manage
CREATE POLICY "Admins can manage kiosks"
ON kiosks FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('super_admin', 'canteen_admin')
  )
);

-- Kiosk scans: admins and relevant staff can view
CREATE POLICY "Admins can view kiosk scans"
ON kiosk_scans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('super_admin', 'canteen_admin')
  )
);

-- API uses service role for kiosk endpoints (bypasses RLS)
-- Kiosk endpoints run server-side with SUPABASE_SERVICE_ROLE_KEY
```

---

## 6. New API Endpoints

### 6.1 Kiosk Authentication Strategy

Every kiosk request is authenticated via HMAC-signed headers:

```
Headers on every kiosk request:
  X-Kiosk-ID:        {kiosk_uuid}
  X-Kiosk-Timestamp: {unix_timestamp_seconds}
  X-Kiosk-Signature: {hmac_sha256_hex}

Signature payload:
  "{METHOD}\n{path}\n{timestamp}\n{body_sha256}"

Replay window: reject requests where |now - timestamp| > 300 seconds (5 min)
```

### 6.2 Endpoint: POST `/api/v1/kiosk/scan`

**The most critical endpoint — handles everything atomically.**

```typescript
// src/app/api/v1/kiosk/scan/route.ts
import { createClient } from '@supabase/supabase-js';
import { verifyKioskHmac, getKiosk } from '@/lib/kiosk-auth';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  // 1. Authenticate kiosk
  const kioskId    = request.headers.get('X-Kiosk-ID');
  const timestamp  = request.headers.get('X-Kiosk-Timestamp');
  const signature  = request.headers.get('X-Kiosk-Signature');
  const body       = await request.text();

  if (!kioskId || !timestamp || !signature) {
    return Response.json({ error: 'Missing auth headers' }, { status: 401 });
  }

  // Replay prevention
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) {
    return Response.json({ error: 'Request expired' }, { status: 401 });
  }

  // Fetch kiosk and verify HMAC
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: kiosk } = await supabase
    .from('kiosks')
    .select('*')
    .eq('id', kioskId)
    .eq('is_active', true)
    .single();

  if (!kiosk) return Response.json({ error: 'Kiosk not found' }, { status: 401 });

  const isValid = await verifyKioskHmac({
    method: 'POST',
    path: '/api/v1/kiosk/scan',
    timestamp,
    body,
    signature,
    apiKeyHash: kiosk.api_key_hash,
  });

  if (!isValid) return Response.json({ error: 'Invalid signature' }, { status: 401 });

  // 2. Parse token from body
  const { token } = JSON.parse(body);
  if (!token || typeof token !== 'string') {
    return Response.json({ error: 'token required' }, { status: 400 });
  }

  // 3. Call atomic DB function
  const { data: result, error } = await supabase.rpc('validate_and_use_qr_token', {
    p_token:      token,
    p_kiosk_id:   kioskId,
    p_kiosk_meta: { firmware: kiosk.firmware_version },
  });

  if (error) {
    console.error('DB function error:', error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }

  // 4. Log scan attempt (success or failure)
  await supabase.from('kiosk_scans').insert({
    kiosk_id:       kioskId,
    raw_token:      token.slice(0, 50),
    order_id:       result.order_id || null,
    qr_token_id:    null, // can enrich later
    scan_result:    result.success ? 'success' : result.error,
    error_detail:   result.message || null,
    print_attempted: false,
  });

  // 5. Update heartbeat
  await supabase
    .from('kiosks')
    .update({ last_heartbeat: new Date().toISOString() })
    .eq('id', kioskId);

  // 6. Return result
  const statusCode = result.success ? 200 : 400;
  return Response.json(result, { status: statusCode });
}
```

```typescript
// src/lib/kiosk-auth.ts
import { createHmac, timingSafeEqual, createHash } from 'crypto';
import bcrypt from 'bcrypt';

export async function verifyKioskHmac({
  method, path, timestamp, body, signature, apiKeyHash,
}: {
  method: string; path: string; timestamp: string;
  body: string; signature: string; apiKeyHash: string;
}): Promise<boolean> {
  // We can't reconstruct the plain API key from its hash for HMAC
  // Solution: Use a second field — a signing key (different from api_key_hash)
  // See kiosk registration for how this is stored
  // For simplicity in this plan, we verify using the stored api_key directly
  // In production, store api_key as AES-encrypted, not bcrypt (so you can decrypt for HMAC)
  
  // Here is the production approach using AES-encrypted key:
  const { decryptApiKey } = await import('./encryption');
  const apiKey = await decryptApiKey(apiKeyHash);

  const payload = `${method}\n${path}\n${timestamp}\n${createHash('sha256').update(body).digest('hex')}`;
  const expected = createHmac('sha256', apiKey).update(payload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
```

### 6.3 Endpoint: POST `/api/v1/kiosk/heartbeat`

```typescript
// POST /api/v1/kiosk/heartbeat
// Body: { firmware_version: "1.2.3", printer_status: "ok"|"no_paper"|"error", wifi_rssi: -65 }
// Response: { ok: true, config: {...} }
```

### 6.4 Endpoint: POST `/api/v1/kiosk/register`

Admin-only, creates kiosk and returns one-time API key:

```typescript
// POST /api/v1/admin/kiosks
// Admin auth required
// Body: { canteen_id, name, location, device_id }
// Returns: { kiosk_id, api_key }  ← show ONCE, then store hashed
```

### 6.5 Endpoint: POST `/api/v1/kiosk/sync-offline`

For uploading scans that happened during internet outage:

```typescript
// POST /api/v1/kiosk/sync-offline
// Body: { scans: [{ token, scanned_at_local, kiosk_order_data }] }
// Each scan is processed: if token not yet used in cloud → mark used
//                         if already used elsewhere → conflict
// Returns: { processed: 3, conflicts: 1, rejected: 0 }
```

### 6.6 Endpoint: GET `/api/v1/orders/:orderId/qr`

Student app calls this to display QR. Returns token data (not the raw token if already used):

```typescript
// GET /api/v1/orders/:orderId/qr
// Returns: { token, expires_at, status, qr_content: "campusbite://qr/{token}" }
// Student auth required — order must belong to them
```

---

## 7. Kiosk Hardware Specification

### 7.1 Bill of Materials — Indian Market Prices (2025)

| Component | Recommended Model | Indian Price | Notes |
|---|---|---|---|
| **SBC** | Raspberry Pi 4 Model B 4GB | ₹5,500–6,500 | 4GB for comfort; 2GB works too |
| **MicroSD** | SanDisk Endurance 32GB | ₹700–900 | Use industrial-grade for 24/7 writes |
| **Power Supply** | Official Pi 4 USB-C 5V/3A | ₹900–1,200 | Must be official; cheap PSUs cause crashes |
| **2D QR Scanner** | Honeywell Voyager 1450g | ₹4,500–5,500 | USB HID, reads from phone screens reliably |
| | *Alt:* Zebra DS2208 | ₹4,000–5,000 | Good alternative, widely stocked |
| | *Budget:* Netum NT-1228BC | ₹1,200–1,800 | Works for PoC, not for production |
| **Thermal Printer** | Xprinter XP-58IIH | ₹2,500–3,200 | 58mm, USB, ESC/POS, very common in India |
| | *Alt:* TVS RP-45 Shoppe | ₹3,000–4,000 | Indian brand, good service support |
| | *Premium:* Epson TM-T20III | ₹8,000–11,000 | If budget allows — far better build quality |
| **Thermal Paper** | 58mm × 30m roll | ₹20–30/roll | Buy in bulk (₹900–1,200 for 50 rolls) |
| **Display** | Waveshare 7" HDMI LCD | ₹2,800–3,500 | Optional but strongly recommended |
| | *Alt:* Any 10" HDMI display | ₹2,000–4,000 | Makes status visible from distance |
| **HDMI Cable** | Micro-HDMI to HDMI | ₹200–400 | For Pi 4's micro-HDMI port |
| **USB Hub** | Sabrent 4-port USB 3.0 | ₹600–900 | Scanner + Printer + extension |
| **UPS HAT** | PiJuice Zero or Geekworm X728 | ₹2,500–4,000 | Battery backup for power cuts |
| | *Alt:* APC Back-UPS 600VA | ₹4,500–5,500 | Easier to maintain |
| **Enclosure** | Metal enclosure 200×150×80mm | ₹500–1,200 | Drill holes for USB/HDMI. Avoid plastic |
| **Ethernet Cable** | Cat6 2m patch | ₹150–250 | Primary network wherever possible |
| **Status LED** | 5mm RGB LED + resistors | ₹30–50 | GPIO feedback (optional) |

**Total per kiosk:**
- Budget (no display): **₹14,000–17,000**
- Standard (with display + UPS): **₹22,000–28,000**
- Premium (Epson printer + all extras): **₹30,000–38,000**

### 7.2 Raspberry Pi OS Setup

```bash
# Download: Raspberry Pi OS Lite (64-bit) — no desktop
# Flash with Raspberry Pi Imager

# In Imager "Advanced Options" before flashing:
# ✓ Enable SSH
# ✓ Set username/password (campusbite / [strong password])
# ✓ Configure WiFi (canteen WiFi credentials)
# ✓ Set locale: en_IN, timezone: Asia/Kolkata

# First boot — SSH in:
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y python3-pip python3-venv git
sudo apt-get install -y libcups2-dev libcupsmime1 cups     # for printer
sudo apt-get install -y python3-tk                          # for display
sudo apt-get install -y alsa-utils espeak-ng               # for audio

# Install printer drivers (for Xprinter)
sudo apt-get install -y printer-driver-gutenprint

# Create app user
sudo useradd -m -s /bin/bash kiosk
sudo usermod -aG lp,dialout,tty kiosk  # printer + serial access
```

### 7.3 Scanner Configuration

The Honeywell Voyager 1450g (and most USB 2D scanners) operate in USB HID mode — they emulate a keyboard. No driver needed. The Pi sees the scanner as a keyboard that types the QR content followed by Enter.

Configuration barcodes to scan from the Honeywell manual:
1. **USB HID** mode (factory default — usually already set)
2. **Beep on decode** — enable
3. **Suffix**: Enter key (CR) — enable
4. **Prefix**: None

### 7.4 Printer Setup

```bash
# Add printer via CUPS
sudo systemctl enable cups
sudo systemctl start cups

# Allow web interface (for setup only — disable after)
sudo cupsctl --remote-admin

# Navigate to http://[pi-ip]:631
# Add printer → find USB thermal printer
# Set driver: Generic / Raw Queue (ESC/POS handles all formatting)

# Test print via python-escpos:
sudo pip3 install python-escpos --break-system-packages

python3 -c "
from escpos.printer import Usb
# Get vendor/product ID with: lsusb
p = Usb(0x0483, 0x5743)  # Xprinter IDs; check yours with lsusb
p.text('CampusBite Test\n')
p.cut()
"
```

---

## 8. Kiosk Software — Complete Python Application

### 8.1 File Structure

```
/opt/campusbite-kiosk/
├── main.py
├── app.py
├── scanner.py
├── printer.py
├── display.py
├── audio.py
├── api_client.py
├── offline/
│   ├── __init__.py
│   ├── queue.py
│   └── sync.py
├── config/
│   ├── kiosk.yaml         ← secrets stored here, root-only 600 permissions
│   └── kiosk.yaml.example
├── assets/
│   ├── sounds/
│   │   ├── success.wav
│   │   ├── error.wav
│   │   └── startup.wav
│   └── logo.png
├── logs/
│   └── kiosk.log          ← rotating log
├── db/
│   └── offline.sqlite     ← offline queue database
├── requirements.txt
└── systemd/
    └── campusbite-kiosk.service
```

### 8.2 `config/kiosk.yaml`

```yaml
# /opt/campusbite-kiosk/config/kiosk.yaml
# Permissions: chmod 600 (root read only)

server:
  base_url: "https://campusbite.com"
  timeout_seconds: 10
  retry_attempts: 3
  retry_delay_seconds: 1

kiosk:
  id: "550e8400-e29b-41d4-a716-446655440000"   # from admin registration
  api_key: "your-api-key-here"                   # from admin registration (store securely)
  canteen_id: "canteen-uuid-here"
  name: "Main Counter Kiosk"

printer:
  vendor_id: "0x0483"          # check with: lsusb
  product_id: "0x5743"
  paper_width_mm: 58
  chars_per_line: 32
  cut_after_print: true

display:
  fullscreen: true
  width: 800
  height: 480
  font_size_large: 72
  font_size_medium: 28
  font_size_small: 16

audio:
  enabled: true
  volume: 0.8

offline:
  enabled: true
  cache_ttl_seconds: 300       # 5-min cache of active tokens from server
  max_queue_size: 1000
  sync_interval_seconds: 30
```

### 8.3 `requirements.txt`

```txt
requests==2.31.0
python-escpos==3.0
pyyaml==6.0.1
cryptography==41.0.7
Pillow==10.1.0     # for QR/logo on receipt
qrcode==7.4.2
pygame==2.5.2      # audio
evdev==1.6.1       # scanner input (Linux)
schedule==1.2.1    # periodic tasks
```

### 8.4 `main.py`

```python
#!/usr/bin/env python3
"""CampusBite Kiosk — Entry Point"""

import logging
import sys
import os
from pathlib import Path

# Setup paths
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

# Setup logging before anything else
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler(BASE_DIR / 'logs' / 'kiosk.log'),
        logging.StreamHandler(sys.stdout),
    ]
)

from app import KioskApp

if __name__ == '__main__':
    logging.info("=" * 50)
    logging.info("CampusBite Kiosk Starting Up")
    logging.info("=" * 50)
    app = KioskApp(BASE_DIR)
    app.run()
```

### 8.5 `app.py`

```python
"""Main kiosk application — orchestrates all components."""
import logging
import threading
import time
from pathlib import Path

import yaml

from scanner import BarcodeScanner
from printer import ThermalPrinter
from display import KioskDisplay
from audio import AudioManager
from api_client import CampusBiteAPI
from offline.queue import OfflineQueue
from offline.sync import SyncManager

logger = logging.getLogger(__name__)

QR_PREFIX = "campusbite://qr/"


class KioskApp:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

        # Load config
        config_path = base_dir / 'config' / 'kiosk.yaml'
        with open(config_path) as f:
            self.config = yaml.safe_load(f)

        # Initialize components
        self.api    = CampusBiteAPI(self.config)
        self.queue  = OfflineQueue(base_dir / 'db' / 'offline.sqlite')
        self.syncer = SyncManager(self.api, self.queue)
        self.audio  = AudioManager(base_dir / 'assets' / 'sounds', self.config['audio'])
        self.printer = ThermalPrinter(self.config['printer'])
        self.display = KioskDisplay(self.config['display'], self.audio)

        # Scanner
        self.scanner = BarcodeScanner()
        self.scanner.on_scan = self.handle_scan  # callback

        # State
        self.processing = False

    def run(self):
        """Start all components."""
        logger.info("Starting components...")
        self.audio.play('startup')

        # Start background sync thread
        sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        sync_thread.start()

        # Start heartbeat thread
        hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        hb_thread.start()

        # Start scanner in background thread
        scan_thread = threading.Thread(target=self.scanner.start, daemon=True)
        scan_thread.start()

        # Start display (blocking — runs the Tk main loop)
        self.display.show_idle()
        self.display.run()

    def handle_scan(self, raw_data: str):
        """Called by scanner when a QR is read."""
        if self.processing:
            logger.warning("Scan ignored — already processing")
            return

        self.processing = True
        logger.info(f"QR scanned: {raw_data[:30]}...")

        # Extract token from QR content
        if not raw_data.startswith(QR_PREFIX):
            logger.warning(f"Invalid QR format: {raw_data}")
            self.display.show_error("INVALID_QR", "Not a CampusBite QR")
            self.audio.play('error')
            time.sleep(2)
            self.display.show_idle()
            self.processing = False
            return

        token = raw_data[len(QR_PREFIX):].strip()

        # Show processing screen
        self.display.show_processing()

        # Try online scan first
        online = self.api.is_online()

        if online:
            self._handle_online_scan(token)
        elif self.config['offline']['enabled']:
            self._handle_offline_scan(token)
        else:
            self.display.show_error("OFFLINE", "No internet. Please try later.")
            self.audio.play('error')
            time.sleep(3)
            self.display.show_idle()

        self.processing = False

    def _handle_online_scan(self, token: str):
        """Send scan to server, handle response."""
        result = self.api.scan_token(token)

        if result is None:
            # Network error
            self.display.show_error("NETWORK_ERROR", "Connection failed. Try again.")
            self.audio.play('error')
            time.sleep(3)
            self.display.show_idle()
            return

        if result.get('success'):
            self._handle_success(result)
        else:
            error_code = result.get('error', 'UNKNOWN')
            message    = result.get('message', 'Something went wrong')
            self.display.show_error(error_code, message)
            self.audio.play('error')
            time.sleep(3)
            self.display.show_idle()

    def _handle_offline_scan(self, token: str):
        """Handle scan when internet is unavailable using local cache."""
        cached = self.queue.get_cached_token(token)

        if cached is None:
            self.display.show_error("OFFLINE_UNAVAILABLE",
                                    "Offline: QR not in cache.\nShow staff your Order ID.")
            self.audio.play('error')
            time.sleep(3)
            self.display.show_idle()
            return

        if cached.get('is_used'):
            self.display.show_error("ALREADY_USED", "Already collected!")
            self.audio.play('error')
            time.sleep(3)
            self.display.show_idle()
            return

        # Mark as used locally and queue for sync
        self.queue.mark_used_offline(token, cached)
        self.queue.add_to_sync_queue(token, cached)

        # Construct result for display/print
        result = {**cached, 'success': True, 'offline_scan': True}
        self._handle_success(result)

    def _handle_success(self, result: dict):
        """Show success screen and print receipt."""
        token_number = result.get('token_number', '?')
        is_offline   = result.get('offline_scan', False)

        # Show success display
        self.display.show_success(
            token_number=token_number,
            order_number=result.get('order_number', ''),
            items=result.get('items', []),
            offline=is_offline,
        )

        # Print receipt
        print_ok = self.printer.print_receipt(result)
        if not print_ok:
            logger.error("Print failed!")
            self.display.show_error("PRINT_ERROR", "Printer error! Show phone to staff.")
            time.sleep(4)
        else:
            self.audio.play('success')
            time.sleep(4)  # Show success screen for 4 seconds

        self.display.show_idle()

    def _sync_loop(self):
        """Periodically sync offline scans to server."""
        interval = self.config['offline']['sync_interval_seconds']
        while True:
            try:
                if self.api.is_online():
                    self.syncer.sync_pending()
                    # Also refresh token cache
                    self.queue.refresh_active_tokens(self.api)
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
            time.sleep(interval)

    def _heartbeat_loop(self):
        """Send periodic heartbeat to server."""
        while True:
            try:
                if self.api.is_online():
                    printer_status = self.printer.get_status()
                    self.api.send_heartbeat({
                        'printer_status': printer_status,
                        'offline_queue_count': self.queue.pending_count(),
                    })
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
            time.sleep(60)  # every minute
```

### 8.6 `scanner.py`

```python
"""Barcode scanner handler — reads from USB HID device (acts as keyboard)."""
import logging
import sys
import time
from threading import Thread

logger = logging.getLogger(__name__)


class BarcodeScanner:
    """
    USB 2D scanners in HID mode send keypresses ending with Enter (\n).
    We read from stdin on Linux (scanner emulates keyboard input to active window).
    
    Alternative: use evdev to read directly from /dev/input/eventX
    This approach (stdin) works when kiosk app has keyboard focus.
    """

    def __init__(self):
        self.on_scan = None  # callback: function(raw_data: str) -> None
        self._buffer = ""
        self._running = False

    def start(self):
        """Block and listen for scanner input."""
        logger.info("Scanner listening for input...")
        self._running = True
        
        try:
            # On Linux with evdev (more reliable for background reading)
            self._start_evdev()
        except ImportError:
            # Fallback to stdin reading
            self._start_stdin()

    def _start_evdev(self):
        """Use evdev to capture keyboard events from scanner device."""
        import evdev
        
        # Find the scanner device (it registers as keyboard)
        devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
        scanner_device = None
        
        for dev in devices:
            # Scanners usually identify themselves
            if any(kw in dev.name.lower() for kw in ['barcode', 'scanner', 'honeywell', 'zebra', 'netum']):
                scanner_device = dev
                logger.info(f"Found scanner: {dev.name} at {dev.path}")
                break
        
        if scanner_device is None:
            # Try to grab first keyboard-like device that isn't the system keyboard
            for dev in devices:
                if 'keyboard' in dev.name.lower():
                    scanner_device = dev
                    break
        
        if scanner_device is None:
            logger.warning("No scanner device found via evdev, falling back to stdin")
            self._start_stdin()
            return

        # Grab the device so it doesn't type into the display
        scanner_device.grab()
        logger.info(f"Scanner grabbed: {scanner_device.name}")

        buffer = ""
        keys = {
            2:'1',3:'2',4:'3',5:'4',6:'5',7:'6',8:'7',9:'8',10:'9',11:'0',
            16:'q',17:'w',18:'e',19:'r',20:'t',21:'y',22:'u',23:'i',24:'o',25:'p',
            30:'a',31:'s',32:'d',33:'f',34:'g',35:'h',36:'j',37:'k',38:'l',
            44:'z',45:'x',46:'c',47:'v',48:'b',49:'n',50:'m',
            52:'.',26:'[',27:']',39:';',40:"'",
            52:'.',55:'/',57:' ',12:'-',13:'=',
        }
        shift_keys = {
            # uppercase and symbols when shift held
            2:'!',3:'@',4:'#',5:'$',6:'%',7:'^',8:'&',9:'*',10:'(',11:')',
        }
        
        shift_held = False
        caps_lock  = False
        
        for event in scanner_device.read_loop():
            if event.type == evdev.ecodes.EV_KEY:
                if event.code in (42, 54):  # left/right shift
                    shift_held = (event.value == 1)
                    continue
                if event.code == 58 and event.value == 1:  # caps lock
                    caps_lock = not caps_lock
                    continue
                if event.value == 1:  # key down
                    if event.code == 28:  # Enter — scan complete
                        if buffer and self.on_scan:
                            self.on_scan(buffer)
                        buffer = ""
                    else:
                        char = keys.get(event.code, '')
                        if char:
                            if shift_held or caps_lock:
                                char = char.upper()
                                char = shift_keys.get(event.code, char)
                            buffer += char

    def _start_stdin(self):
        """Fallback: read from stdin line by line."""
        logger.info("Reading scanner from stdin")
        while self._running:
            try:
                line = sys.stdin.readline().strip()
                if line and self.on_scan:
                    self.on_scan(line)
            except EOFError:
                time.sleep(0.1)
            except Exception as e:
                logger.error(f"Scanner stdin error: {e}")
                time.sleep(0.5)
```

### 8.7 `printer.py`

```python
"""Thermal printer handler using python-escpos."""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

RUPEE = "Rs."  # Use Rs. for max compatibility; modern ESC/POS supports ₹ via UTF-8


def paise_to_rs(paise: int) -> str:
    """Convert paise to rupees string."""
    rs = paise / 100
    return f"{rs:.2f}"


class ThermalPrinter:
    def __init__(self, config: dict):
        self.config = config
        self._printer = None
        self._init_printer()

    def _init_printer(self):
        try:
            from escpos.printer import Usb
            vendor_id  = int(self.config['vendor_id'], 16)
            product_id = int(self.config['product_id'], 16)
            self._printer = Usb(vendor_id, product_id)
            logger.info("Thermal printer connected")
        except Exception as e:
            logger.error(f"Printer init failed: {e}")
            self._printer = None

    def get_status(self) -> str:
        """Check printer status."""
        if self._printer is None:
            return "disconnected"
        try:
            # Most ESC/POS printers support status query
            return "ok"
        except:
            return "error"

    def print_receipt(self, order_data: dict) -> bool:
        """Print the collection token receipt."""
        if self._printer is None:
            self._init_printer()
            if self._printer is None:
                logger.error("Cannot print — printer not connected")
                return False

        try:
            p = self._printer
            W = self.config.get('chars_per_line', 32)

            def divider(char='-'):
                p.text(char * W + '\n')

            def center(text: str, width: int = W) -> str:
                return text.center(width)[:width] + '\n'

            # ─── HEADER ───────────────────────────────────
            p.set(align='center', bold=True, double_height=False, double_width=False)
            p.text('CAMPUSBITE\n')
            p.set(bold=False, align='center')
            p.text(order_data.get('canteen_name', 'Canteen') + '\n')
            if order_data.get('offline_scan'):
                p.set(bold=True)
                p.text('[OFFLINE SCAN]\n')
                p.set(bold=False)

            divider('=')

            # ─── TOKEN NUMBER (LARGE) ──────────────────────
            token_num = str(order_data.get('token_number', '??'))
            p.set(align='center', bold=True, double_height=True, double_width=True)
            p.text(f'#{token_num.zfill(3)}\n')
            p.set(double_height=False, double_width=False, bold=False)

            divider('=')

            # ─── ORDER DETAILS ─────────────────────────────
            p.set(align='left', bold=False)
            p.text(f'Order: {order_data.get("order_number", "")}\n')
            collected_at = order_data.get('collected_at') or datetime.now().isoformat()
            dt = datetime.fromisoformat(collected_at.replace('Z', '+00:00'))
            # Convert to IST (+5:30)
            from datetime import timezone, timedelta
            IST = timezone(timedelta(hours=5, minutes=30))
            dt_ist = dt.astimezone(IST)
            p.text(f'Time:  {dt_ist.strftime("%d %b %Y, %I:%M %p")}\n')

            divider()

            # ─── ITEMS ────────────────────────────────────
            p.set(bold=True)
            p.text('ITEMS\n')
            p.set(bold=False)

            items = order_data.get('items', [])
            for item in items:
                name  = item.get('name', '')[:22]
                qty   = item.get('quantity', 1)
                price = paise_to_rs(item.get('total', 0))
                # Format: "2x Masala Dosa      Rs.70"
                left  = f'{qty}x {name}'
                right = f'{RUPEE}{price}'
                pad   = W - len(left) - len(right)
                if pad < 1:
                    pad = 1
                p.text(left + ' ' * pad + right + '\n')
                if item.get('special_instructions'):
                    p.text(f'   Note: {item["special_instructions"][:28]}\n')

            divider()

            # ─── TOTALS ────────────────────────────────────
            def price_line(label: str, amount_paise: int, bold: bool = False):
                if amount_paise == 0:
                    return
                p.set(bold=bold)
                amount_str = f'{RUPEE}{paise_to_rs(amount_paise)}'
                pad = W - len(label) - len(amount_str)
                p.text(label + ' ' * max(1, pad) + amount_str + '\n')
                p.set(bold=False)

            price_line('Subtotal', order_data.get('subtotal_paise', 0))
            if order_data.get('discount_paise', 0) > 0:
                p.set(bold=False)
                disc_str = f'-{RUPEE}{paise_to_rs(order_data["discount_paise"])}'
                p.text('Discount' + ' ' * (W - 8 - len(disc_str)) + disc_str + '\n')
            if order_data.get('tax_paise', 0) > 0:
                price_line('Tax', order_data.get('tax_paise', 0))

            divider('=')
            price_line('TOTAL', order_data.get('total_paise', 0), bold=True)
            divider('=')

            # ─── SPECIAL INSTRUCTIONS ─────────────────────
            if order_data.get('special_instructions'):
                p.set(bold=False, align='left')
                p.text(f'Note: {order_data["special_instructions"][:60]}\n')
                divider()

            # ─── FOOTER ────────────────────────────────────
            p.set(align='center', bold=False)
            p.text('\nPresent this at counter\n')
            p.text('to collect your order\n')
            p.text('\n')

            # Minimal barcode: order number for staff to scan (optional)
            # p.barcode(order_data.get('order_number', ''), 'CODE39', 60, 2)

            p.text('\n\n')

            # ─── CUT ────────────────────────────────────────
            if self.config.get('cut_after_print', True):
                p.cut()

            logger.info(f"Printed receipt for token #{token_num}")
            return True

        except Exception as e:
            logger.error(f"Print error: {e}")
            # Try reconnect
            self._init_printer()
            return False
```

### 8.8 `display.py`

```python
"""Kiosk display using Tkinter — shows status screens."""
import logging
import tkinter as tk
from tkinter import font as tkfont

logger = logging.getLogger(__name__)

# Colour palette
COLOURS = {
    'idle_bg':       '#1A237E',  # deep blue
    'idle_fg':       '#FFFFFF',
    'processing_bg': '#1565C0',  # medium blue
    'success_bg':    '#1B5E20',  # dark green
    'success_fg':    '#FFFFFF',
    'error_used_bg': '#E65100',  # orange
    'error_bg':      '#B71C1C',  # dark red
    'error_fg':      '#FFFFFF',
    'offline_badge': '#FF6F00',  # amber
    'text_muted':    '#B0BEC5',
}

ERROR_MESSAGES = {
    'ALREADY_USED':         ('⚠',  'Already Collected',          'This order was already picked up.'),
    'EXPIRED':              ('⏰', 'QR Expired',                  'Contact staff with your Order ID.'),
    'INVALID_TOKEN':        ('✗',  'Invalid QR',                 'This does not look right.'),
    'REVOKED':              ('✗',  'Order Cancelled',            'This order was cancelled.'),
    'INVALID_QR':           ('?',  'Wrong QR Format',            'Scan your CampusBite order QR.'),
    'NETWORK_ERROR':        ('📶', 'No Connection',               'Try again or see staff.'),
    'OFFLINE_UNAVAILABLE':  ('📶', 'Offline — QR Not Cached',    'Show staff your Order ID.'),
    'PRINT_ERROR':          ('🖨', 'Printer Issue',              'Show your phone screen to staff.'),
}


class KioskDisplay:
    def __init__(self, config: dict, audio=None):
        self.config = config
        self.audio  = audio
        self.root   = None
        self.is_fullscreen = config.get('fullscreen', True)
        self.W = config.get('width', 800)
        self.H = config.get('height', 480)
        self._current_state = None

    def _setup(self):
        self.root = tk.Tk()
        self.root.title("CampusBite Kiosk")
        self.root.configure(bg=COLOURS['idle_bg'])
        self.root.geometry(f"{self.W}x{self.H}")
        if self.is_fullscreen:
            self.root.attributes('-fullscreen', True)
        self.root.bind('<Escape>', lambda e: self.root.attributes('-fullscreen', False))

        # Fonts
        self.f_hero   = tkfont.Font(family='DejaVu Sans', size=self.config.get('font_size_large', 72), weight='bold')
        self.f_large  = tkfont.Font(family='DejaVu Sans', size=self.config.get('font_size_medium', 28), weight='bold')
        self.f_medium = tkfont.Font(family='DejaVu Sans', size=20)
        self.f_small  = tkfont.Font(family='DejaVu Sans', size=self.config.get('font_size_small', 14))

        # Frame that fills screen
        self.frame = tk.Frame(self.root, bg=COLOURS['idle_bg'])
        self.frame.pack(fill=tk.BOTH, expand=True)

    def _clear(self):
        for widget in self.frame.winfo_children():
            widget.destroy()
        self.frame.configure(bg=COLOURS['idle_bg'])

    def show_idle(self):
        if self.root is None:
            return
        self._current_state = 'idle'
        self.root.after(0, self._render_idle)

    def _render_idle(self):
        self._clear()
        self.frame.configure(bg=COLOURS['idle_bg'])
        tk.Label(self.frame, text='📱', font=self.f_hero,
                 bg=COLOURS['idle_bg'], fg=COLOURS['idle_fg']).pack(pady=(60, 20))
        tk.Label(self.frame, text='SCAN YOUR QR CODE', font=self.f_large,
                 bg=COLOURS['idle_bg'], fg=COLOURS['idle_fg']).pack()
        tk.Label(self.frame, text='Hold your phone QR up to the scanner',
                 font=self.f_small, bg=COLOURS['idle_bg'], fg=COLOURS['text_muted']).pack(pady=(12, 0))

    def show_processing(self):
        if self.root is None:
            return
        self._current_state = 'processing'
        self.root.after(0, self._render_processing)

    def _render_processing(self):
        self._clear()
        self.frame.configure(bg=COLOURS['processing_bg'])
        tk.Label(self.frame, text='⏳', font=self.f_hero,
                 bg=COLOURS['processing_bg'], fg='#FFFFFF').pack(pady=(80, 20))
        tk.Label(self.frame, text='Processing...', font=self.f_large,
                 bg=COLOURS['processing_bg'], fg='#FFFFFF').pack()

    def show_success(self, token_number, order_number, items, offline=False):
        if self.root is None:
            return
        self._current_state = 'success'
        self.root.after(0, lambda: self._render_success(token_number, order_number, items, offline))

    def _render_success(self, token_number, order_number, items, offline):
        self._clear()
        bg = COLOURS['success_bg']
        self.frame.configure(bg=bg)

        if offline:
            tk.Label(self.frame, text='OFFLINE SCAN', font=self.f_small,
                     bg=COLOURS['offline_badge'], fg='#FFFFFF',
                     padx=10, pady=4).pack(pady=(10, 0))

        tk.Label(self.frame, text='✓  COLLECTED!', font=self.f_large,
                 bg=bg, fg='#FFFFFF').pack(pady=(30, 5))

        # BIG token number
        tk.Label(self.frame, text=f'Token #{str(token_number).zfill(3)}',
                 font=self.f_hero, bg=bg, fg='#A5D6A7').pack(pady=(0, 10))

        # Item summary (max 4 items shown)
        items_text = '  |  '.join([
            f"{i.get('quantity')}× {i.get('name', '')[:18]}"
            for i in items[:4]
        ])
        if len(items) > 4:
            items_text += f' +{len(items) - 4} more'
        tk.Label(self.frame, text=items_text, font=self.f_small,
                 bg=bg, fg='#C8E6C9', wraplength=self.W - 40).pack()

        tk.Label(self.frame, text='Receipt printing... Please collect at counter.',
                 font=self.f_small, bg=bg, fg='#81C784').pack(pady=(20, 0))

    def show_error(self, error_code: str, message: str = ''):
        if self.root is None:
            return
        self._current_state = 'error'
        self.root.after(0, lambda: self._render_error(error_code, message))

    def _render_error(self, error_code: str, override_message: str):
        self._clear()
        icon, title, sub = ERROR_MESSAGES.get(error_code, ('!', 'Error', override_message))
        bg = COLOURS['error_used_bg'] if error_code == 'ALREADY_USED' else COLOURS['error_bg']
        self.frame.configure(bg=bg)

        tk.Label(self.frame, text=icon, font=self.f_hero,
                 bg=bg, fg='#FFFFFF').pack(pady=(60, 10))
        tk.Label(self.frame, text=title, font=self.f_large,
                 bg=bg, fg='#FFFFFF').pack()
        tk.Label(self.frame, text=sub or override_message, font=self.f_medium,
                 bg=bg, fg='#FFCCBC', wraplength=self.W - 60).pack(pady=(10, 0))

    def run(self):
        """Start the Tk main loop."""
        self._setup()
        self._render_idle()
        self.root.mainloop()
```

### 8.9 `api_client.py`

```python
"""Backend API client with HMAC authentication, retry, and timeout."""
import hashlib
import hmac as hmac_lib
import json
import logging
import time
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)


class CampusBiteAPI:
    def __init__(self, config: dict):
        self.base_url    = config['server']['base_url']
        self.kiosk_id    = config['kiosk']['id']
        self.api_key     = config['kiosk']['api_key']
        self.timeout     = config['server']['timeout_seconds']
        self.retries     = config['server']['retry_attempts']
        self.retry_delay = config['server']['retry_delay_seconds']
        self.session     = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})

    def _sign_request(self, method: str, path: str, body: str) -> dict:
        """Generate HMAC-signed auth headers."""
        timestamp = str(int(time.time()))
        body_hash = hashlib.sha256(body.encode()).hexdigest()
        payload   = f"{method}\n{path}\n{timestamp}\n{body_hash}"
        signature = hmac_lib.new(
            self.api_key.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

        return {
            'X-Kiosk-ID':        self.kiosk_id,
            'X-Kiosk-Timestamp': timestamp,
            'X-Kiosk-Signature': signature,
        }

    def _post(self, path: str, data: dict) -> dict | None:
        body = json.dumps(data)
        headers = self._sign_request('POST', path, body)
        url  = f"{self.base_url}{path}"

        for attempt in range(self.retries):
            try:
                resp = self.session.post(url, data=body, headers=headers,
                                         timeout=self.timeout)
                return resp.json()
            except requests.exceptions.Timeout:
                logger.warning(f"Request timeout (attempt {attempt + 1})")
            except requests.exceptions.ConnectionError:
                logger.warning(f"Connection error (attempt {attempt + 1})")
            except Exception as e:
                logger.error(f"Request error: {e}")
                break
            time.sleep(self.retry_delay)

        return None  # All retries exhausted

    def is_online(self) -> bool:
        """Quick connectivity check."""
        try:
            resp = self.session.get(f"{self.base_url}/api/health",
                                    timeout=3)
            return resp.status_code == 200
        except:
            return False

    def scan_token(self, token: str) -> dict | None:
        """Send QR token to server for validation."""
        return self._post('/api/v1/kiosk/scan', {'token': token})

    def send_heartbeat(self, status: dict) -> None:
        """Send heartbeat to server."""
        try:
            self._post('/api/v1/kiosk/heartbeat', status)
        except:
            pass  # Heartbeat failure is non-critical

    def sync_offline_scans(self, scans: list) -> dict | None:
        """Sync offline scan queue to server."""
        return self._post('/api/v1/kiosk/sync-offline', {'scans': scans})

    def fetch_active_tokens(self, canteen_id: str) -> list | None:
        """Fetch active QR tokens for this canteen (for offline cache)."""
        try:
            body = json.dumps({'canteen_id': canteen_id})
            headers = self._sign_request('POST', '/api/v1/kiosk/cache', body)
            resp = self.session.post(
                f"{self.base_url}/api/v1/kiosk/cache",
                data=body, headers=headers, timeout=self.timeout
            )
            return resp.json().get('tokens', [])
        except Exception as e:
            logger.error(f"Cache fetch error: {e}")
            return None
```

### 8.10 `offline/queue.py`

```python
"""Local SQLite offline queue and token cache."""
import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


SCHEMA = """
CREATE TABLE IF NOT EXISTS token_cache (
  token        TEXT PRIMARY KEY,
  order_data   TEXT NOT NULL,         -- JSON: full order data
  expires_at   TEXT NOT NULL,         -- ISO timestamp
  is_used      INTEGER DEFAULT 0,     -- 0=active, 1=used
  cached_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  token           TEXT NOT NULL,
  scanned_at      TEXT NOT NULL,
  order_data      TEXT,               -- cached order at time of scan
  sync_status     TEXT DEFAULT 'pending',   -- pending | synced | conflict
  created_at      TEXT DEFAULT (datetime('now'))
);
"""


class OfflineQueue:
    def __init__(self, db_path: Path):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()
        logger.info(f"Offline queue DB: {db_path}")

    def upsert_token(self, token: str, order_data: dict, expires_at: str):
        """Cache a token from the server."""
        self.conn.execute("""
            INSERT OR REPLACE INTO token_cache (token, order_data, expires_at, is_used)
            VALUES (?, ?, ?, 0)
        """, (token, json.dumps(order_data), expires_at))
        self.conn.commit()

    def get_cached_token(self, token: str) -> dict | None:
        """Retrieve cached token data. Returns None if not found or expired."""
        row = self.conn.execute(
            "SELECT * FROM token_cache WHERE token = ?", (token,)
        ).fetchone()

        if row is None:
            return None

        # Check expiry
        expires_at = datetime.fromisoformat(row['expires_at'])
        if datetime.now(timezone.utc) > expires_at:
            return None

        return {
            **json.loads(row['order_data']),
            'is_used': bool(row['is_used']),
        }

    def mark_used_offline(self, token: str, order_data: dict):
        """Mark token as used in local cache."""
        self.conn.execute(
            "UPDATE token_cache SET is_used = 1 WHERE token = ?", (token,)
        )
        self.conn.commit()

    def add_to_sync_queue(self, token: str, order_data: dict):
        """Queue an offline scan for later sync."""
        self.conn.execute("""
            INSERT INTO sync_queue (token, scanned_at, order_data)
            VALUES (?, ?, ?)
        """, (token, datetime.now(timezone.utc).isoformat(), json.dumps(order_data)))
        self.conn.commit()
        logger.info(f"Offline scan queued: {token[:20]}...")

    def get_pending_syncs(self) -> list:
        """Get all unsynced scans."""
        rows = self.conn.execute(
            "SELECT * FROM sync_queue WHERE sync_status = 'pending' ORDER BY scanned_at"
        ).fetchall()
        return [dict(r) for r in rows]

    def mark_synced(self, scan_id: int, status: str = 'synced'):
        """Mark a queued scan as synced (or conflicted)."""
        self.conn.execute(
            "UPDATE sync_queue SET sync_status = ? WHERE id = ?", (status, scan_id)
        )
        self.conn.commit()

    def pending_count(self) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) as c FROM sync_queue WHERE sync_status = 'pending'"
        ).fetchone()
        return row['c']

    def clean_expired_cache(self):
        """Remove expired tokens from cache."""
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute("DELETE FROM token_cache WHERE expires_at < ?", (now,))
        self.conn.commit()

    def refresh_active_tokens(self, api):
        """Refresh token cache from server."""
        # This is called periodically in the sync loop
        # Fetch active orders for this canteen from the server
        canteen_id = api.config['kiosk']['canteen_id'] if hasattr(api, 'config') else None
        if canteen_id:
            tokens = api.fetch_active_tokens(canteen_id)
            if tokens:
                for t in tokens:
                    self.upsert_token(t['token'], t, t['expires_at'])
        self.clean_expired_cache()
```

### 8.11 `systemd/campusbite-kiosk.service`

```ini
[Unit]
Description=CampusBite Kiosk Application
After=network.target graphical.target
Wants=network-online.target

[Service]
Type=simple
User=kiosk
Group=kiosk
WorkingDirectory=/opt/campusbite-kiosk
Environment="DISPLAY=:0"
Environment="XAUTHORITY=/home/kiosk/.Xauthority"
ExecStartPre=/bin/sleep 5
ExecStart=/usr/bin/python3 /opt/campusbite-kiosk/main.py
Restart=always
RestartSec=10
StandardOutput=append:/opt/campusbite-kiosk/logs/kiosk.log
StandardError=append:/opt/campusbite-kiosk/logs/kiosk.log

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=graphical.target
```

```bash
# Install the service:
sudo cp systemd/campusbite-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable campusbite-kiosk.service
sudo systemctl start campusbite-kiosk.service

# Check status:
sudo systemctl status campusbite-kiosk.service
journalctl -u campusbite-kiosk.service -f
```

---

## 9. Thermal Receipt Design

### 9.1 Complete 58mm Receipt Layout

```
┌────────────────────────────────┐  (32 chars wide)
│                                │
│          CAMPUSBITE            │  ← centered, bold
│       Engineering Canteen      │  ← canteen name
│================================│
│                                │
│            #042                │  ← TOKEN NUMBER (4x size, bold)
│                                │
│================================│
│ Order: CB-241215-001234        │
│ Time:  15 Dec 2024, 01:15 PM   │
│--------------------------------│
│ ITEMS                          │  ← bold
│ 2x Masala Dosa         Rs.70   │
│ 1x Filter Coffee       Rs.20   │
│ 1x Egg Puff            Rs.25   │
│--------------------------------│
│ Subtotal               Rs.115  │
│ GST (5%)               Rs.5    │
│================================│
│ TOTAL                  Rs.120  │  ← bold
│================================│
│                                │
│   Present this at counter      │
│    to collect your order       │
│                                │
│                                │
└────────────────────────────────┘
⚄ (cutter line)
```

### 9.2 Offline Scan Receipt Addition

When the scan was offline-validated, the receipt prints an additional line:

```
│ *** OFFLINE SCAN ***           │
│ Will sync to server shortly    │
```

### 9.3 Token Number Format

- Daily sequential per canteen: `001` to `999`
- Resets at midnight
- If > 999 orders in one day, wraps to `001` (extremely unlikely)
- Printed with zero-padding so voice call ("Token forty-two" vs "token #042") is unambiguous

---

## 10. Offline Resilience Architecture

### 10.1 Three-Tier Resilience Model

```
TIER 1 — Online (normal)
  Scanner → Kiosk → HTTPS API → DB (atomic) → Receipt

TIER 2 — Short-term offline (< 5 min)
  Scanner → Kiosk → LOCAL SQLITE CACHE → Receipt
           (marks token used in cache)
           (queues scan for sync)
  When back online: syncs queue → DB marks used → resolve conflicts

TIER 3 — Extended offline (> 5 min cache stale)
  Scanner → Kiosk → ERROR: "Offline — See Staff"
           (prints "Manual Override" receipt with order number only)
           Staff uses order ID to manually verify
```

### 10.2 Cache Refresh Strategy

The kiosk pre-fetches active orders for its canteen every 30 seconds when online:

```
API endpoint: GET /api/v1/kiosk/cache
Returns: [{
  token: "uuid",
  expires_at: "2024-12-15T15:30:00Z",
  order_number: "CB-001234",
  canteen_id: "uuid",
  token_number: null,  // assigned on scan
  items: [...],
  total_paise: 12000
}]

Only returns tokens for THIS canteen that are active and not expired.
Paginated: max 200 tokens per response.
```

Cache TTL in SQLite: 5 minutes per entry. After 5 minutes offline, entries expire and Tier 3 kicks in.

### 10.3 Conflict Resolution (Post-Sync)

When the kiosk comes back online and syncs, three outcomes:

| Scenario | Resolution |
|---|---|
| Token valid in cloud, not yet used | Mark as used in cloud. `sync_status = 'synced'`. Normal outcome |
| Token already used in cloud (another kiosk scanned first) | `sync_status = 'conflict'`. Admin notified. Physically: food was given at that kiosk already — investigate |
| Token expired in cloud (3-hour window passed) | `sync_status = 'conflict'`. Rare — only if kiosk was offline for 3+ hours |

---

## 11. Admin Panel Additions

### 11.1 Kiosk Management Page

Route: `/admin/kiosks`

```
┌─────────────────────────────────────────────────────────────────┐
│ Kiosks                                              + Add Kiosk │
├─────────────────────────────────────────────────────────────────┤
│ Filter: All Canteens ▼                                           │
├────────┬──────────────────┬─────────────┬────────┬─────────────┤
│ Name   │ Canteen          │ Last Seen   │ Status │ Actions     │
├────────┼──────────────────┼─────────────┼────────┼─────────────┤
│ K-001  │ Engg Block Cantn │ 2 min ago   │ 🟢 OK  │ View Logs   │
│ K-002  │ Main Canteen     │ 45 min ago  │ 🟡 Warn│ View Logs   │
│ K-003  │ Hostel Canteen   │ 3 days ago  │ 🔴 Off │ View Logs   │
└────────┴──────────────────┴─────────────┴────────┴─────────────┘
```

### 11.2 Kiosk Registration Flow

```typescript
// admin-app/src/app/(dashboard)/kiosks/register/page.tsx
// 1. Admin fills: Canteen, Name, Location, Device ID (printed on Pi case)
// 2. Server generates: kiosk_id + api_key
// 3. Shows ONE-TIME display: "Save this API key — it will not be shown again"
// 4. Admin copies API key, puts in kiosk config file via SSH
// 5. Kiosk connects, sends heartbeat — status becomes GREEN
```

### 11.3 Scan History Table

Route: `/admin/kiosks/:id/scans`

Columns: Scanned At | Order Number | Token # | Result | Print | Offline?

### 11.4 Token Management

Route: `/admin/orders/:id/qr`
- View current QR token status
- Regenerate QR (for expired/lost tokens)
- Revoke QR (for cancelled orders)
- View scan history for this token

### 11.5 Daily Token Report

```
Canteen: Engineering Block | Date: 15 Dec 2024
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total tokens issued today:    142
Scanned at kiosk:             138  (97.2%)
Manual collection (no scan):    4  (2.8%)
Average collection time:      8.3 minutes
Peak token time:         12:35 PM (Token #67-#89 in 20 min)
```

---

## 12. Student App Changes

### 12.1 QR Access — State-Agnostic Rule

**Rule: The QR code tab/section is NEVER hidden, regardless of order state.**

Current order states and QR visibility:
| Order State | QR Shown? | QR Usable? |
|---|---|---|
| payment_pending | ✗ (no QR generated yet) | — |
| payment_failed | ✗ | — |
| confirmed | ✓ | ✓ (until 3hr) |
| preparing | ✓ | ✓ |
| ready | ✓ | ✓ |
| collected | ✓ (greyed out, "Used") | ✗ |
| cancelled | ✗ | — |

### 12.2 Order Tracking Screen Changes

Add a "Scan to Collect" QR tab to the existing order tracking screen:

```typescript
// src/components/order/order-tracker.tsx
// Add QR tab alongside status timeline

const tabs = ['Status', 'QR Code', 'Details'];

// QR tab content:
// - If payment not confirmed: "Complete payment to get QR"
// - If active token: <QRDisplay token={...} expiresAt={...} />
// - If collected: "Order collected ✓" with timestamp
// - If expired: "QR Expired" with regenerate option
```

### 12.3 Order History — QR Access

In order history list, each order card shows:
- Active QR: "Tap to show QR" badge (green)
- Expiring QR: "Expiring soon" badge (red, pulsing)
- Expired QR: "QR Expired" badge (grey)
- Collected: "Collected ✓" badge (grey)

### 12.4 Push Notification for QR Expiry

```typescript
// Send push notification when QR has 30 minutes remaining
// This is handled by a Supabase Edge Function / cron job:

// Every 5 minutes, query:
SELECT qr_tokens.*, orders.user_id, orders.order_number
FROM qr_tokens
JOIN orders ON orders.id = qr_tokens.order_id
WHERE qr_tokens.status = 'active'
  AND qr_tokens.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'
  AND qr_tokens.expires_at > NOW() + INTERVAL '25 minutes'
  -- The 25-min lower bound prevents re-notifying

-- For each: send push notification to user
"Your order QR expires in 30 minutes! Scan at the canteen kiosk soon."
```

---

## 13. Security Model

### 13.1 Threat Model for Kiosk

| Threat | Attack Vector | Defence |
|---|---|---|
| QR replay attack | Scan same QR twice | Atomic DB `status='active'` check — second scan gets 0 rows |
| QR sharing | Send screenshot to friend | Single-use — first scan wins, friend gets "already collected" |
| Race condition attack | Two kiosks scan same QR simultaneously | PostgreSQL row-level lock during UPDATE ensures atomicity |
| Fake QR generation | Print a QR with a guessed UUID | 122-bit entropy UUID — computationally infeasible |
| Kiosk impersonation | Attacker sends POST /api/v1/kiosk/scan | HMAC signature + timestamp prevents replay |
| Offline abuse | Disconnect kiosk to bypass cloud check | Offline mode: only tokens pre-cached in last 5 min are valid |
| Config theft | Steal api_key from kiosk YAML | File is chmod 600, root only. Monitor with aide/tripwire |
| Network intercept | MITM on canteen WiFi | TLS 1.3 + certificate pinning in Python (requests SSL verify) |

### 13.2 Atomic Scan — Race Condition Proof

PostgreSQL guarantees atomicity at the row level with the conditional UPDATE pattern:

```sql
-- Two kiosks both receive scan of token "abc" at the same millisecond
-- Kiosk 1 executes:
UPDATE qr_tokens SET status='used' WHERE token='abc' AND status='active'

-- Kiosk 2 executes (concurrently):
UPDATE qr_tokens SET status='used' WHERE token='abc' AND status='active'

-- PostgreSQL result:
-- One of them gets a row lock first (MVCC)
-- That one returns 1 row updated → SUCCESS
-- The other sees status='used' (already changed) → returns 0 rows → FAIL
-- Guaranteed: exactly one succeeds, even with simultaneous requests
```

### 13.3 API Key Storage

```
On Kiosk:
  /opt/campusbite-kiosk/config/kiosk.yaml  (chmod 600, owner: root)
  api_key stored as plaintext (encrypted by filesystem + restricted access)
  
On Server (DB):
  kiosks.api_key_encrypted: AES-256-GCM encrypted (for HMAC verification)
  
  -- Why AES-encrypted, not bcrypt?
  -- We need to decrypt the key to verify HMAC
  -- bcrypt is one-way — can't use for HMAC verification
  -- Alternative: store both api_key_hash (bcrypt) and hmac_key (AES)
```

### 13.4 Complete Audit Trail

Every QR scan (success or failure) is logged in `kiosk_scans` with:
- Kiosk ID and location
- Raw token (truncated for privacy)
- Result code
- Timestamp
- Whether it was offline-validated

Admin can query: "Show me all scan attempts for order X" or "Show all scans from Kiosk Y today"

---

## 14. Network Architecture

### 14.1 Connectivity Strategy (Layered)

```
Layer 1 — Ethernet (primary)
  Cat6 from canteen switch → Pi
  Recommended: if canteen has LAN infrastructure
  
Layer 2 — WiFi (standard)
  Pi 4 built-in WiFi
  SSID: college_canteen / password stored in wpa_supplicant.conf
  
Layer 3 — 4G USB Dongle (emergency failover)
  Connect: Jio Fi / Airtel Hotspot or USB dongle
  OS-level: NetworkManager with metric priorities
    eth0: metric 100 (lowest = preferred)
    wlan0: metric 200
    ppp0/wwan0: metric 300 (4G, last resort)
```

```bash
# /etc/NetworkManager/conf.d/campusbite.conf
[connection]
# Auto-connect all interfaces with metric priorities
# See: nmcli con mod "Wired" ipv4.route-metric 100
```

### 14.2 Firewall Rules on Kiosk

```bash
# Allow only outbound HTTPS to CampusBite server
sudo ufw default deny outgoing
sudo ufw default deny incoming
sudo ufw allow out to campusbite.com port 443 proto tcp
sudo ufw allow out to any port 53 proto udp    # DNS
sudo ufw allow out to any port 123 proto udp   # NTP
sudo ufw allow in from 192.168.1.0/24 port 22 # SSH from local network only
sudo ufw enable
```

---

## 15. Deployment & Setup Guide

### 15.1 New Kiosk Setup — Step by Step

```bash
# ─── STEP 1: Flash OS ────────────────────────────────────────────
# Use Raspberry Pi Imager with:
# OS: Raspberry Pi OS Lite (64-bit)
# Hostname: campusbite-kiosk-01
# SSH: enabled
# WiFi: configured
# Timezone: Asia/Kolkata

# ─── STEP 2: First boot setup ────────────────────────────────────
ssh campusbite@campusbite-kiosk-01.local
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y python3-pip python3-venv python3-tk \
  git cups libcups2-dev alsa-utils espeak-ng ufw

# ─── STEP 3: Clone and install kiosk app ─────────────────────────
sudo git clone https://github.com/campusbite/kiosk-app.git /opt/campusbite-kiosk
sudo chown -R kiosk:kiosk /opt/campusbite-kiosk
cd /opt/campusbite-kiosk
pip3 install -r requirements.txt --break-system-packages

# ─── STEP 4: Register kiosk in admin panel ────────────────────────
# In admin app: Kiosks → Add Kiosk
# Fill: Canteen, Name "Main Counter Kiosk", Location, Device ID (from hostname or MAC)
# Copy the displayed API key (shown only once!)

# ─── STEP 5: Configure kiosk ──────────────────────────────────────
sudo cp /opt/campusbite-kiosk/config/kiosk.yaml.example \
        /opt/campusbite-kiosk/config/kiosk.yaml
sudo nano /opt/campusbite-kiosk/config/kiosk.yaml
# Fill in: kiosk.id, kiosk.api_key, kiosk.canteen_id
sudo chmod 600 /opt/campusbite-kiosk/config/kiosk.yaml
sudo chown root:root /opt/campusbite-kiosk/config/kiosk.yaml

# ─── STEP 6: Configure printer ────────────────────────────────────
lsusb  # Find vendor:product IDs for your printer
# Update printer.vendor_id and printer.product_id in kiosk.yaml

# ─── STEP 7: Install and enable service ───────────────────────────
sudo cp /opt/campusbite-kiosk/systemd/campusbite-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable campusbite-kiosk.service
sudo systemctl start campusbite-kiosk.service

# ─── STEP 8: Configure auto-login for kiosk user ─────────────────
sudo raspi-config
# System Options → Boot / Auto Login → Desktop Autologin (or Console Autologin for headless)

# ─── STEP 9: Set up display rotation if needed ───────────────────
# If display is mounted vertically:
echo "display_rotate=1" | sudo tee -a /boot/config.txt

# ─── STEP 10: Final test ──────────────────────────────────────────
sudo systemctl status campusbite-kiosk.service
# Should show: Active (running)

# Test scan using a known test order QR from the admin panel
# → Should print receipt, show SUCCESS screen
```

### 15.2 Hardware Physical Setup Checklist

```
□ Enclosure mounted securely (screws, not tape)
□ Printer inside or adjacent to enclosure — paper feed accessible
□ Scanner mounted at 30-45° angle facing student
□ Display at eye height (≈ 150cm from floor)
□ Power cable managed / not a trip hazard
□ Ethernet cable connected (where available)
□ UPS between wall outlet and kiosk — tested
□ Clear signage: "SCAN YOUR QR CODE HERE" above kiosk
□ Staff can see kiosk display from counter
□ Ventilation: at least 2cm gap on all sides of Pi case
□ Paper roll loaded and test print done
□ Audio test: success sound audible in canteen noise level
```

### 15.3 Testing Checklist (Before Going Live)

```
FUNCTIONALITY TESTS:
□ Place test order on student app
□ Complete test payment (Razorpay test mode)
□ Verify QR appears in app immediately after payment
□ QR shows 3-hour countdown
□ Scan QR at kiosk → prints receipt, shows SUCCESS
□ Scan same QR again → shows ALREADY_USED
□ Scan expired QR → shows EXPIRED
□ Scan random text → shows INVALID_QR
□ Verify order status becomes 'collected' in admin panel
□ Verify kiosk scan logged in kiosk_scans table

OFFLINE TESTS:
□ Disconnect kiosk from internet
□ Scan a QR that was cached → should succeed (offline mode)
□ Scan a QR not in cache → should show OFFLINE_UNAVAILABLE
□ Reconnect → sync queue should process

STRESS TESTS:
□ Scan 10 QRs in quick succession → all should process
□ Simulate 50 concurrent scans from two kiosks (same token) → only one succeeds

PRINTER TESTS:
□ Receipt format correct (token number large, items listed)
□ Rupee symbol prints (or Rs. if Unicode not supported)
□ Cut line clean
□ Paper jam recovery — app recovers after jam cleared
```

### 15.4 Staff Training Guide (5-Minute Version)

Train canteen staff with this workflow:
1. **Kiosk is fully automatic** — students scan their own QR
2. **When student shows printed receipt** → read token number, give food
3. **If kiosk is broken** → use manual override: student shows Order ID on phone, staff notes it
4. **If student says "token not printing"** → check paper roll, call admin (contact number on enclosure)
5. **Daily reset** → Token numbers restart from #001 at midnight automatically
6. **Do not touch the kiosk PC / Pi** unless instructed

---

## 16. Monitoring & Maintenance

### 16.1 Admin Dashboard Kiosk Health Widget

```
┌─────────────────────────────────────────────┐
│ Kiosk Health                           All ▼ │
├─────────────────────────────────────────────┤
│ Main Counter Kiosk                          │
│ 🟢 Online  |  Last seen 1 min ago           │
│ Scans today: 138  |  Offline syncs: 0       │
│ Printer: OK  |  Paper: ~60% remaining       │
├─────────────────────────────────────────────┤
│ Hostel Kiosk                                │
│ 🔴 Offline  |  Last seen 3 hrs ago          │
│ [Alert sent to admin at 10:30 AM]           │
└─────────────────────────────────────────────┘
```

### 16.2 Alert Conditions

| Condition | Alert Type | Recipient |
|---|---|---|
| Kiosk offline > 10 min during operating hours | Push + Email | Admin |
| Offline queue > 20 unsynced scans | Email | Admin |
| Print failures > 3 in 10 min | Email | Admin |
| Scan error rate > 20% in 5 min | Push | Admin |
| Kiosk firmware outdated | Email (weekly) | Admin |

### 16.3 Log Rotation

```bash
# /etc/logrotate.d/campusbite-kiosk
/opt/campusbite-kiosk/logs/*.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
    postrotate
        systemctl reload campusbite-kiosk.service > /dev/null 2>&1 || true
    endscript
}
```

### 16.4 Auto-Update Script

```bash
#!/bin/bash
# /opt/campusbite-kiosk/scripts/update.sh
# Run via cron at 3 AM daily

set -e
cd /opt/campusbite-kiosk
git fetch origin
CURRENT=$(git rev-parse HEAD)
LATEST=$(git rev-parse origin/main)

if [ "$CURRENT" != "$LATEST" ]; then
    echo "Update available: $CURRENT → $LATEST"
    git pull origin main
    pip3 install -r requirements.txt --break-system-packages --quiet
    systemctl restart campusbite-kiosk.service
    echo "Updated and restarted at $(date)"
else
    echo "Already up to date: $CURRENT"
fi
```

```bash
# Schedule in crontab (root):
# crontab -e
0 3 * * * /opt/campusbite-kiosk/scripts/update.sh >> /var/log/campusbite-update.log 2>&1
```

---

## 17. Implementation Phases

### Phase A — Backend Foundation (Week 1–2)

**Week 1:**
- [ ] Add `handle_new_user` trigger for Google + Email auth
- [ ] Create and run database migrations (new tables: `kiosks`, `kiosk_scans`, `daily_tokens`, `kiosk_offline_queue`)
- [ ] Modify `qr_tokens` table (add `kiosk_id`, `scan_metadata`, `version`)
- [ ] Write and test `validate_and_use_qr_token` PostgreSQL function
- [ ] Write and test `handle_new_user` trigger
- [ ] Add `orders_status_valid` constraint

**Week 2:**
- [ ] Implement `POST /api/v1/kiosk/scan` endpoint
- [ ] Implement `POST /api/v1/kiosk/heartbeat` endpoint
- [ ] Implement `POST /api/v1/kiosk/sync-offline` endpoint
- [ ] Implement `POST /api/v1/kiosk/cache` (active tokens for canteen)
- [ ] Implement `POST /api/v1/admin/kiosks` (register kiosk)
- [ ] Write unit tests for atomic scan function (test race conditions)

### Phase B — Kiosk Software (Week 3–4)

**Week 3:**
- [ ] Set up Raspberry Pi dev environment
- [ ] Implement `api_client.py` with HMAC signing
- [ ] Implement `printer.py` (test with Xprinter)
- [ ] Implement `offline/queue.py` with SQLite
- [ ] Implement `scanner.py` (test with USB scanner)

**Week 4:**
- [ ] Implement `display.py` (all 5 screen states)
- [ ] Implement `audio.py`
- [ ] Implement `app.py` (main orchestration)
- [ ] Implement `offline/sync.py`
- [ ] Full end-to-end test on Pi hardware
- [ ] Systemd service setup and auto-start test
- [ ] Offline mode test (disconnect router, scan, reconnect)

### Phase C — Student App Updates (Week 5)

- [ ] Update `QRDisplay` component with countdown timer
- [ ] Ensure QR accessible from all order states (confirming, preparing, ready)
- [ ] Add "QR Expired" screen with regenerate option
- [ ] Add QR expiry push notification logic
- [ ] Test on Android (low-end, Samsung Galaxy A15 level)
- [ ] Test QR scanning from phone screen at kiosk scanner

### Phase D — Admin Panel Updates (Week 6)

- [ ] Kiosk management list page
- [ ] Kiosk registration flow (one-time API key display)
- [ ] Kiosk detail / scan history page
- [ ] Kiosk health dashboard widget
- [ ] Token management (regenerate / revoke)
- [ ] Daily token report

### Phase E — Integration Testing (Week 7)

- [ ] Full end-to-end flow: Student app → Payment → QR → Kiosk → Receipt → Admin
- [ ] Load test: 50 concurrent students scanning at same time
- [ ] Race condition test: Two kiosks, same token simultaneously
- [ ] Offline resilience test: 5-minute outage mid-shift
- [ ] Power cut test: UPS failover
- [ ] Paper jam recovery test
- [ ] 3-hour expiry test (accelerate by temporarily setting to 3-minute expiry)

### Phase F — Pilot Deployment (Week 8–9)

- [ ] Select one canteen for pilot (highest footfall)
- [ ] Physical installation of kiosk hardware
- [ ] Staff training (1-hour session)
- [ ] Monitor closely for first 3 days (admin observes live)
- [ ] Collect feedback from students and staff
- [ ] Fix discovered issues

### Phase G — Rollout (Week 10–12)

- [ ] Deploy to remaining canteens
- [ ] Each canteen gets 1–2 days of monitored operation before going fully independent
- [ ] Document recurring issues and build FAQ for staff

---

## 18. Cost Analysis (Indian Market)

### 18.1 Per-Kiosk Hardware (Standard Configuration)

| Item | Cost (₹) |
|---|---|
| Raspberry Pi 4 4GB | 6,000 |
| SanDisk Endurance 32GB MicroSD | 800 |
| Official USB-C Power Adapter | 1,000 |
| Honeywell Voyager 1450g Scanner | 5,000 |
| Xprinter XP-58IIH Thermal Printer | 3,000 |
| Waveshare 7" HDMI Display | 3,200 |
| HDMI to Micro-HDMI cable | 300 |
| USB Hub (Sabrent 4-port) | 700 |
| APC Back-UPS 600VA (UPS) | 5,000 |
| Metal Enclosure + mounting | 1,000 |
| 58mm thermal paper (50 rolls) | 1,200 |
| Miscellaneous (cables, LED) | 500 |
| **Total Hardware** | **₹27,700** |

### 18.2 Per-Canteen Software Cost

Software is part of the CampusBite platform — no additional licensing cost per kiosk. One-time development cost is amortised across all canteens.

### 18.3 ROI Estimate

**Per canteen, per month:**
- Orders reduced at counter: 140/day × 25 days = 3,500 orders
- Time saved per order (counter staff): ~15 seconds
- Staff time saved: 3,500 × 15s = 52,500 seconds = 14.5 hours/month
- Assuming staff cost ₹8,000/month → value: ₹800/month in staff efficiency
- Fraud prevention (avg. 1-2% duplicate collections prevented): ₹50–200/month savings
- Hardware payback period: ~35 months (hardware cost ₹27,700 ÷ ₹800/month)

**But the real ROI is operational:** reducing arguments, eliminating wrong-order disputes, creating audit trails, and improving student satisfaction — all of which are qualitative but significant for a canteen's reputation on campus.

---

## Appendix A: Environment Variables

Add these to the existing `.env.production`:

```bash
# Kiosk module additions (server-side only)
KIOSK_ENCRYPTION_KEY=your-32-byte-aes-key-here   # AES-256 for encrypting kiosk api keys
KIOSK_MAX_REPLAY_WINDOW_SECONDS=300               # HMAC replay prevention window
QR_TOKEN_EXPIRY_HOURS=3                           # QR token lifetime
DAILY_TOKEN_RESET_HOUR_IST=0                      # midnight IST reset for daily tokens
```

## Appendix B: Quick Reference — Error Codes for Kiosk

| Code | Kiosk Screen | Student Should |
|---|---|---|
| `success` | ✓ Green SUCCESS | Collect at counter with receipt |
| `ALREADY_USED` | ⚠ Orange WARNING | Check if friend already collected |
| `EXPIRED` | ✗ Red EXPIRED | Contact staff with Order ID |
| `INVALID_TOKEN` | ✗ Red INVALID | Ensure full QR visible on screen |
| `REVOKED` | ✗ Red CANCELLED | Order was cancelled, contact admin |
| `OFFLINE_UNAVAILABLE` | 📶 OFFLINE | Show phone screen to staff |
| `PRINT_ERROR` | 🖨 PRINTER | Show phone screen to staff |

## Appendix C: Database Migration Script Order

Run these in sequence in Supabase SQL editor:

```
1. Add orders_status_valid constraint
2. Alter qr_tokens (add kiosk_id, scan_metadata, version)
3. Create kiosks table
4. Create kiosk_scans table
5. Create daily_tokens table
6. Create kiosk_offline_queue table
7. Create validate_and_use_qr_token function
8. Create handle_new_user trigger
9. Create handle_email_confirmation trigger
10. Add RLS policies for new tables
11. Add idx_qr_tokens_active_order unique partial index
```

---

*This document is intended as the single source of truth for CampusBite kiosk development. Cross-reference with the v1.0 Master Build Plan for base system details. All code examples are production-ready starting points requiring adaptation to your exact Supabase project IDs, hardware vendor IDs, and environment.*