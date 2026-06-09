# CampusBite — Complete Setup Guide

Read this top to bottom. Do not skip steps. Every step is in order.

---

## Table of Contents

1. [What You Need Before Starting](#1-what-you-need-before-starting)
2. [Install Developer Tools on Your PC](#2-install-developer-tools-on-your-pc)
3. [Supabase — Database & Auth Setup](#3-supabase--database--auth-setup)
4. [Razorpay — Payment Gateway Setup](#4-razorpay--payment-gateway-setup)
5. [Google OAuth Setup](#5-google-oauth-setup)
6. [Sentry — Error Monitoring Setup](#6-sentry--error-monitoring-setup)
7. [Clone & Install Project Dependencies](#7-clone--install-project-dependencies)
8. [Student App — Environment Variables](#8-student-app--environment-variables)
9. [Admin App — Environment Variables](#9-admin-app--environment-variables)
10. [Run Both Apps Locally](#10-run-both-apps-locally)
11. [Create Your First Super Admin User](#11-create-your-first-super-admin-user)
12. [Seed Initial Data](#12-seed-initial-data)
13. [Vercel — Deploy to Production](#13-vercel--deploy-to-production)
14. [Cloudflare — DNS Setup](#14-cloudflare--dns-setup)
15. [Raspberry Pi Kiosk Setup](#15-raspberry-pi-kiosk-setup)
16. [Register a Kiosk in the Admin Panel](#16-register-a-kiosk-in-the-admin-panel)
17. [Test the Full Flow End to End](#17-test-the-full-flow-end-to-end)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. What You Need Before Starting

### Accounts you need to create (all free tier is fine to start)

| Service | URL | What it's for |
|---|---|---|
| Supabase | https://supabase.com | Database, Auth, Realtime |
| Razorpay | https://razorpay.com | Payments (UPI, card, etc.) |
| Google Cloud Console | https://console.cloud.google.com | Google OAuth login |
| Vercel | https://vercel.com | Hosting for both Next.js apps |
| Cloudflare | https://cloudflare.com | DNS, CDN (optional for dev) |
| Sentry | https://sentry.io | Error monitoring |
| GitHub | https://github.com | Code repository |

### Hardware for kiosk (only needed when deploying physically)

| Item | Where to buy in India | Approx Price |
|---|---|---|
| Raspberry Pi 4 (1GB) | RoboticsDNA, evelta.com, robu.in | ₹3,500–4,500 |
| SanDisk Endurance 32GB MicroSD | Amazon India | ₹700–900 |
| Official Pi USB-C Power Supply | Same Pi vendors | ₹900–1,200 |
| Honeywell Voyager 1450g USB Scanner | Barcode India, Amazon | ₹4,500–5,500 |
| Xprinter XP-58IIH Thermal Printer (58mm USB) | Amazon India, IndiaMart | ₹2,500–3,200 |
| 58mm Thermal Paper Rolls (50 pack) | Amazon India | ₹900–1,200 |

---

## 2. Install Developer Tools on Your PC

### Windows (your machine)

**Step 1 — Install Node.js 20 LTS**
- Go to: https://nodejs.org
- Download: "20.x.x LTS" (the left button)
- Run the installer. Click Next through everything. Keep defaults.
- Verify: open a new terminal and run:
  ```
  node --version
  ```
  Should print `v20.x.x`

**Step 2 — Install pnpm (package manager)**
- Open PowerShell as Administrator
- Run:
  ```powershell
  npm install -g pnpm
  ```
- Verify:
  ```
  pnpm --version
  ```
  Should print `9.x.x`

**Step 3 — Install Git**
- Go to: https://git-scm.com/download/win
- Download and install. Keep all defaults.
- Verify:
  ```
  git --version
  ```

**Step 4 — Install VS Code (recommended editor)**
- Go to: https://code.visualstudio.com
- Download and install.

---

## 3. Supabase — Database & Auth Setup

This is the most important section. Do this carefully.

### Step 1 — Create a Supabase account
- Go to: https://supabase.com
- Click "Start your project"
- Sign up with GitHub (easiest)

### Step 2 — Create a new project
- Click "New Project"
- Fill in:
  - **Organization**: your name or org name
  - **Project name**: `campusbite-prod` (or `campusbite-dev` for testing)
  - **Database Password**: generate a strong one and **save it somewhere safe** (you'll need it later)
  - **Region**: `ap-south-1` (Mumbai — closest to Indian users)
- Click "Create new project"
- Wait 2–3 minutes for it to set up. You'll see a spinner.

### Step 3 — Get your API keys

Once the project is ready:
- Click the **gear icon** (Settings) in the left sidebar
- Click **"API"** in the settings menu
- You will see these values — **copy each one** and save them somewhere (Notepad or a password manager):

| Key | Where to find it | What to name it |
|---|---|---|
| Project URL | "Project URL" box at the top | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | Under "Project API keys" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | Under "Project API keys" (click the eye to reveal) | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ **NEVER share the `service_role` key with anyone. Never put it in frontend code.**

### Step 4 — Run the database schema

This creates all your tables, indexes, security policies, and functions.

- In the left sidebar, click **"SQL Editor"**
- Click **"New query"**

**Run file 1 — Main schema (tables and indexes):**
- Open the file: `packages/database/migrations/001_initial.sql`
- Copy the **entire contents** of that file
- Paste it into the SQL editor
- Click **"Run"** (or press Ctrl+Enter)
- You should see "Success. No rows returned."

**Run file 2 — RLS policies (security rules):**
- Click **"New query"** again
- Open the file: `packages/database/rls.sql`
- Copy the entire contents
- Paste and run
- Should say "Success"

**Run file 3 — Database functions and triggers:**
- Click **"New query"** again
- Open the file: `packages/database/functions.sql`
- Copy the entire contents
- Paste and run
- Should say "Success"

**Verify it worked:**
- Click **"Table Editor"** in the left sidebar
- You should see these tables listed: `institutes`, `canteens`, `categories`, `menu_items`, `users`, `orders`, `order_items`, `qr_tokens`, `kiosks`, `kiosk_scans`, `daily_tokens`, etc.
- If you see them, the schema is set up correctly.

### Step 5 — Configure Authentication

- In the left sidebar, click **"Authentication"**
- Click **"Providers"**

**Enable Email:**
- Click "Email" in the list
- Toggle it ON
- Set:
  - "Confirm email": **ON** (users must verify their email)
  - "Secure email change": ON
- Click Save

**Enable Google OAuth (skip for now, set up in Step 5 below):**
- You'll come back to this after getting Google credentials

**Configure email templates:**
- Click **"Email Templates"**
- For "Confirm signup" template, the default is fine. You can customise later.

**Configure URL settings:**
- Click **"URL Configuration"**
- Set "Site URL": `http://localhost:3000` (for development)
- Under "Redirect URLs", add:
  ```
  http://localhost:3000/auth/callback
  http://localhost:3001/auth/callback
  ```
- Click Save
- (You'll add your production URLs here later after deploying to Vercel)

### Step 6 — Set up Storage (for images)

- In left sidebar, click **"Storage"**
- Click **"New bucket"**
- Create these 3 buckets:

**Bucket 1:**
- Name: `avatars`
- Public: **OFF** (private)
- Click Save

**Bucket 2:**
- Name: `menu-images`
- Public: **ON** (public — menu images are public)
- Click Save

**Bucket 3:**
- Name: `canteen-images`
- Public: **ON** (public)
- Click Save

---

## 4. Razorpay — Payment Gateway Setup

### Step 1 — Create account
- Go to: https://razorpay.com
- Click "Sign Up"
- Fill in your details. Use your real phone number (OTP verification).
- Complete KYC later (needed for live payments — for testing you don't need it)

### Step 2 — Get test keys
- After logging in, you land on the Dashboard
- In the left sidebar: **Settings → API Keys**
- You'll be in "Test Mode" by default (toggle at top right of dashboard)
- Click **"Generate Test Key"**
- A dialog shows:
  - **Key ID**: starts with `rzp_test_` — copy this → this is `RAZORPAY_KEY_ID`
  - **Key Secret**: copy this → this is `RAZORPAY_KEY_SECRET`
- **Save both immediately** — the secret is shown only once

### Step 3 — Set up Webhook (for payment confirmations)
- In left sidebar: **Settings → Webhooks**
- Click **"Add New Webhook"**
- Webhook URL: `https://your-student-app.vercel.app/api/v1/payments/webhook`
  - For local testing use [ngrok](https://ngrok.com) to expose localhost (free)
- Secret: make up a random string (e.g. `campusbite_webhook_secret_2024`) → save this as `RAZORPAY_WEBHOOK_SECRET`
- Check these events:
  - `payment.captured`
  - `payment.failed`
  - `refund.created`
- Click Save

---

## 5. Google OAuth Setup

### Step 1 — Go to Google Cloud Console
- Go to: https://console.cloud.google.com
- Sign in with your Google account

### Step 2 — Create a project
- Click the project dropdown at the top (next to "Google Cloud")
- Click **"New Project"**
- Name: `CampusBite`
- Click Create

### Step 3 — Enable Google Auth API
- In the search bar, type: `Google Identity`
- Click **"Google Identity Services"** → Enable it
- Also search for and enable: `Google+ API`

### Step 4 — Configure OAuth consent screen
- In left sidebar: **APIs & Services → OAuth consent screen**
- User type: **External** (so any Google account can log in)
- Click Create
- Fill in:
  - **App name**: `CampusBite`
  - **User support email**: your email
  - **Developer contact email**: your email
- Click Save and Continue
- Scopes page: click Save and Continue (defaults are fine)
- Test users: add your own Gmail for testing → Save and Continue
- Click "Back to Dashboard"

### Step 5 — Create OAuth credentials
- In left sidebar: **APIs & Services → Credentials**
- Click **"+ Create Credentials" → "OAuth client ID"**
- Application type: **Web application**
- Name: `CampusBite Web`
- Under **"Authorized redirect URIs"**, click "Add URI" and add these:
  ```
  https://your-project-ref.supabase.co/auth/v1/callback
  ```
  (Replace `your-project-ref` with your Supabase project reference — find it in Supabase Settings → General → "Reference ID")
- Click Create
- A dialog shows:
  - **Client ID** → save this as `GOOGLE_CLIENT_ID`
  - **Client Secret** → save this as `GOOGLE_CLIENT_SECRET`

### Step 6 — Add Google to Supabase Auth
- Go back to Supabase → Authentication → Providers
- Click **"Google"**
- Toggle ON
- Paste:
  - Client ID: your `GOOGLE_CLIENT_ID`
  - Client Secret: your `GOOGLE_CLIENT_SECRET`
- Click Save

---

## 6. Sentry — Error Monitoring Setup

### Step 1 — Create account
- Go to: https://sentry.io
- Sign up (free plan works fine)

### Step 2 — Create two projects (one per app)

**Project 1 — Student App:**
- Click "Create Project"
- Platform: **Next.js**
- Name: `campusbite-student`
- Copy the **DSN** shown → save as `NEXT_PUBLIC_SENTRY_DSN` for student app

**Project 2 — Admin App:**
- Create another project
- Platform: **Next.js**
- Name: `campusbite-admin`
- Copy the **DSN** → save as `NEXT_PUBLIC_SENTRY_DSN` for admin app

---

## 7. Clone & Install Project Dependencies

### Step 1 — Open terminal in project folder
- Open VS Code
- File → Open Folder → select the `CAMPUS BITE CLEAN` folder
- Open the integrated terminal (Ctrl + `)

### Step 2 — Generate your secret encryption keys

Run these commands one by one. Each generates a random secret key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this command **3 times total** and save each output:
- First output → `SECRET_ENCRYPTION_KEY`
- Second output → `KIOSK_ENCRYPTION_KEY`
- Third output → `JWT_SECRET` (if needed)

Example output looks like: `a3f8c2d1e9b4076543210fedcba987654321abcdef0123456789abcdef012345`

### Step 3 — Install all dependencies

```bash
pnpm install
```

This installs packages for both apps and the shared packages. Takes 2–5 minutes.

---

## 8. Student App — Environment Variables

### Step 1 — Create the env file
```bash
cp apps/student-app/.env.example apps/student-app/.env.local
```

### Step 2 — Open the file and fill it in

Open `apps/student-app/.env.local` in VS Code. Fill in every value:

```env
# ─── Supabase ────────────────────────────────────────────────────────────────
# Get from: Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ─── Razorpay ────────────────────────────────────────────────────────────────
# Get from: Razorpay Dashboard → Settings → API Keys
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX

# Get from: Razorpay Dashboard → Settings → Webhooks (the secret you typed)
RAZORPAY_WEBHOOK_SECRET=campusbite_webhook_secret_2024

# ─── Encryption ──────────────────────────────────────────────────────────────
# Generated in Step 7 above (32-byte hex string)
SECRET_ENCRYPTION_KEY=a3f8c2d1e9b4076543210fedcba987654321abcdef0123456789abcdef012345

# ─── App URLs ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_STUDENT_APP_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_APP_URL=http://localhost:3001

# ─── Sentry ──────────────────────────────────────────────────────────────────
# Get from: Sentry → campusbite-student project → Settings → Client Keys (DSN)
NEXT_PUBLIC_SENTRY_DSN=https://xxxxxxxxxxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXXXX
```

> ⚠️ Note: `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the **same value** as `RAZORPAY_KEY_ID` — it just needs the `NEXT_PUBLIC_` prefix so the browser can access it.

---

## 9. Admin App — Environment Variables

### Step 1 — Create the env file
```bash
cp apps/admin-app/.env.example apps/admin-app/.env.local
```

### Step 2 — Open and fill it in

Open `apps/admin-app/.env.local`:

```env
# ─── Supabase ────────────────────────────────────────────────────────────────
# SAME values as student app
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ─── Encryption ──────────────────────────────────────────────────────────────
# SAME as student app
SECRET_ENCRYPTION_KEY=a3f8c2d1e9b4076543210fedcba987654321abcdef0123456789abcdef012345

# This one is for encrypting kiosk API keys — use your SECOND generated key
KIOSK_ENCRYPTION_KEY=b4e9d3c2f0a5186754321fedcba098765432abcdef1234567890abcdef123456

# ─── App URLs ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_APP_URL=http://localhost:3001
NEXT_PUBLIC_STUDENT_APP_URL=http://localhost:3000

# ─── Sentry ──────────────────────────────────────────────────────────────────
# Get from: Sentry → campusbite-admin project (different DSN from student app)
NEXT_PUBLIC_SENTRY_DSN=https://yyyyyyyyyyyyyyyy@oXXXXXX.ingest.sentry.io/YYYYYYYY
```

---

## 10. Run Both Apps Locally

### Start development servers

In your terminal (from the project root):

```bash
pnpm dev
```

This starts:
- Student app at: **http://localhost:3000**
- Admin app at: **http://localhost:3001**

Open both in your browser to verify they load.

**Expected:**
- `localhost:3000` → Shows login page for students
- `localhost:3001` → Shows admin login page

If you see errors, go to [Section 18 — Troubleshooting](#18-troubleshooting).

---

## 11. Create Your First Super Admin User

### Step 1 — Register via the admin app login page
- Go to: http://localhost:3001
- Click "Create account" (or go to http://localhost:3001/register if available)
- Register with your email and a strong password
- Check your email inbox and click the verification link from Supabase

### Step 2 — Promote yourself to super_admin in Supabase

The user you just created has role `student` by default (the trigger sets everyone to student).
You need to manually promote yourself to `super_admin` once.

- Go to Supabase → **Table Editor** → click `users` table
- Find your row (by email)
- Click on the row to edit it
- Change `role` from `student` to `super_admin`
- Click Save

**OR use SQL Editor:**
```sql
UPDATE public.users
SET role = 'super_admin'
WHERE email = 'your@email.com';
```

### Step 3 — Log in to admin panel
- Go to: http://localhost:3001
- Log in with the same email/password
- You should now see the dashboard

---

## 12. Seed Initial Data

### Step 1 — Create an Institute

In Supabase → SQL Editor, run:

```sql
INSERT INTO institutes (name, code, city, state, country, is_active)
VALUES ('Demo College', 'DEMO001', 'Mumbai', 'Maharashtra', 'India', true);
```

### Step 2 — Create a Canteen

First get the institute ID:
```sql
SELECT id FROM institutes WHERE code = 'DEMO001';
```

Then create a canteen (replace `YOUR_INSTITUTE_ID` with the UUID from above):
```sql
INSERT INTO canteens (institute_id, name, code, location, opens_at, closes_at, is_open, is_active)
VALUES (
  'YOUR_INSTITUTE_ID',
  'Main Canteen',
  'MAIN01',
  'Ground Floor, Main Building',
  '08:00',
  '18:00',
  true,
  true
);
```

### Step 3 — Create Categories

Get your canteen ID first:
```sql
SELECT id FROM canteens WHERE code = 'MAIN01';
```

Then:
```sql
INSERT INTO categories (canteen_id, name, icon, sort_order, is_active)
VALUES
  ('YOUR_CANTEEN_ID', 'Breakfast', '🍳', 1, true),
  ('YOUR_CANTEEN_ID', 'Lunch', '🍱', 2, true),
  ('YOUR_CANTEEN_ID', 'Snacks', '🍿', 3, true),
  ('YOUR_CANTEEN_ID', 'Beverages', '☕', 4, true);
```

### Step 4 — Create Menu Items

Get a category ID:
```sql
SELECT id FROM categories WHERE name = 'Lunch' AND canteen_id = 'YOUR_CANTEEN_ID';
```

Then:
```sql
INSERT INTO menu_items (canteen_id, category_id, name, description, price_paise, is_veg, is_available, prep_time_minutes)
VALUES
  ('YOUR_CANTEEN_ID', 'YOUR_CATEGORY_ID', 'Masala Dosa', 'Crispy dosa with potato filling and chutneys', 4500, true, true, 10),
  ('YOUR_CANTEEN_ID', 'YOUR_CATEGORY_ID', 'Veg Biryani', 'Fragrant basmati rice with vegetables', 8000, true, true, 15),
  ('YOUR_CANTEEN_ID', 'YOUR_CATEGORY_ID', 'Paneer Butter Masala + Roti', 'Rich paneer curry with 2 rotis', 10000, true, true, 20),
  ('YOUR_CANTEEN_ID', 'YOUR_CATEGORY_ID', 'Egg Fried Rice', 'Wok-tossed rice with eggs', 6000, false, true, 12);
```

> Note: Prices are in **paise** (1 rupee = 100 paise). So ₹45 = 4500 paise.

### Step 5 — Set your institute on your admin user

```sql
UPDATE public.users
SET institute_id = 'YOUR_INSTITUTE_ID'
WHERE email = 'your@email.com';
```

Now go to the admin dashboard — you should see the canteen, categories and menu items.

---

## 13. Vercel — Deploy to Production

### Step 1 — Push code to GitHub
- Create a new repository at: https://github.com/new
- Name it: `campusbite`
- Keep it private
- Copy the git remote URL (looks like `https://github.com/yourname/campusbite.git`)

In your terminal:
```bash
git init
git add .
git commit -m "Initial CampusBite build"
git remote add origin https://github.com/yourname/campusbite.git
git push -u origin main
```

### Step 2 — Deploy Student App on Vercel

- Go to: https://vercel.com
- Click "Add New → Project"
- Import your GitHub repository
- Configure:
  - **Framework Preset**: Next.js
  - **Root Directory**: `apps/student-app`
  - **Build Command**: `cd ../.. && pnpm build --filter=student-app` (or leave default)
- Click **"Environment Variables"** and add ALL variables from `apps/student-app/.env.local`
  - For production: change `NEXT_PUBLIC_STUDENT_APP_URL` to your actual Vercel domain
- Click **Deploy**
- After deploy: copy the URL (e.g. `https://campusbite-student.vercel.app`)

### Step 3 — Deploy Admin App on Vercel

- Repeat the process: "Add New → Project" → same repo
- **Root Directory**: `apps/admin-app`
- Add ALL variables from `apps/admin-app/.env.local`
- Deploy
- Copy the URL (e.g. `https://campusbite-admin.vercel.app`)

### Step 4 — Update Supabase URLs for production

In Supabase → Authentication → URL Configuration:
- **Site URL**: `https://campusbite-student.vercel.app`
- **Redirect URLs** (add all of these):
  ```
  https://campusbite-student.vercel.app/auth/callback
  https://campusbite-admin.vercel.app/auth/callback
  http://localhost:3000/auth/callback
  http://localhost:3001/auth/callback
  ```

### Step 5 — Update Razorpay Webhook URL

In Razorpay → Settings → Webhooks:
- Update the URL to: `https://campusbite-student.vercel.app/api/v1/payments/webhook`

### Step 6 — Update environment variables in Vercel

In Vercel → Student App → Settings → Environment Variables:
- Update `NEXT_PUBLIC_STUDENT_APP_URL` = `https://campusbite-student.vercel.app`
- Update `NEXT_PUBLIC_ADMIN_APP_URL` = `https://campusbite-admin.vercel.app`

In Vercel → Admin App → Settings → Environment Variables:
- Update `NEXT_PUBLIC_ADMIN_APP_URL` = `https://campusbite-admin.vercel.app`
- Update `NEXT_PUBLIC_STUDENT_APP_URL` = `https://campusbite-student.vercel.app`

Redeploy both apps after changing env vars.

---

## 14. Cloudflare — DNS Setup

*(Skip this if you don't have a custom domain yet)*

### Step 1 — Add your domain to Cloudflare
- Go to: https://cloudflare.com → Dashboard → Add a Site
- Enter your domain (e.g. `campusbite.in`)
- Choose Free plan
- Cloudflare shows you nameservers → go to your domain registrar and update nameservers to the ones Cloudflare shows

### Step 2 — Add DNS records
In Cloudflare → DNS:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `@` | `cname.vercel-dns.com` | Proxied (orange) |
| CNAME | `www` | `cname.vercel-dns.com` | Proxied (orange) |
| CNAME | `admin` | `cname.vercel-dns.com` | Proxied (orange) |

### Step 3 — Add custom domain in Vercel
- Vercel → Student App → Settings → Domains → Add `campusbite.in` and `www.campusbite.in`
- Vercel → Admin App → Settings → Domains → Add `admin.campusbite.in`

---

## 15. Raspberry Pi Kiosk Setup

### Prerequisites
- Raspberry Pi 4 (1GB) with MicroSD card
- Laptop with SD card reader
- USB QR scanner + USB thermal printer (keep unplugged for now)

---

### PART A — Flash the OS

**Step 1 — Download Raspberry Pi Imager**
- Go to: https://www.raspberrypi.com/software/
- Download for Windows and install it

**Step 2 — Flash the OS to MicroSD**
- Insert your MicroSD card into your laptop
- Open Raspberry Pi Imager
- Click **"Choose Device"** → select **Raspberry Pi 4**
- Click **"Choose OS"** → **Raspberry Pi OS (other)** → **Raspberry Pi OS Lite (64-bit)**
- Click **"Choose Storage"** → select your MicroSD card

**Step 3 — Configure settings (important!)**
- Click the **gear icon** (⚙️) or "Edit Settings" before flashing
- Fill in:
  - **Hostname**: `campusbite-kiosk-01`
  - **Enable SSH**: ✅ Check this
  - **Set username and password**:
    - Username: `campusbite`
    - Password: choose a strong password
  - **Configure wireless LAN** (WiFi):
    - SSID: your canteen's WiFi name
    - Password: WiFi password
    - Country: `IN`
  - **Set locale**:
    - Timezone: `Asia/Kolkata`
    - Keyboard: `us`
- Click Save
- Click **Write** and wait for it to finish (5–10 minutes)

**Step 4 — Boot the Pi**
- Put the MicroSD card into the Pi
- Plug in power
- Wait 2 minutes for first boot

---

### PART B — Connect to the Pi via SSH

**Step 1 — Find the Pi's IP address**
- Go to your WiFi router admin page (usually `192.168.1.1` or `192.168.0.1`)
- Look for a device named `campusbite-kiosk-01`
- Note its IP address (e.g. `192.168.1.45`)

**Step 2 — SSH into the Pi**
In your PC terminal:
```bash
ssh campusbite@192.168.1.45
```
Type `yes` when asked about fingerprint. Enter the password you set.

You should now see the Pi command prompt: `campusbite@campusbite-kiosk-01:~$`

---

### PART C — Install software on the Pi

Run each command, wait for it to finish before running the next:

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install required packages
sudo apt-get install -y python3-pip python3-venv git cups libcups2-dev alsa-utils ufw

# Install printer library
sudo pip3 install python-escpos --break-system-packages

# Create the kiosk application user
sudo useradd -m -s /bin/bash kiosk
sudo usermod -aG lp,dialout,tty kiosk

# Create app directory
sudo mkdir -p /opt/campusbite-kiosk
sudo chown campusbite:campusbite /opt/campusbite-kiosk
```

---

### PART D — Copy the kiosk code to the Pi

**On your PC**, open a new terminal (not the SSH one):

```bash
# From your project root folder
scp -r kiosk/* campusbite@192.168.1.45:/opt/campusbite-kiosk/
```

Enter the Pi password when asked.

---

### PART E — Install Python packages on the Pi

Back in the SSH terminal:

```bash
cd /opt/campusbite-kiosk

# Install all Python dependencies
pip3 install -r requirements.txt --break-system-packages

# Create needed directories
mkdir -p logs db assets/sounds
```

---

### PART F — Configure the printer

**Step 1 — Connect the printer via USB**
- Plug the Xprinter XP-58IIH into a USB port on the Pi

**Step 2 — Find the printer's USB IDs**
```bash
lsusb
```

You'll see output like:
```
Bus 001 Device 003: ID 0483:5743 STMicroelectronics...
```
The `0483:5743` is `VENDOR_ID:PRODUCT_ID`. Write these down.

**Step 3 — Set USB permissions**
```bash
# Create udev rule so printer doesn't need sudo
sudo nano /etc/udev/rules.d/99-printer.rules
```

Add this line (replace the IDs with yours):
```
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5743", MODE="0666", GROUP="lp"
```

Save: Ctrl+X → Y → Enter

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

**Step 4 — Test the printer**
```bash
python3 -c "
from escpos.printer import Usb
p = Usb(0x0483, 0x5743)
p.text('CampusBite Test\n')
p.cut()
print('Print success!')
"
```

A test slip should print. If it does, printer is working.

---

### PART G — Configure the scanner

The Honeywell Voyager 1450g works in USB HID mode out of the box — it acts like a keyboard. Plug it into a USB port on the Pi. No driver needed.

**Verify it's detected:**
```bash
ls /dev/input/by-id/
```

You should see something like `usb-Honeywell_Scanning_...`

---

### PART H — Configure the kiosk app

**Step 1 — Create the config file**
```bash
cd /opt/campusbite-kiosk
cp config/kiosk.yaml.example config/kiosk.yaml
```

**Step 2 — Edit the config** (you'll fill in the kiosk ID and API key in the next section after registering in admin panel):
```bash
nano config/kiosk.yaml
```

Change these values now:
```yaml
server:
  base_url: "https://campusbite-student.vercel.app"  # your deployed student app URL

printer:
  vendor_id: "0x0483"   # replace with YOUR vendor ID from lsusb
  product_id: "0x5743"  # replace with YOUR product ID from lsusb
```

Save: Ctrl+X → Y → Enter

**Step 3 — Secure the config file**
```bash
sudo chown root:root /opt/campusbite-kiosk/config/kiosk.yaml
sudo chmod 600 /opt/campusbite-kiosk/config/kiosk.yaml
```

---

### PART I — Set up the systemd service

```bash
# Install the service
sudo cp /opt/campusbite-kiosk/systemd/campusbite-kiosk.service /etc/systemd/system/

# Enable it to start on boot
sudo systemctl daemon-reload
sudo systemctl enable campusbite-kiosk.service
```

Do NOT start it yet — you need to register the kiosk first in the next section.

---

### PART J — Set up firewall

```bash
sudo ufw default deny outgoing
sudo ufw default deny incoming
sudo ufw allow out to any port 443 proto tcp   # HTTPS
sudo ufw allow out to any port 80 proto tcp    # HTTP (for package installs)
sudo ufw allow out to any port 53 proto udp    # DNS
sudo ufw allow out to any port 123 proto udp   # NTP (time sync)
sudo ufw allow in from 192.168.0.0/16 port 22  # SSH from local network
sudo ufw --force enable
```

---

## 16. Register a Kiosk in the Admin Panel

### Step 1 — Open admin panel
- Go to your admin app (localhost:3001 or your Vercel URL)
- Log in as super_admin

### Step 2 — Register the kiosk
- In the sidebar, click **"Kiosks"**
- Click **"Add Kiosk"** button
- Fill in:
  - **Canteen**: select your canteen
  - **Name**: `Main Counter Kiosk`
  - **Location**: `Counter 1, Ground Floor`
  - **Device ID**: the Pi's MAC address (run `cat /sys/class/net/wlan0/address` on the Pi to get it)
- Click **Register**

### Step 3 — IMPORTANT: Copy the API key
- A dialog shows two values:
  - **Kiosk ID** (a UUID)
  - **API Key** (a long random string)
- **Copy both immediately** — the API key is shown ONCE and never again
- Put them somewhere safe

### Step 4 — Paste into kiosk config on the Pi

Back in the Pi SSH terminal:
```bash
sudo nano /opt/campusbite-kiosk/config/kiosk.yaml
```

Fill in:
```yaml
kiosk:
  id: "paste-the-kiosk-uuid-here"
  api_key: "paste-the-api-key-here"
  canteen_id: "paste-your-canteen-uuid-here"
  name: "Main Counter Kiosk"
```

Save: Ctrl+X → Y → Enter

### Step 5 — Start the kiosk service
```bash
sudo systemctl start campusbite-kiosk.service
```

Check it's running:
```bash
sudo systemctl status campusbite-kiosk.service
```

Should show `Active: active (running)`.

**Watch live logs:**
```bash
tail -f /opt/campusbite-kiosk/logs/kiosk.log
```

You should see startup messages and "Kiosk ready. Waiting for scan..."

---

## 17. Test the Full Flow End to End

Do these tests in order to confirm everything works.

### Test 1 — Student registration
- Go to: `localhost:3000` (or your student Vercel URL)
- Click "Create Account"
- Register a test student account
- Check email → click verification link
- Should redirect to logged-in home page

### Test 2 — Browse and order
- Browse canteens → open your canteen
- Add 2–3 items to cart
- Go to cart → Checkout
- Select payment method: UPI or test card

**Razorpay test card details:**
```
Card number: 4111 1111 1111 1111
Expiry: any future date (e.g. 12/26)
CVV: any 3 digits (e.g. 123)
Name: Test User
OTP (if asked): 1234
```

**Razorpay test UPI:**
```
UPI ID: success@razorpay
```

- Complete payment
- Should redirect to order confirmation

### Test 3 — View QR code
- Go to Orders → click the order you just placed
- Click "QR Code" tab
- Should see a QR code with 3-hour countdown timer

### Test 4 — Scan at kiosk
- On the Pi, make sure the kiosk service is running
- Open the QR code on your phone
- Hold it up to the USB scanner connected to the Pi
- Scanner reads it and sends to server
- **Expected result**: Terminal shows success, printer prints receipt

### Test 5 — Verify in admin panel
- Go to admin app → Orders
- Find your test order
- Status should now show `collected`
- Go to Kiosks → click your kiosk → Scan History
- Should show the scan with `success` result

### Test 6 — Anti-fraud (scan same QR again)
- Try scanning the same QR code again at the kiosk
- **Expected result**: Error logged, receipt NOT printed, status shows `ALREADY_USED`

---

## 18. Troubleshooting

### "pnpm install" fails
```bash
# Clear cache and retry
pnpm store prune
pnpm install
```

### Student app shows blank page / crashes
- Check terminal for errors
- Most common: missing env variable
- Verify `.env.local` has all required values
- Restart dev server after changing `.env.local`

### "Invalid API key" error from Supabase
- Double-check you copied the full anon key (it's very long, ~200 chars)
- Make sure there are no spaces before/after the value in `.env.local`

### Supabase SQL editor shows errors when running schema
- Run the 3 files **in order**: `001_initial.sql` → `rls.sql` → `functions.sql`
- If you get "relation already exists", the table was already created — safe to ignore
- If you get "permission denied" — make sure you're logged in as the project owner

### Google OAuth redirect error
- Go to Supabase → Auth → URL Configuration
- Make sure the redirect URL exactly matches what you configured in Google Cloud Console
- No trailing slashes

### Kiosk service fails to start
```bash
# See exact error
journalctl -u campusbite-kiosk.service -n 50 --no-pager
```

Common fixes:
- **Config file error**: check `kiosk.yaml` for typos
- **Printer not found**: run `lsusb` to verify IDs match config
- **API key wrong**: re-register kiosk in admin panel and get new key

### Scanner not detected by kiosk app
```bash
# List input devices
ls /dev/input/by-id/

# Check evdev sees it
python3 -c "import evdev; print([d.name for d in [evdev.InputDevice(p) for p in evdev.list_devices()]])"
```

If scanner isn't listed, unplug and replug it. Try a different USB port.

### Printer prints nothing
```bash
# Test printer directly
python3 -c "
from escpos.printer import Usb
p = Usb(0x0483, 0x5743)  # use YOUR IDs
p.text('Test\n')
p.cut()
"
```

If "No such device" error: check `vendor_id` and `product_id` in config match `lsusb` output.

### Payment webhook not received
- Use ngrok for local testing: `ngrok http 3000`
- Update Razorpay webhook URL to the ngrok URL
- Check webhook logs in Razorpay Dashboard → Webhooks → Recent deliveries

### Admin login redirects back to login
- Your user's `role` in the `users` table is not `super_admin`, `canteen_admin`, or `staff`
- Fix: run in Supabase SQL Editor:
  ```sql
  UPDATE public.users SET role = 'super_admin' WHERE email = 'your@email.com';
  ```

---

## Quick Reference — All Values You Need to Collect

Use this as your checklist. Tick each one as you get it.

| Value | Where to get it | Which env file |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | Both apps |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key | Both apps |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key | Both apps |
| `RAZORPAY_KEY_ID` | Razorpay → Settings → API Keys | Student app |
| `RAZORPAY_KEY_SECRET` | Razorpay → Settings → API Keys | Student app |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Same as RAZORPAY_KEY_ID | Student app |
| `RAZORPAY_WEBHOOK_SECRET` | The string you typed when creating webhook | Student app |
| `SECRET_ENCRYPTION_KEY` | Generated by you (node crypto command) | Both apps |
| `KIOSK_ENCRYPTION_KEY` | Generated by you (different key) | Admin app only |
| `NEXT_PUBLIC_SENTRY_DSN` (student) | Sentry → campusbite-student project | Student app |
| `NEXT_PUBLIC_SENTRY_DSN` (admin) | Sentry → campusbite-admin project | Admin app |
| Kiosk UUID | Admin panel → Kiosks → Register → shown after form | kiosk.yaml |
| Kiosk API Key | Admin panel → Kiosks → Register → shown ONCE | kiosk.yaml |
| Canteen UUID | Supabase → Table Editor → canteens table | kiosk.yaml |
| Printer Vendor ID | `lsusb` on Pi | kiosk.yaml |
| Printer Product ID | `lsusb` on Pi | kiosk.yaml |

---

*Last updated: June 2025. If anything is unclear, check the Supabase docs at docs.supabase.com or Razorpay docs at razorpay.com/docs.*
