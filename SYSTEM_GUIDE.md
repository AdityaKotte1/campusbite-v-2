# CampusBite — Complete System Guide

Everything in one place. How the system works, what every screen looks like, how every workflow flows, who can do what, and how it all connects. Read this like a story.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [The Three Systems](#2-the-three-systems)
3. [Student App — Every Screen, Every Flow](#3-student-app--every-screen-every-flow)
4. [Admin App — Every Screen, Every Feature](#4-admin-app--every-screen-every-feature)
5. [Kiosk — How It Works](#5-kiosk--how-it-works)
6. [The Complete Order Journey](#6-the-complete-order-journey)
7. [User Roles & What Each Can Do](#7-user-roles--what-each-can-do)
8. [API Reference — Every Endpoint](#8-api-reference--every-endpoint)
9. [Database — Every Table Explained](#9-database--every-table-explained)
10. [Money Flow — How Payments Work](#10-money-flow--how-payments-work)
11. [The QR System — How It Prevents Fraud](#11-the-qr-system--how-it-prevents-fraud)
12. [Offline Mode — When Internet Drops](#12-offline-mode--when-internet-drops)
13. [Edge Cases & What Happens](#13-edge-cases--what-happens)
14. [What Is Built vs What Is Placeholder](#14-what-is-built-vs-what-is-placeholder)

---

## 1. The Big Picture

CampusBite is a campus food ordering system built specifically for Indian colleges. Students order food from their phone, pay via UPI or card through Razorpay, and collect their order at the canteen by scanning a QR code at a self-service kiosk — which prints a numbered receipt. The kiosk sits at the canteen counter; the student hands the receipt to the staff and gets their food.

**Why this design:** The biggest problem in Indian college canteens is the counter queue. Everyone shows up at 12:30, lines pile up, staff can't match who ordered what, students argue. This system moves all the friction away from the counter. Students order from class, pay in advance, walk up, scan, get a numbered slip, hand it to the counter. Staff just reads the number and gives the food. No arguments, no cash, no queue.

**Three things that make this work together:**
- The **student app** (mobile, on their phone) — where ordering happens
- The **admin app** (desktop, for canteen managers) — where management happens  
- The **kiosk** (Raspberry Pi at the counter) — where collection happens

All three talk to the same Supabase database. When a student pays, the database updates. The kiosk reads the database. The admin sees it in real time.

---

## 2. The Three Systems

### Student App
- URL: `localhost:3000` (dev) or your Vercel domain
- Built with: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Zustand
- Mobile-first design (works on phone browser, installable as PWA)
- Authentication via Supabase (email/password + Google OAuth)
- Payments via Razorpay (UPI, card, net banking, wallet)
- Real-time order tracking via polling
- QR code generation for order pickup

### Admin App
- URL: `localhost:3001` (dev) or your admin Vercel domain
- Same tech stack as student app but desktop-first
- Role-protected — only `super_admin`, `canteen_admin`, `staff` can access
- Full order management, menu management, analytics, kiosk management
- Real-time dashboard with live order counts

### Kiosk (Raspberry Pi)
- Runs Python 3.11 on Raspberry Pi 4 (1GB RAM)
- OS: Raspberry Pi OS Lite (no desktop — pure headless)
- **No screen, no GUI** — it's a background daemon (systemd service)
- Connected hardware: USB barcode scanner (Honeywell Voyager 1450g) + USB thermal printer (Xprinter XP-58IIH, 58mm paper)
- Continuously listens for QR scans via evdev (Linux input events)
- On scan: validates with server → prints receipt
- Has offline mode with local SQLite cache

---

## 3. Student App — Every Screen, Every Flow

### How a student gets in

**Registration flow (`/register`):**

The student lands on a clean white card centered on a gray (`#F5F5F5`) background. Two ways to get in:

Option 1 — Google: Single button "Continue with Google" with the Google colored logo. Taps it, Google OAuth opens, selects their college email, redirected back, account created automatically. No password needed.

Option 2 — Email form: Four fields stacked vertically with brand-colored (`#E8390E`) focus rings:
- Full Name (placeholder: "Aarav Sharma")
- Email (placeholder: "you@college.edu")
- Password (min 8 characters)
- Confirm Password
- A checkbox: "I agree to Terms of Service and Privacy Policy" (links embedded)

On submit with Zod validation — name can't be empty, email must be valid, passwords must match, terms must be accepted. If anything fails, red border + error text appears below the field. No full-page error, just inline feedback.

On success: the form disappears and is replaced by a green checkmark, the message "Check your inbox — we've sent you a verification email", and a "Back to Sign In" button. The student can't log in until they click the email link.

**Login flow (`/login`):**

Same card layout. Title: "Welcome back". Subtitle: "Sign in to your CampusBite account."

- Google button at top
- "or" divider
- Email field with mail icon (placeholder: "you@college.edu")
- Password field with eye icon to toggle visibility
- "Forgot password?" link (right-aligned, small text)
- "Sign in" button (full width, brand red, loading spinner shows "Signing in...")
- "Don't have an account? Create account" link at bottom

Error cases shown as a red banner above the form:
- Wrong password → "Invalid email or password"
- Email not verified → "Please verify your email before signing in"
- Account locked → shown as error message

After successful login → redirected to whatever page they were trying to reach, or `/` (home).

---

### Home Page (`/`)

This is the first screen after login. Personalized.

**Top section:**
- Time-based greeting: "Good morning, Aarav" / "Good afternoon" / "Good evening" (based on device time)
- A subtitle like "What would you like to eat today?"
- A prominent button: "Browse Canteens" → goes to `/canteens`

**Canteens section:**
- Heading "Canteens"
- Shows up to 6 canteen cards in a grid
- Each card has: canteen photo (full width), canteen name, location, rating (stars), open/closed badge (green or grey), approximate prep time
- "See all" link top-right → `/canteens`

**Featured Items section:**
- Heading "Featured Items"
- Shows 4 featured menu items from the first canteen that has featured items
- Each item card: photo, name, short description, price in rupees, Veg/Non-veg dot, "Add" button
- Tapping a featured item card goes to that item's canteen menu page

**Bottom Navigation (persistent on all main screens):**
Four tabs at the very bottom of the screen, always visible:
1. **Home** (house icon) — `/`
2. **Canteens** (store icon) — `/canteens`
3. **Orders** (receipt icon) — `/orders`
4. **Profile** (user icon) — `/profile`

Active tab shows icon in brand red (`#E8390E`) with a small red dot above it. Background is frosted glass (backdrop-blur, semi-transparent white).

---

### Canteens Page (`/canteens`)

Header: "Canteens" — a simple list/grid of all canteens.

**Search bar** — full width, magnifying glass icon inside, placeholder "Search canteens...". As you type, the list filters in real time with a 350ms debounce (so it doesn't fire on every keystroke).

**Filter chips** — three pill buttons side by side:
- "All" — shows every canteen
- "Open Now" — only canteens currently open (compares current time with opening/closing hours)
- "Closed" — only closed canteens

When a filter is active, it has brand red background + white text. Inactive filters are white with gray border.

**Result count** — small grey text below filters: "Showing 3 canteens for 'main'" when searching.

**Canteen cards** — same card format as home page. Tapping any card goes to `/menu/{canteenId}`.

If no results found: empty state with a store icon and "No canteens found" message.

---

### Menu Page (`/menu/{canteenId}`)

This is where most time is spent.

**Header (not sticky):**
Full-width canteen cover image with a dark gradient overlay at the bottom. On top of this:
- Back arrow button (top left)
- Canteen name in white bold text
- Rating: star icon + number (e.g. "4.2")
- Prep time: clock icon + "10–20 mins"
- Location: pin icon + location text
- Operating hours: "Open until 6:00 PM" or "Closed · Opens at 8:00 AM"
- Open/Closed badge: green pill "Open" or grey pill "Closed"

**Sticky section (stays at top when scrolling):**
Once you scroll past the header, these controls stay pinned:

1. **Search bar** — "Search items..." with debounce 300ms
2. **Diet filter buttons** — three pills: "All" / "Veg" / "Non-Veg"
3. **Category tabs** — horizontal scrollable row of category names (e.g. "Breakfast", "Lunch", "Snacks", "Beverages"). Tapping a category scrolls/filters to that category's items.

**Menu grid:**
2-column grid of item cards. Each card shows:
- Photo (top, full width of card)
- Green dot (veg) or Red dot (non-veg) — top left corner on the photo
- Item name (bold)
- Short description (2 lines max, truncated)
- Price in rupees (e.g. "₹45")
- Prep time (small grey text)
- **Add button** — a "+" button on the card
  - If item is already in cart: shows "−" and "+" with the quantity number between them (inline quantity control)
  - Tapping "+" when cart has items from a different canteen: shows a confirmation dialog "Your cart has items from [other canteen]. Starting a new cart will remove those items. Continue?" with Cancel and Continue buttons.

**Unavailable items** appear greyed out with "Unavailable" badge and cannot be added.

**Cart FAB (Floating Action Button):**
When cart has 1 or more items, a floating button slides up from the bottom:
- Brand red background
- Text: "2 items · View Cart"
- Arrow icon
- Tapping it opens the Cart Sheet

**Cart Sheet:**
A bottom drawer that slides up from the bottom of the screen (not a full page navigation). Can be dismissed by swiping down or tapping the backdrop.

Header: "My Cart" or "My Cart (3)" when 3 items.

If empty: shopping bag icon, "Your cart is empty", "Browse Menu" button.

Items list — each item row:
- Green/red dot (veg indicator)
- Item name + unit price (small grey)
- Quantity control: minus button, number, plus button (all inline, brand colored background on buttons)
- Subtotal for that item (right-aligned)
- Trash icon button (right side, removes item)

Summary section below items:
- Subtotal: ₹90
- GST (5%): ₹4.50
- **Total: ₹94.50** (bold)

Two buttons at bottom:
- "Clear" (outline style, clears entire cart)
- "Proceed to Checkout →" (brand red, closes sheet, navigates to `/cart`)

---

### Cart & Checkout Page (`/cart`)

Full-page view of the cart with the actual checkout flow.

**If cart is empty:** shopping bag icon, "Your cart is empty", "Browse Canteens" button.

**Cart items list** (same as cart sheet but full page).

**Special instructions text area:**
- Label: "Special instructions (optional)"
- Placeholder: "E.g. Less spice, no onion..."
- Max 500 characters
- Character counter shows remaining (e.g. "450 remaining")

**Coupon section:**
- Label: "Apply Coupon"
- Input field + "Apply" button side by side
- On successful coupon: green box appears below showing code + discount amount ("SAVE10 · −₹20"), with an × button to remove it
- On invalid coupon: red error text appears below the input

**Order Summary:**
| Line | Amount |
|---|---|
| Subtotal | ₹90.00 |
| GST (5%) | ₹4.50 |
| Discount (SAVE10) | −₹20.00 |
| **Total** | **₹74.50** |

**"Place Order" button** — brand red, full width, "Proceed to Pay ₹74.50".

**What happens when you tap "Place Order":**

Step 1 — Order creation: POST to `/api/v1/orders`. Server validates all items still exist and are available, calculates tax, applies coupon atomically. Creates order record in DB with status `payment_pending`. Returns `order_id`.

Step 2 — Payment order: POST to `/api/v1/payments/create` with the `order_id`. Server creates a Razorpay order and returns `razorpay_order_id`, amount, key_id.

Step 3 — Razorpay modal opens: The official Razorpay payment UI slides up as a sheet on mobile. Student selects payment method (UPI, card, net banking, wallet) and completes payment.

Step 4 — Verification: On payment success, Razorpay calls back with `razorpay_payment_id` and `razorpay_signature`. App POSTs these to `/api/v1/payments/verify`. Server verifies the HMAC signature with Razorpay's secret to confirm the payment is real, updates order status to `confirmed`, creates a QR token automatically.

Step 5 — Redirect: Student is taken to `/orders/{orderId}` to track their order.

If payment fails at any step: order remains in `payment_pending` or `payment_failed` status. The student sees an error and can retry.

---

### Orders List Page (`/orders`)

**Active Orders section** (top):
Shows orders with status: `confirmed`, `preparing`, `ready`. These are "live" orders.

Each active order card shows:
- Order number (e.g. "CB-260610-001234")
- Canteen name
- Total items + total price
- Status badge with color:
  - Confirmed → Blue
  - Preparing → Orange/Amber
  - Ready → Green
- Time since placed
- Tapping goes to `/orders/{id}`

Auto-refreshes every 30 seconds to catch status updates.

**Past Orders section** (below):
Orders with status: `collected`, `cancelled`, `refunded`.

Each past order card shows:
- Order number
- Canteen name
- Date (formatted as "10 Jun 2026, 1:30 PM")
- Total price
- Status badge (grey for collected, red for cancelled)

**Empty state:** If no orders at all — shopping bag icon, "No orders yet", "Browse Canteens" button.

**Manual refresh button** — small refresh icon at top right of the active orders section.

---

### Order Detail Page (`/orders/{id}`)

Header:
- Back arrow
- "Order #CB-260610-001234"
- Date and time
- Canteen name

**Two tabs:**

**Tab 1: Status**

Order timeline — a vertical sequence of 4 steps with connecting lines:

```
  ● Order Confirmed        [timestamp if done]
  |
  ● Being Prepared         [timestamp if done]
  |
  ● Ready for Pickup       [timestamp if done]
  |
  ● Collected              [timestamp if done]
```

Each step has an icon:
- Confirmed: ✓ circle
- Preparing: fork & knife
- Ready: package/box
- Collected: shopping bag

State visuals:
- **Completed step**: green circle, white checkmark
- **Current step**: brand red circle, animated pulsing dot next to it, estimated time shown in small text below
- **Future step**: white circle with grey outline

When order is `ready`: a green banner appears between the timeline and items: "Your order is ready! Show your QR code to collect."

**Terminal states** (shown above the timeline if applicable):
- Cancelled: Red box, ✕ icon, "Order Cancelled", shows cancellation reason if there was one
- Payment Failed: Red box, ✕ icon, "Payment Failed"
- Refunded: Purple box, return arrow icon, "Order Refunded"

Below timeline — **Order Items list:**
Each item shows name, quantity, and price (e.g. "2× Masala Dosa · ₹90.00")

**Price summary:**
- Subtotal
- GST (5%)
- Discount (if coupon was used, shows code and amount in green)
- **Total** (bold)

**Special instructions** (shown if student entered any): grey text box with the instruction text.

**Payment details** (shown if paid): small section with partially masked payment ID.

**Cancel button** (shown only if status is `payment_pending` or `confirmed`):
- Outline red button "Cancel Order"
- Tapping opens a confirmation dialog: "Cancel this order? This action cannot be undone."
- Two buttons: "Keep Order" and "Yes, Cancel"
- On cancel: POSTs to `/api/v1/orders/{id}/cancel`

**Tab 2: QR Code**

Only accessible if payment is confirmed (tab is disabled otherwise with greyed text).

QR code display showing:
- Small instructional text: "Scan at the canteen kiosk"
- "Order #CB-260610-001234" subtitle
- **QR code canvas** — black and white QR code, approximately 240×240px
  - QR content: `campusbite://qr/{token_uuid}` (not readable by generic QR apps — only the kiosk scanner knows this scheme)
  - Error correction level H (works even if screen is slightly smudged)
- **Countdown timer** below the QR:
  - Shown as "Valid for 2h 45m 30s" in green pill
  - Below 10 minutes: turns red, shows "⚠ Expiring soon! 9m 30s"
  - Pulsing red dot when urgent
- Security notice: "Do not share this QR code with anyone"
- Regenerate link: small text "Having trouble? Regenerate QR code"

**Expired QR state:** QR canvas blurs and an overlay appears: "⏰ QR Code Expired" in red. Shows "Your QR has expired. Contact the canteen with your Order ID." and a "Request New QR" button.

The QR auto-refreshes its token data every 60 seconds (in case it was just generated).

---

### Profile Page (`/profile`)

**Avatar section:**
- If avatar set: circular photo
- If no avatar: circle with user's initials (brand red background, white text)
- Full name below in large text
- Email in grey
- Institute name (if set)
- "Edit profile" button (shows "Edit profile coming soon" toast — placeholder)

**Account Details section:**
- Full Name (displayed as text)
- Email (read-only, lock icon)
- Phone: shows phone number or "Add phone number" placeholder, with pencil edit icon
  - Tapping edit opens an inline input (functionality marked coming soon)

**Settings section:**
- "Notifications" → chevron → shows "Coming soon" toast
- "Privacy & Security" → chevron → shows "Coming soon" toast

**Sign Out:**
- Full-width white button with red text "Sign Out"
- On click: Supabase `signOut()`, clears cart, redirects to `/login`
- Shows "Signed out" state briefly

**Danger Zone:**
- "Delete Account" button — red outline
- Tapping opens confirmation dialog:
  - "Delete your account? This will permanently delete your account and all your data. This action cannot be undone."
  - "Cancel" and "Delete Account" (red) buttons
  - (Delete functionality: currently shows warning, implementation pending)

**Version:** "CampusBite v0.1.0" in small grey text at the very bottom.

---

## 4. Admin App — Every Screen, Every Feature

The admin app is desktop-first. It has a persistent left sidebar and a main content area. On mobile, the sidebar collapses and there's a hamburger menu.

### Sidebar Navigation

Always visible on left side (desktop). Logo "CampusBite" at top.

Navigation links (with icons):
1. **Dashboard** — overview metrics
2. **Orders** — all orders management
3. **Menu** — menu items and categories
4. **Users** — student accounts
5. **Staff** — staff members
6. **Analytics** — charts and reports
7. **Kiosks** — kiosk device management
8. **Audit Logs** — system activity log
9. **Settings** — configuration

At the bottom of sidebar:
- User avatar + name + role
- "Sign out" button

Active item has brand red left border and red text.

---

### Dashboard (`/dashboard`)

The first thing you see after logging in as admin.

**4 Stat Cards (top row):**

| Card | What it shows | Change indicator |
|---|---|---|
| Today's Revenue | ₹12,450 | ↑ 23% vs yesterday |
| Orders Today | 87 | ↑ 12% vs yesterday |
| Active Orders | 14 | (live count) |
| New Users Today | 5 | (today's registrations) |

Each card: icon (top right), large number, label, and a small percentage change badge (green for up, red for down).

**Revenue Chart (last 7 days):**
Bar chart using Recharts. X-axis shows dates (Mon, Tue, etc.), Y-axis shows revenue in rupees. Hovering a bar shows tooltip with exact amount and order count.

**Recent Orders table:**
Last 10 orders. Columns: Order #, Customer Name, Canteen, Items, Amount, Status badge, Time. Each row is clickable → goes to that order's detail page.

All data auto-fetches every 30 seconds.

---

### Orders Page (`/orders`)

Full order management.

**Filters bar (top):**
- Search input: "Search by order number..." (debounced)
- Status dropdown: All / Payment Pending / Confirmed / Preparing / Ready / Collected / Cancelled
- Date range: "Last 7 days" / "Last 30 days" / "Custom" (date pickers)
- Canteen dropdown: All / [individual canteens]
- "Export CSV" button (right side)

**Orders table:**
Columns with sorting arrows:
- Order # (sortable)
- Customer (name + email, smaller)
- Canteen name
- Items (e.g. "3 items")
- Amount (formatted in rupees)
- Status badge (color-coded)
- Time (relative: "5 min ago", or absolute for older)
- Actions: eye icon (view details), status dropdown (change status inline)

Pagination: shows "Page 1 of 5 (87 orders)", prev/next buttons.

**Status color coding:**
- payment_pending → grey
- confirmed → blue
- preparing → amber/orange
- ready → green
- collected → grey/muted
- cancelled → red
- refunded → purple

---

### Order Detail Page (`/orders/{id}`)

Full order information for admin.

**Header:** Order number, canteen, date, current status badge.

**Status action buttons (top right):**
Valid transitions shown as buttons based on current status:
- confirmed → "Mark as Preparing" button
- preparing → "Mark as Ready" button
- ready → "Mark as Collected" button (for manual override)
- Any status → "Cancel Order" (if not already collected/refunded)

**Customer info block:**
- Avatar + name + email
- "View Profile" link

**Order Items:**
Table showing item name, quantity, unit price, total. Below: subtotal, GST, discount, **Total**.

**Payment block:**
- Payment method (UPI / Card)
- Razorpay payment ID
- Razorpay order ID
- Status badge

**QR Token block:**
- Current token status: active / used / expired / revoked
- Token UUID (partially masked)
- Expires at timestamp
- "Regenerate QR" button (creates new token if expired/lost)
- "Revoke QR" button (marks token as revoked — use when cancelling)
- Scan history for this token (which kiosk, when)

**Special instructions** (if any): yellow/amber note box.

**Timeline:** Same visual as student app showing order progression.

---

### Menu Management (`/menu`)

Two tabs: **Items** and **Categories**.

**Items tab:**

Filter: by canteen, by category, search by name, toggle to show only unavailable items.

Table columns:
- Photo (thumbnail, 48×48px)
- Name
- Category
- Price (₹)
- Availability toggle (green when available, grey when not — click to toggle)
- Actions: Edit (pencil) and Delete (trash) icons

"+ Add Item" button top right → opens a full modal/dialog:

**Add/Edit Item dialog:**
- Item Name *
- Description
- Category (dropdown)
- Price in Rupees * (converted to paise on save)
- Prep time (minutes)
- Dietary type (Veg / Non-Veg / Egg / Vegan)
- Calories (optional)
- Allergens (multi-select tags)
- Image upload
- "Featured item" toggle
- "Available" toggle
- Save / Cancel

**Categories tab:**

Drag-to-reorder list of categories. Each row shows:
- Drag handle icon
- Category icon/emoji
- Category name
- Item count in brackets
- Edit / Delete icons

"+ Add Category" button → small dialog: name, icon/emoji picker, description.

---

### Users Page (`/users`)

**Filters:** Search by name/email, filter by role (All / Student / Staff / Admin), filter by status (Active / Inactive).

**Users table:**
- Avatar + Full Name + email (stacked)
- Role badge
- Institute
- Joined date
- Status (Active / Inactive)
- Actions: View, Edit

Clicking "Edit" opens inline panel:
- Change role (for super_admin only)
- Toggle active/inactive
- Assign to institute

---

### Staff Management (`/staff`)

List of all staff members.

Table columns: Name, Email, Role, Assigned Canteen, Permissions, Last Active, Actions.

"+ Add Staff" button → dialog:
- Select existing user from dropdown (search by email)
- Assign role: `canteen_staff` or `canteen_admin`
- Assign to canteen
- Set permissions (checkboxes): manage menu, manage orders, view analytics

---

### Analytics Page (`/analytics`)

**Date range selector** (top): Last 7 days / Last 30 days / Last 90 days / Custom range.

**Four charts:**

1. **Revenue Over Time** — Line chart. X-axis: dates. Y-axis: ₹. Shows daily revenue trend. Hovering shows tooltip.

2. **Top 10 Items by Orders** — Horizontal bar chart. Shows which menu items are ordered most. Item name on Y-axis, order count on X-axis.

3. **Orders by Hour of Day** — Bar chart. X-axis: 0–23 (hours). Y-axis: average order count. Immediately shows which hours are busiest (typically 12–1 PM peak).

4. **Payment Method Breakdown** — Pie chart. Slices for: UPI, Card, Net Banking, Wallet. Legend shows percentage.

---

### Kiosks Page (`/kiosks`)

All kiosk devices registered to your canteens.

**Status indicators:**
- 🟢 Online — heartbeat received within last 5 minutes
- 🟡 Warning — heartbeat 5–15 minutes ago
- 🔴 Offline — no heartbeat for 15+ minutes

**Kiosks table:**
- Kiosk name
- Canteen
- Last heartbeat ("2 min ago" / "45 min ago" / "3 days ago")
- Status dot with label
- Printer status ("OK" / "No Paper" / "Error" / "Unknown")
- Offline queue ("3 scans pending sync")
- Actions: View Details, Deactivate

**"+ Add Kiosk" button** → opens registration flow.

**Kiosk Registration (2-step dialog):**

Step 1 — Fill form:
- Select Canteen (dropdown)
- Kiosk Name (e.g. "Main Counter Kiosk")
- Location (e.g. "Counter 1, Ground Floor")
- Device ID (MAC address of Pi — run `cat /sys/class/net/wlan0/address` on Pi)

Click "Register" → server generates UUID kiosk ID + 64-character random API key, encrypts the key with AES-256-GCM, stores encrypted version.

Step 2 — One-time API key display:
- Big amber warning box: "⚠ Copy this API key now. It will never be shown again."
- Kiosk ID in monospace box with copy button
- API Key in monospace box with copy button
- "I have copied both values" checkbox must be checked to close

---

### Kiosk Detail Page (`/kiosks/{id}`)

All information about one kiosk device.

**Info block:** Name, Canteen, Location, Device ID, Firmware version (if sent by kiosk), Online status, Last heartbeat timestamp, Printer config (paper width, chars per line).

**Last 100 scans table:**
Columns: Time, Order # (if valid), Raw token (first 12 chars...), Result, Print success, Offline scan (badge if yes).

Result color coding:
- success → green
- expired → amber
- already_used → orange
- invalid → red
- error → dark red

**Offline sync history:** Shows when offline scans were synced, conflict count, synced count.

**Delete Kiosk** button (red, bottom of page) — confirmation dialog required.

---

### Audit Logs (`/audit-logs`)

Complete activity trail.

**Filters:** by user (search), by action type (dropdown), by date range.

**Log table:** 
- Timestamp
- User (name + email)
- Action (e.g. "ORDER_STATUS_UPDATED", "KIOSK_REGISTERED", "USER_ROLE_CHANGED")
- Entity type + ID (e.g. "order / CB-001234")
- IP address
- Changes (JSONB diff for update actions)

---

### Settings (`/settings`)

Four tabs:

**General:** Canteen operating hours, canteen description, contact info, tax rate (currently fixed at 5%).

**Notifications:** Toggle email/SMS notifications for new orders, order ready, cancellations.

**Security:** View current 2FA status, session management (active sessions list with revoke option).

**API Keys:** View (masked) API keys for external integrations. Not for kiosk keys — those are in Kiosks section.

---

## 5. Kiosk — How It Works

The kiosk is a completely headless Python program. No screen. No GUI. No keyboard input from humans. It boots with the Pi, runs as a background service, and silently waits.

### What's connected

- **USB Barcode Scanner** (Honeywell Voyager 1450g) — connects via USB, registers as a keyboard in Linux (`/dev/input/event*`). When a QR code is scanned, it "types" the QR content followed by Enter.
- **USB Thermal Printer** (Xprinter XP-58IIH) — connects via USB, controlled via ESC/POS commands (python-escpos library).

### Boot sequence

1. Raspberry Pi powers on
2. Pi OS Lite boots (takes ~30 seconds)
3. systemd starts `campusbite-kiosk.service` (5 second delay after boot to let network settle)
4. Python loads `main.py`
5. Logging initializes (rotating file log at `/opt/campusbite-kiosk/logs/kiosk.log`)
6. `KioskApp` loads `config/kiosk.yaml` (reads server URL, printer IDs, etc.)
7. API key loaded from `CAMPUSBITE_API_KEY` environment variable (set in `/etc/campusbite-kiosk/secrets.env`)
8. SQLite database initializes at `db/kiosk.db` (creates tables if first run)
9. Scanner thread starts (grabs the USB scanner device via evdev)
10. Sync thread starts (runs every 30 seconds)
11. Heartbeat thread starts (runs every 60 seconds)
12. Program enters main loop — ready for scans

### When a QR is scanned

The physical flow:
1. Student opens their order on the phone → QR Code tab
2. Student holds the phone up to the scanner
3. Scanner reads the QR code (it's an optical sensor — takes ~100ms)
4. Scanner "types" the QR content as keystrokes: `campusbite://qr/550e8400-e29b-41d4-a716-446655440000` + Enter
5. The kiosk Python app captures these keystrokes via evdev

The software flow:
1. Rate limiter check: max 60 scans/minute. If exceeded, ignored.
2. Debounce check: if same scan came in within last 3 seconds, ignore (prevents double-scans).
3. Prefix check: must start with `campusbite://qr/`. Anything else → error logged, nothing printed.
4. UUID format validation: the token after the prefix must match the UUID v4 pattern (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`). Invalid format → error logged, nothing printed.
5. Online check: `GET https://your-app.vercel.app/api/health` with 3-second timeout.
6. If online → online scan flow.
7. If offline → offline scan flow.

**Online scan flow:**
1. Build HMAC-signed POST request:
   - Header `X-Kiosk-ID`: kiosk UUID
   - Header `X-Kiosk-Timestamp`: current Unix timestamp (seconds)
   - Header `X-Kiosk-Signature`: HMAC-SHA256 of `POST\n/api/v1/kiosk/scan\n{timestamp}\n{sha256(body)}`
2. POST `{token}` to `https://your-app.vercel.app/api/v1/kiosk/scan`
3. Server validates HMAC, calls atomic PostgreSQL function
4. Response: either success (with order details) or error (with code)

**On success response:**
- Printer starts printing immediately
- Log entry written

**On error response:**
- Error code logged: `ALREADY_USED`, `EXPIRED`, `INVALID_TOKEN`, `REVOKED`, `ORDER_NOT_COLLECTABLE`
- Nothing printed

**Offline scan flow:**
1. Check SQLite `token_cache` table: has this token been cached from the last sync?
2. If not in cache: log "OFFLINE_UNAVAILABLE" — nothing can be done
3. If in cache but `is_used = 1`: log "ALREADY_USED" — nothing printed
4. If in cache and valid: mark as `is_used = 1` in local SQLite, add to `sync_queue`
5. Print receipt with "OFFLINE SCAN" marker
6. When internet returns: sync queue processes — server confirms or reports conflict

### What prints on the receipt

58mm wide thermal paper, 32 characters per line:

```
       CAMPUSBITE
   Main Canteen
================================
           #042
================================
Order: CB-260610-001234
Time:  10 Jun 2026, 12:35 PM
--------------------------------
ITEMS
2x Masala Dosa          Rs.90
1x Filter Coffee        Rs.20
--------------------------------
Subtotal               Rs.110
GST (5%)               Rs.5
================================
TOTAL                  Rs.115
================================

  Present this at counter
   to collect your order


```

The `#042` is printed in double-height, double-width text — very large, staff can read it from a distance. This is the daily sequential token number (001–999, resets at midnight).

If it was an offline scan:
```
*** OFFLINE SCAN ***
```
appears below the canteen name.

The paper auto-cuts after printing.

### Heartbeat

Every 60 seconds, kiosk sends:
```json
POST /api/v1/kiosk/heartbeat
{ "printer_status": "ok", "offline_queue_count": 0 }
```

Admin dashboard uses this to determine 🟢/🟡/🔴 status.

### Token cache refresh

Every 30 seconds (when online), kiosk fetches all active QR tokens for its canteen:
```
POST /api/v1/kiosk/cache
{ "canteen_id": "..." }
```

Returns up to 200 active tokens with their order data. These are stored in the local SQLite `token_cache` table with 5-minute TTL. This enables offline mode for recently-ordered tokens.

---

## 6. The Complete Order Journey

This is the full lifecycle of one order, from phone to food:

```
1. STUDENT OPENS APP
   └─ Logs in (Google or email/password)
   └─ Session stored in httpOnly cookie (Supabase SSR)

2. STUDENT BROWSES
   └─ Home page → Canteens → Menu
   └─ Canteen filtering (open now, search)
   └─ Menu filtering (veg/non-veg, category, search)

3. STUDENT ADDS TO CART
   └─ Cart stored in Zustand (persisted to localStorage)
   └─ Max 10 of any item
   └─ Switching canteens clears cart (after confirmation)

4. STUDENT GOES TO CHECKOUT (/cart)
   └─ Reviews items, adds special instructions
   └─ Optionally enters coupon code
      └─ Server validates coupon (expiry, usage limit, min order)
      └─ Atomically reserves coupon usage (DB function with row lock)

5. STUDENT TAPS "PLACE ORDER"
   └─ POST /api/v1/orders
      └─ Server verifies each item still available and price unchanged
      └─ Server calculates tax (5%)
      └─ Server generates order_number (format: CB-YYMMDD-XXXXXX)
      └─ Order created with status: payment_pending
   └─ POST /api/v1/payments/create
      └─ Server creates Razorpay order
      └─ Returns razorpay_order_id, amount, key_id
   └─ Razorpay modal opens on phone

6. STUDENT PAYS
   └─ Razorpay handles UPI/card/net banking
   └─ On success: Razorpay calls back with payment_id + signature

7. PAYMENT VERIFICATION
   └─ POST /api/v1/payments/verify
      └─ Server verifies HMAC signature with Razorpay secret
      └─ Updates order: payment_status=paid, status=confirmed
      └─ Creates payment_transaction record
      └─ Automatically generates QR token (expires in 3 hours)
   └─ Student redirected to /orders/{orderId}
   ALSO: Razorpay sends webhook (payment.captured event)
      └─ POST /api/v1/payments/webhook (backup confirmation)
      └─ Signature verified with timingSafeEqual
      └─ Idempotent: checks if already processed

8. STUDENT SEES ORDER TRACKING
   └─ Status: Confirmed (blue dot on timeline)
   └─ QR Code tab now accessible
   └─ 3-hour countdown timer visible on QR

9. CANTEEN STAFF PREPARES ORDER
   └─ Admin app: Orders page shows new confirmed order
   └─ Staff clicks "Mark as Preparing" → status: preparing
   └─ Staff clicks "Mark as Ready" → status: ready

10. STUDENT'S APP UPDATES
    └─ Order polling (every 30s) catches the status change
    └─ Timeline shows "Ready for Pickup" highlighted
    └─ Green banner: "Your order is ready! Show your QR code to collect."

11. STUDENT WALKS TO KIOSK
    └─ Opens QR Code tab on phone
    └─ Holds phone up to the scanner

12. KIOSK SCANS QR
    └─ Reads: campusbite://qr/550e8400-e29b-41d4-a716-446655440000
    └─ UUID validation
    └─ HMAC-signed POST to /api/v1/kiosk/scan

13. SERVER PROCESSES SCAN (ATOMIC)
    └─ Verifies kiosk HMAC (30-second replay window)
    └─ Calls validate_and_use_qr_token() PostgreSQL function
    └─ Function atomically:
       ├─ Checks token exists, status='active', not expired
       ├─ Checks order in valid collectable state
       ├─ Sets token status='used' (prevents any future scan)
       ├─ Sets order status='collected'
       ├─ Assigns daily token number (#001–#999)
       └─ Returns full receipt data
    └─ Logs scan in kiosk_scans table
    └─ Returns success with order details

14. KIOSK PRINTS RECEIPT
    └─ ESC/POS commands to thermal printer
    └─ Token number printed in LARGE text
    └─ All items, prices, total
    └─ "Present this at counter"
    └─ Paper cuts automatically

15. STUDENT HANDS RECEIPT TO STAFF
    └─ Staff reads token number (#042)
    └─ Finds and hands over the order
    └─ Done

16. ADMIN SEES IT ALL
    └─ Order status = collected
    └─ Scan logged in kiosk_scans
    └─ Revenue updated in dashboard
```

---

## 7. User Roles & What Each Can Do

There are 4 roles in the system:

### `student` (default for all new registrations)

**Can:**
- Register and log in (email or Google)
- Browse all canteens and menus (even without logging in, if made public)
- Add items to cart
- Place orders and pay
- View their own orders only
- Cancel their own orders (if in cancellable status)
- View and use their own QR codes
- Edit their own profile (name, phone)
- Delete their own account

**Cannot:**
- See other students' orders or payment data
- Access the admin app (403 FORBIDDEN)
- Call any `/api/v1/admin/*` endpoint
- Change their own role

### `staff` (canteen counter worker)

Everything student can do, PLUS via admin app:
- View orders for their assigned canteen
- Update order status (confirmed → preparing → ready)
- View kiosk scan history for their canteen
- View users in their institute (not edit)

**Cannot:**
- Register/deregister kiosks
- Manage menu items
- View analytics
- Access other canteens' data

### `canteen_admin` (canteen manager)

Everything staff can do, PLUS:
- Add/edit/delete menu items for their canteen
- Manage categories
- Register and manage kiosks for their canteen
- View analytics for their canteen
- Manage staff for their canteen
- View all users in their institute

**Cannot:**
- Change other admins' roles
- Access other institutes' data

### `super_admin` (platform owner)

Full access to everything:
- All of the above
- Manage all institutes
- View all users across all institutes
- Change any user's role
- View all audit logs
- Access all canteens across all institutes

---

## 8. API Reference — Every Endpoint

### Student App API (`localhost:3000/api/v1/`)

**Health**
- `GET /api/health` — Returns `{status:"ok"}`. Used by kiosk to check connectivity.

**Canteens**
- `GET /api/v1/canteens` — List canteens. Query params: `search`, `is_open`, `limit`. Public.
- `GET /api/v1/canteens/{id}` — Single canteen detail. Public.
- `GET /api/v1/canteens/{id}/categories` — Categories for a canteen. Public.
- `GET /api/v1/canteens/{id}/menu-items` — Menu items. Params: `category_id`, `is_veg`, `search`, `is_featured`. Public.

**Orders (auth required)**
- `GET /api/v1/orders` — Student's own orders. Params: `status`, `page`, `per_page`.
- `POST /api/v1/orders` — Create order. Body: `{canteen_id, items:[{menu_item_id, quantity}], special_instructions, coupon_code}`. Rate limited: 20/min.
- `GET /api/v1/orders/{id}` — Single order (must be own order).
- `POST /api/v1/orders/{id}/cancel` — Cancel order. Body: `{reason}`.
- `GET /api/v1/orders/{id}/qr` — Get/create QR token for order.
- `POST /api/v1/orders/{id}/qr` — Regenerate QR token.

**Payments (auth required)**
- `POST /api/v1/payments/create` — Create Razorpay order. Body: `{order_id}`. Rate limited: 10/min.
- `POST /api/v1/payments/verify` — Verify payment. Body: `{razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id}`.
- `POST /api/v1/payments/webhook` — Razorpay webhook (no auth, HMAC verified instead).

**Coupons (auth required)**
- `POST /api/v1/coupons/validate` — Validate a coupon code. Body: `{code, canteen_id, subtotal_paise}`.

### Admin App API (`localhost:3001/api/v1/`)

All admin routes require:
1. Valid Supabase session (cookie)
2. User role must be `super_admin`, `canteen_admin`, or `staff`

**Dashboard**
- `GET /api/v1/admin/dashboard` — Stats, revenue chart, recent orders.

**Orders**
- `GET /api/v1/admin/orders` — All orders with filters. Params: `status`, `canteen_id`, `date_from`, `date_to`, `search`, `page`.
- `GET /api/v1/admin/orders/{id}` — Full order detail.
- `PUT /api/v1/admin/orders/{id}/status` — Update status. Body: `{status}`.

**Menu**
- `GET /api/v1/admin/menu-items` — All items. Params: `canteen_id`, `category_id`, `search`.
- `POST /api/v1/admin/menu-items` — Create item.
- `GET /api/v1/admin/menu-items/{id}` — Single item.
- `PUT /api/v1/admin/menu-items/{id}` — Update item.
- `DELETE /api/v1/admin/menu-items/{id}` — Delete item.
- `GET /api/v1/admin/categories` — List categories.
- `POST /api/v1/admin/categories` — Create category.
- `PUT /api/v1/admin/categories/{id}` — Update.
- `DELETE /api/v1/admin/categories/{id}` — Delete.

**Users**
- `GET /api/v1/admin/users` — User list with filters.
- `GET /api/v1/admin/users/{id}` — User detail.
- `PUT /api/v1/admin/users/{id}` — Update role/status.

**Kiosks**
- `GET /api/v1/admin/kiosks` — All kiosks with status.
- `POST /api/v1/admin/kiosks` — Register new kiosk (generates + returns API key once).
- `GET /api/v1/admin/kiosks/{id}` — Kiosk detail + scan history.
- `PUT /api/v1/admin/kiosks/{id}` — Update config.
- `DELETE /api/v1/admin/kiosks/{id}` — Deactivate.

**Analytics**
- `GET /api/v1/admin/analytics` — Charts data. Params: `days` (7/30/90).

**Audit Logs**
- `GET /api/v1/admin/audit-logs` — Paginated logs with filters.

**Kiosk endpoints (HMAC auth only — no user session)**
- `POST /api/v1/kiosk/scan` — Validate and use QR token. Body: `{token}`.
- `POST /api/v1/kiosk/heartbeat` — Kiosk health update. Body: `{printer_status, offline_queue_count}`.
- `POST /api/v1/kiosk/sync-offline` — Upload offline scans. Body: `{scans:[...]}`.
- `POST /api/v1/kiosk/cache` — Fetch active tokens for offline cache. Body: `{canteen_id}`.

---

## 9. Database — Every Table Explained

All tables live in Supabase (PostgreSQL 15). All have Row Level Security (RLS) enabled. All IDs are UUIDs. All monetary values stored in paise (₹1 = 100 paise).

| Table | Purpose | Key columns |
|---|---|---|
| `institutes` | Colleges/universities | name, code, city, is_active |
| `canteens` | Individual food outlets | institute_id, opens_at, closes_at, is_open, tax_percentage |
| `categories` | Menu groupings | canteen_id, name, sort_order |
| `menu_items` | Dishes on the menu | canteen_id, price_paise, is_veg, is_available, is_featured, allergens |
| `users` | All accounts (mirrors auth.users) | email, full_name, role, institute_id, is_active |
| `addresses` | Saved delivery addresses | user_id, line1, city, pincode, is_default |
| `orders` | Each order placed | order_number, user_id, canteen_id, status, payment_status, total_paise |
| `order_items` | Line items in an order | order_id, menu_item_id, quantity, price_paise |
| `qr_tokens` | QR codes for pickup | order_id, token (UUID), status, expires_at, used_at, kiosk_id |
| `kiosks` | Pi kiosk devices | canteen_id, device_id, api_key_encrypted, last_heartbeat |
| `kiosk_scans` | Audit log of every scan attempt | kiosk_id, token, scan_result, order_id |
| `daily_tokens` | Sequential numbers (#001–#999) | canteen_id, date, order_id, token_number |
| `kiosk_offline_queue` | Offline scan buffer | kiosk_id, raw_token, sync_status |
| `coupons` | Discount codes | code, discount_type, discount_value, usage_limit, valid_until |
| `user_coupons` | Which user used which coupon | user_id, coupon_id, is_used |
| `favorites` | Saved menu items | user_id, menu_item_id |
| `reviews` | Item ratings | user_id, menu_item_id, order_id, rating (1–5), comment |
| `loyalty_points` | Points earned/spent | user_id, points, type (earned/redeemed), reference_id |
| `notifications` | In-app notifications | user_id, title, body, type, is_read |
| `payment_transactions` | Payment record | order_id, razorpay_ids, amount_paise, status, gateway_response |
| `audit_logs` | Admin action trail | user_id, action, entity_type, entity_id, ip_address |

**Order status flow:**
```
payment_pending → payment_failed
payment_pending → confirmed → preparing → ready → collected
                                                  ↘ cancelled (any time before collected)
collected → refunded
cancelled → refunded
```

This is enforced by a PostgreSQL trigger (`validate_order_status_transition`) — invalid transitions are rejected at the database level.

---

## 10. Money Flow — How Payments Work

```
Student taps "Place Order"
│
├─ App creates order in DB (status: payment_pending)
│
├─ App calls Razorpay API (server-side, never from browser)
│   └─ Creates Razorpay order with amount in paise + currency INR
│   └─ Returns: razorpay_order_id, amount, key_id
│
├─ Razorpay checkout modal opens on phone
│   └─ Student picks UPI/Card/Net Banking
│   └─ Student authenticates (UPI PIN, card CVV, etc.)
│   └─ Razorpay handles everything
│
├─ On success: Razorpay returns to app:
│   └─ razorpay_payment_id
│   └─ razorpay_signature (HMAC of order_id + "|" + payment_id, signed with secret)
│
├─ App sends to server for verification:
│   └─ Server recreates signature: HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
│   └─ If signatures match → payment is real
│   └─ Order updated: payment_status=paid, status=confirmed
│   └─ QR token auto-generated
│
└─ Razorpay also sends webhook (async, separate):
    └─ Event: payment.captured
    └─ Server verifies webhook signature (timingSafeEqual)
    └─ Idempotent: checks if already processed before doing anything
    └─ Backup in case the verify call failed
```

**Money actually moves:** via Razorpay's payment processing. Razorpay handles UPI, cards, net banking. The money goes to your Razorpay account. Settlement to your bank happens on Razorpay's schedule (usually T+1 or T+2 days).

**Test mode vs Live mode:** In test mode (default in dev), Razorpay test cards/UPI IDs work, no real money moves. Switch to live mode in Razorpay dashboard when ready to go live — update the key_id and key_secret in Vercel env vars.

---

## 11. The QR System — How It Prevents Fraud

This is the most critical security feature. Here's why it works and how cheating is blocked:

**What the QR contains:**
`campusbite://qr/550e8400-e29b-41d4-a716-446655440000`

Just a UUID. Nothing else. No order info, no price, no name. The UUID has 122 bits of randomness — guessing a valid one is computationally impossible (2^122 possibilities).

**Why it can't be forged:**
- The token is generated server-side only, after payment is confirmed
- The UUID is random — no sequential pattern to predict
- The kiosk only trusts the server's database — the QR itself proves nothing without the server saying yes

**Why sharing doesn't work:**
- First scan wins — the atomic PostgreSQL function updates token status in a single transaction
- If Student A sends their QR screenshot to Student B, whoever scans first gets the food — the other gets "Already Collected"
- The database uses row-level locking (`FOR UPDATE NOWAIT`) so even if two kiosks scan simultaneously, exactly one gets `0 rows updated` and returns an error

**Why screenshots from last week don't work:**
- Tokens expire 3 hours after creation
- Server checks `expires_at > NOW()` in the atomic update — expired tokens return 0 rows

**Why the kiosk itself can't be abused:**
- Kiosk has a device-specific API key (stored AES-256-GCM encrypted on server)
- Every request is HMAC-SHA256 signed with that key
- Timestamp included in HMAC — replaying the same request more than 30 seconds later fails
- Invalid UUID format tokens are rejected before hitting the server
- 120 scan-per-minute rate limit per kiosk

**The daily token number (#042):**
This is separate from fraud prevention — it's operational. When the QR is validated, a sequential number (001–999) is assigned to that order for that day at that canteen. The printed receipt shows this big number. Staff announces "Token 42!" — no need to read 36-character UUIDs.

---

## 12. Offline Mode — When Internet Drops

The kiosk is designed to keep working during internet outages.

**Normal operation (online):** Every 30 seconds, kiosk fetches active tokens from the server and caches them in local SQLite. Each cached token has a 5-minute TTL in the local database.

**When internet drops:**

1. Kiosk's `is_online()` check returns False
2. Kiosk switches to offline mode
3. For each scan, checks the SQLite `token_cache` table instead of calling the server
4. If token found in cache and not yet used: marks it as `is_used=1` in SQLite, adds to `sync_queue`, prints receipt (with "OFFLINE SCAN" banner)
5. If token not in cache: cannot validate — prints nothing (shows "OFFLINE_UNAVAILABLE" in logs)

**When internet comes back:**
1. Sync loop wakes up (runs every 30 seconds)
2. Reads all records from `sync_queue` where `sync_status = 'pending'`
3. Sends them in batches of 50 to `POST /api/v1/kiosk/sync-offline`
4. Server processes each: if token not yet used on server → marks used, returns "synced". If already used → returns "conflict" (rare — means the same token was scanned at another kiosk while this one was offline)
5. Queue records updated with final status

**Risk during offline mode:**
If the same QR is scanned at two different kiosks while both are offline, both will print a receipt. When both sync back, one will be "synced" and one will be "conflict". Admin is notified of conflicts via the kiosk scan history. The conflict record flags the case for manual resolution.

---

## 13. Edge Cases & What Happens

| Scenario | What happens |
|---|---|
| Student adds item, then item becomes unavailable before checkout | Server checks availability at order creation time. Returns error: "Item [name] is no longer available." |
| Student applies coupon but all 10 uses were taken by others between validate and submit | Atomic `validate_and_reserve_coupon()` DB function holds a row lock — only one transaction can apply the last use |
| Student pays but internet drops before verify call | Razorpay webhook (separate HTTP call from Razorpay servers) confirms payment as backup. Order gets confirmed via webhook. |
| Student scans QR before order is marked "ready" | Server's `validate_and_use_qr_token()` checks order status. `payment_pending` or `cancelled` orders cannot be collected. Token is not consumed — student can try again when ready. |
| Two students scan the same QR simultaneously | PostgreSQL atomic UPDATE — exactly one gets the row lock. First one: `1 row updated` = success + receipt. Second one: `0 rows updated` = ALREADY_USED error. |
| QR expires (3 hours pass, student never came) | Token status in DB is still `active` but `expires_at < NOW()`. On next scan attempt: server function checks expiry, returns EXPIRED. Student sees "QR Expired" in app with "Request New QR" button. Admin can regenerate from order detail page. |
| Student cancels order after paying | Order must be in `payment_pending` or `confirmed` state to cancel. If paid: admin initiates refund via Razorpay dashboard. Token is revoked. |
| Kiosk loses power mid-print | Receipt may be partial. The token is already marked as `used` in the database (the scan was processed before printing). Staff uses the admin app to verify order was collected. |
| Student tries to visit `/api/v1/admin/*` from student app | 403 FORBIDDEN — role check added to all admin routes |
| Someone tries to change their role to super_admin | Database trigger `prevent_role_escalation` blocks the UPDATE with an exception |
| Invalid JSON body sent to kiosk scan endpoint | Returns 400 INVALID_BODY before any DB calls |
| Kiosk sends stale timestamp (replay attack attempt) | isTimestampValid() checks |now - ts| <= 30 seconds. Stale request rejected with 401 |

---

## 14. What Is Built vs What Is Placeholder

**Fully built and functional:**
- User registration (email + Google)
- Email verification flow
- Admin role enforcement (middleware + API routes)
- Canteen browsing, search, filter
- Menu browsing, search, filter by category/veg
- Cart management (Zustand, persisted, multi-quantity)
- Order creation with item validation + tax calculation
- Razorpay payment integration (create + verify + webhook)
- Order tracking with status timeline
- QR code generation and display with countdown
- Order cancellation (pre-collection)
- Admin dashboard with live stats and charts
- Admin order management (view, filter, export CSV, status update)
- Admin menu management (CRUD for items and categories)
- Admin user management (view, role change, activate/deactivate)
- Admin kiosk registration (with one-time API key)
- Kiosk heartbeat and health monitoring
- Full kiosk Python app (scanner, printer, offline mode, sync)
- All database security (RLS, triggers, atomic functions)
- All API security (HMAC, rate limiting, CSP, HSTS)

**Built as UI shell with "coming soon" / placeholder:**
- Edit profile (UI exists, form submit shows toast "coming soon")
- Phone number editing (UI shows edit button, no save flow)
- Notification preferences (toggle exists, no push notification backend yet)
- Privacy & Security settings (tab exists, content placeholder)
- Favorites (DB table exists, no UI to add favorites)
- Reviews & ratings (DB table exists, no UI to submit reviews)
- Loyalty points (DB table and functions exist, no frontend display)
- Reorder (DB history exists, "reorder" button not implemented)
- Receipt download (no PDF generation yet)
- Push notifications / Service Worker (not implemented)
- Scheduled orders (DB column exists, no UI)
- Staff performance analytics (admin page exists, some charts placeholder)
- Delete account (confirmation dialog exists, API call not wired)

**Not started:**
- PWA manifest + installability
- SMS OTP login
- 2FA (two-factor authentication)
- Refund flow UI (admin can do via Razorpay dashboard, but no in-app refund button)
- Bulk menu upload (CSV import)
- Scheduled reports (email delivery)
- Custom domains per institute

---

*This document describes the system as built. The code is the authoritative source — if anything here differs from what you see in the actual files, trust the code.*
