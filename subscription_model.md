---
  Part 1 — The pricing (my recommendation)

  Your ₹2,500/month intuition is close, but a flat per-institute price breaks down: a 1-canteen college and a 6-canteen university can't pay the
  same. The right move is to price on the two things that actually drive your cost and their value: canteens and students.

  Core model: per-canteen base + student tier

  ₹2,000 / canteen / month, plus a per-institute student add-on:

  ┌─────────────────┬────────────────┐
  │ Active students │ Add-on / month │
  ├─────────────────┼────────────────┤
  │ up to 1,000     │ included       │
  ├─────────────────┼────────────────┤
  │ 1,001 – 5,000   │ + ₹1,500       │
  ├─────────────────┼────────────────┤
  │ 5,001 – 15,000  │ + ₹4,000       │
  ├─────────────────┼────────────────┤
  │ 15,000+         │ + ₹8,000       │
  └─────────────────┴────────────────┘

  Wrapped into sellable tiers (easier on a pricing page)

  ┌────────────┬───────────┬─────────────┬────────────────┐
  │    Plan    │ Canteens  │  Students   │    Price/mo    │
  ├────────────┼───────────┼─────────────┼────────────────┤
  │ Free Trial │ 1         │ up to 1,000 │ ₹0 for 30 days │
  ├────────────┼───────────┼─────────────┼────────────────┤
  │ Starter    │ 1         │ ≤ 1,000     │ ₹2,000         │
  ├────────────┼───────────┼─────────────┼────────────────┤
  │ Growth     │ up to 3   │ ≤ 5,000     │ ₹7,500         │
  ├────────────┼───────────┼─────────────┼────────────────┤
  │ Campus     │ up to 6   │ ≤ 15,000    │ ₹16,000        │
  ├────────────┼───────────┼─────────────┼────────────────┤
  │ Enterprise │ unlimited │ unlimited   │ Custom         │
  └────────────┴───────────┴─────────────┴────────────────┘

  Billing cycles (your discounts)

  ┌──────────┬──────────┬──────────────────────────────────┐
  │  Cycle   │ Discount │      Why it's good for you       │
  ├──────────┼──────────┼──────────────────────────────────┤
  │ Monthly  │ —        │ Easy entry                       │
  ├──────────┼──────────┼──────────────────────────────────┤
  │ 6 months │ 10% off  │ Half-year of locked cash         │
  ├──────────┼──────────┼──────────────────────────────────┤
  │ Annual   │ 15% off  │ Full-year retention, kills churn │
  └──────────┴──────────┴──────────────────────────────────┘

  Example: Growth annual = ₹7,500 × 12 × 0.85 = ₹76,500/yr paid upfront.

  Why these numbers work (the entrepreneur logic)

  - A canteen doing ~200 orders/day at ₹50 avg = ~₹2.6L GMV/month. Charging ₹2,000 is <1% of their revenue — an easy "yes," while giving you
  healthy margin and MRR that grows as they add canteens/students.
  - 30-day free trial, no card — non-negotiable for B2B in a price-sensitive market. It gets the kiosk + app in front of students; once they're
  used to skipping the queue, you have leverage.
  - Add 18% GST on top and issue GST invoices — you're selling B2B SaaS in India, institutes will need the input credit.

  The bigger money (optional, strongly recommended later)

  A ₹2–3 "convenience fee" per order, charged to the student at checkout (Zomato/Paytm do exactly this). A campus doing 1,000 orders/day =
  ₹60k–90k/month per campus — that dwarfs the subscription and scales with usage, without touching the institute's budget. Keep the subscription
  as your predictable floor; the per-order fee is your upside. I'd ship subscriptions first, add this in a later phase.

  ---
  Part 2 — How it runs inside your system

  New data (Supabase)

  - subscription_plans — the catalog (price, included canteens/students, features).
  - institute_subscriptions — per institute: plan, cycle, canteen/student counts, discount, status (trialing / active / past_due / expired /
  cancelled), current_period_start/end, Razorpay refs.
  - subscription_invoices — every charge, for receipts/history.
  - institutes gets a cached is_active_subscriber flag.

  Payment (reuse what you already built)

  - Phase 1 — prepaid period: institute admin picks plan + cycle → Razorpay order for that amount → pays → on verify, subscription goes active,
  period_end = now + cycle. Renewal = same flow. This reuses your exact existing Razorpay verify pattern (service-client write, signature
  check).
  - Phase 2 — auto-recurring: Razorpay Subscriptions + UPI Autopay so it charges automatically each cycle. More setup (mandates); add once you
  have paying institutes.

  Enforcement (the "take it or leave it" layer)

  - Student app: the institute/canteen listing only shows is_active_subscriber = true. Expired institute → its canteens vanish from the app, new
  orders blocked (server-checked). Already-paid orders stay collectible so no student is stranded.
  - Kiosk: keeps working; if the institute lapses, new orders stop but pickup of paid orders continues.

  Lifecycle automation (a daily cron)

  - Trial ending T-3 → notify. Period end + unpaid → past_due (grace 5 days) → expired → unlist.
  - Renewal reminders at T-7 / T-3 / T-0. Runs on a Vercel Cron or Supabase scheduled function.

  Dashboards

  - Super-admin (you): all institutes + status, MRR/ARR, next renewals, churn; create/edit plans; manually create, comp, extend, discount, or
  suspend any institute; refunds.
  - Institute admin: "Billing" page — current plan, usage vs limits, invoices/receipts, Pay / Renew / Upgrade, change cycle; warning banners.
  - Student app: nothing new for students — they just see active canteens.

  ---
  Part 3 — Build roadmap (ship value early)

  1. Schema + plan catalog + super-admin manual subscriptions + student-app gating. → You can onboard and charge institutes manually and the app
  already hides non-payers. This alone lets you start selling.
  2. Institute self-serve billing page + Razorpay prepaid checkout + invoices.
  3. Lifecycle automation (reminders, auto-expire, grace).
  4. Auto-recurring (Razorpay Subscriptions + UPI Autopay).
  5. Revenue analytics + proration + upgrades/downgrades.
  6. (Optional) student convenience fee.

  ---
  Part 4 — Three quick decisions, then I build

  Before I start Phase 1, I want your call on:

● User declined to answer questions
  ⎿  · Pricing model — go with my per-canteen + student-tier recommendation, or your flat ₹2,500/institute? (Per-canteen + student tiers
     (recommended) / Flat ₹2,500/institute + per-canteen add-on / Let me tweak the numbers)
     · How should institutes pay, to start? (Prepaid period (recommended first) / Auto-recurring from day one)
     · What should I build first? (Phase 1 only (recommended) / Phases 1 + 2 together / Just the plan for now)
  ⎿  Interrupted · What should Claude do instead?

❯ ask the questions again

● Re-asking now.

● User answered Claude's questions:
  ⎿  · Confirm the pricing model (you picked per-canteen + student tiers — I'll document it in full detail when building): → Per-canteen +
     student tiers
     · How should institutes pay, to start? → Prepaid period (recommended first)
     · What should I build first? → Just the plan for now

● Here's the complete plan — pricing and system — documented in detail. No code yet; this is the blueprint we'll build from when you say go.

  ---
  MunchAdda — Institute Subscription System (Design Doc)

  1. Pricing model (full detail)

  The value metric

  You charge on the two things that scale your cost and the institute's value: canteens (each = a kiosk, menu, staff seats, support) and
  students (load + reach). Flat pricing would undercharge big universities and overcharge small colleges — this fixes that.

  The formula

  Monthly price = (₹2,000 × number of canteens) + student-tier add-on

  Student tiers (counted automatically as the number of registered student accounts under the institute):

  ┌─────────────────────┬────────────────┐
  │ Registered students │ Add-on / month │
  ├─────────────────────┼────────────────┤
  │ up to 1,000         │ included (₹0)  │
  ├─────────────────────┼────────────────┤
  │ 1,001 – 5,000       │ + ₹1,500       │
  ├─────────────────────┼────────────────┤
  │ 5,001 – 15,000      │ + ₹4,000       │
  ├─────────────────────┼────────────────┤
  │ 15,000 +            │ + ₹8,000       │
  └─────────────────────┴────────────────┘

  ▎ How "students" is measured: automatically = count of student accounts with that institute_id. No self-declaration, no gaming. The tier is
  ▎ locked at the start of each billing cycle — if the student count crosses a band mid-cycle, no surprise charge; it re-tiers at the next
  ▎ renewal. Institute-friendly and predictable.

  Sellable tiers (the pricing-page view)

  These are just the formula pre-computed into named plans:

  ┌────────────┬───────────┬───────────┬────────────────┐
  │    Plan    │ Canteens  │ Students  │ List price/mo  │
  ├────────────┼───────────┼───────────┼────────────────┤
  │ Free Trial │ 1         │ ≤ 1,000   │ ₹0 for 30 days │
  ├────────────┼───────────┼───────────┼────────────────┤
  │ Starter    │ 1         │ ≤ 1,000   │ ₹2,000         │
  ├────────────┼───────────┼───────────┼────────────────┤
  │ Growth     │ up to 3   │ ≤ 5,000   │ ₹7,500         │
  ├────────────┼───────────┼───────────┼────────────────┤
  │ Campus     │ up to 6   │ ≤ 15,000  │ ₹16,000        │
  ├────────────┼───────────┼───────────┼────────────────┤
  │ Enterprise │ unlimited │ unlimited │ Custom quote   │
  └────────────┴───────────┴───────────┴────────────────┘

  Billing cycles & discounts (your structure, exact math)

  ┌──────────┬──────────┬──────────────────┐
  │  Cycle   │ Discount │     Charged      │
  ├──────────┼──────────┼──────────────────┤
  │ Monthly  │ —        │ list price       │
  ├──────────┼──────────┼──────────────────┤
  │ 6 months │ 10% off  │ list × 6 × 0.90  │
  ├──────────┼──────────┼──────────────────┤
  │ Annual   │ 15% off  │ list × 12 × 0.85 │
  └──────────┴──────────┴──────────────────┘

  GST

  Add 18% GST on top of every charge and issue a GST invoice (institutes need the input-tax credit — it's a selling point, not a cost to you).

  Worked examples (all figures before GST)

  ┌──────────────────┬──────────────────────────────┬─────────┬───────────────┬──────────────┐
  │    Institute     │            Config            │ Monthly │ 6-month (10%) │ Annual (15%) │
  ├──────────────────┼──────────────────────────────┼─────────┼───────────────┼──────────────┤
  │ Small college    │ 1 canteen, 800 students      │ ₹2,000  │ ₹10,800       │ ₹20,400      │
  ├──────────────────┼──────────────────────────────┼─────────┼───────────────┼──────────────┤
  │ Mid college      │ 3 canteens, 4,000 students   │ ₹7,500  │ ₹40,500       │ ₹76,500      │
  ├──────────────────┼──────────────────────────────┼─────────┼───────────────┼──────────────┤
  │ Large university │ 6 canteens, 12,000 students  │ ₹16,000 │ ₹86,400       │ ₹163,200     │
  ├──────────────────┼──────────────────────────────┼─────────┼───────────────┼──────────────┤
  │ Multi-campus     │ 10 canteens, 25,000 students │ ₹28,000 │ ₹151,200      │ ₹285,600     │
  └──────────────────┴──────────────────────────────┴─────────┴───────────────┴──────────────┘

  (Large university math: 6×2,000 + 4,000 = ₹16,000/mo.)

  Why it's priced right (entrepreneur logic)

  A single canteen doing ~200 orders/day × ₹50 ≈ ₹2.6L GMV/month. Your ₹2,000 is under 1% of their canteen revenue — a trivial "yes" — while
  your MRR grows automatically as they add canteens and students. You capture more from big accounts without scaring off small ones.

  Mid-cycle changes (overage rules)

  - Adds a canteen mid-cycle → prorate the ₹2,000 for the days remaining, charge immediately (it's a deliberate upgrade).
  - Student count crosses a band → no mid-cycle charge; applies at renewal.
  - Removes a canteen → takes effect next cycle (no refund mid-cycle).

  Future upside (not now)

  A ₹2–3/order student convenience fee (Zomato/Paytm style) — on 1,000 orders/day that's ₹60k–90k/month per campus, dwarfing the subscription,
  billed to students not institutes. Keep subscription as your floor; add this in a later phase for scale revenue.

  ---
  2. Billing flow — prepaid period (your choice)

  1. Institute admin opens Billing → picks plan + cycle.
  2. System computes amount (formula + discount + GST) → creates a Razorpay order (reuses your existing payment + signature-verify code).
  3. On successful payment → subscription becomes active, current_period_end = now + cycle, an invoice/receipt is generated.
  4. Renewal: before period_end, admin clicks Renew → same flow. Reminders nudge them (Section 5).
  5. Grace: if not renewed by period_end, a 5-day grace (past_due) keeps them live; after that → expired and the institute is unlisted.

  (Auto-recurring via UPI Autopay is a later phase; prepaid ships fastest and reuses what you have.)

  ---
  3. Subscription lifecycle (states)

  trialing ──(pay)──► active ──(period ends, unpaid)──► past_due ──(grace ends)──► expired
     │                   │                                                            │
  (trial ends, unpaid)   └──(admin cancels)──► cancelled ◄────────(renew)────────────┘
     ▼
  expired

  ┌──────────────────┬────────────────────────┬─────────────┬────────────────────────┐
  │      Status      │ Listed in student app? │ New orders? │ Pickup of paid orders? │
  ├──────────────────┼────────────────────────┼─────────────┼────────────────────────┤
  │ trialing         │ ✅                     │ ✅          │ ✅                     │
  ├──────────────────┼────────────────────────┼─────────────┼────────────────────────┤
  │ active           │ ✅                     │ ✅          │ ✅                     │
  ├──────────────────┼────────────────────────┼─────────────┼────────────────────────┤
  │ past_due (grace) │ ✅ (with admin banner) │ ✅          │ ✅                     │
  ├──────────────────┼────────────────────────┼─────────────┼────────────────────────┤
  │ expired          │ ❌ hidden              │ ❌ blocked  │ ✅ still allowed       │
  ├──────────────────┼────────────────────────┼─────────────┼────────────────────────┤
  │ cancelled        │ ❌                     │ ❌          │ ✅                     │
  └──────────────────┴────────────────────────┴─────────────┴────────────────────────┘

  ▎ Key rule: a lapsed institute disappears from the student app and can't take new orders, but already-paid orders remain collectible — no
  ▎ student is ever stranded.

  ---
  4. Data model (what we'll add to Supabase)

  - subscription_plans — catalog: code, name, base price/canteen, student-tier pricing (jsonb), included limits, features.
  - institute_subscriptions — institute_id, plan_id, billing_cycle, canteens_count, student_band, base_amount, discount_pct, gst, final_amount,
  status, trial_ends_at, current_period_start/end, auto_renew, razorpay refs.
  - subscription_invoices — per charge: amount, period, status, razorpay_payment_id, GST breakdown, paid_at (for receipts/history).
  - institutes gains a cached is_active_subscriber boolean (fast gating).

  All writes go through the service-role client with RLS so only super_admin (and the institute's own admin, read-only) can touch subscription
  rows — same security pattern we used for payments.

  ---
  5. Enforcement & automation

  Gating points (where active-subscription is checked):
  - Student app canteen/institute listing API → is_active_subscriber = true only.
  - New-order creation → server rejects if institute not active.
  - Kiosk → unaffected for pickups; new orders already blocked upstream.

  Daily cron (Vercel Cron or Supabase scheduled function):
  - Trial ending T-3 → notify.
  - Period ended → past_due; grace ended → expired + flip is_active_subscriber=false.
  - Renewal reminders at T-7 / T-3 / T-0 (email/notification).

  ---
  6. Dashboards

  Super-admin (you):
  - All institutes with status, plan, MRR / ARR, next renewal, churn.
  - Manage the plan catalog.
  - Per institute: create/comp/extend/discount/suspend/refund; manual "mark as paid" for offline payments.
  - Revenue analytics by plan/cycle.

  Institute admin:
  - Billing page: current plan, usage vs limits (canteens/students), invoices + GST receipts, Pay / Renew / Upgrade, change cycle.
  - Banner warnings (trial ending, past due, renew now).

  Student app: no change for students — they simply see only active canteens.

  ---
  7. Build roadmap (when you're ready)

  ┌───────┬────────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────┐
  │ Phase │                                Delivers                                │                     Why this order                     │
  ├───────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
  │ 1     │ Schema + plan catalog + super-admin manual subscriptions + student-app │ You can onboard & charge institutes immediately,       │
  │       │  gating                                                                │ managed by you                                         │
  ├───────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
  │ 2     │ Institute self-serve Billing page + Razorpay prepaid checkout +        │ Removes you from the loop                              │
  │       │ invoices/receipts                                                      │                                                        │
  ├───────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
  │ 3     │ Lifecycle automation (reminders, auto-expire, grace)                   │ Hands-off renewals                                     │
  ├───────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
  │ 4     │ Auto-recurring (Razorpay Subscriptions + UPI Autopay)                  │ Reduces churn                                          │
  ├───────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
  │ 5     │ Revenue analytics, proration, upgrades/downgrades                      │ Scale & insight                                        │
  ├───────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
  │ 6     │ (optional) student convenience fee                                     │ Big usage-based upside                                 │
  └───────┴────────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────┘

  ---
  8. A few numbers/policies for you to lock before we build

  1. Trial length — 30 days (recommended) or other?
  2. Grace period — 5 days (recommended) before unlisting?
  3. Annual upfront only, or allow annual in installments? (Recommend upfront — that's the point of the 15% discount.)
  4. Setup/onboarding fee — ₹0 to win early institutes (recommended) or a one-time fee?
  5. Final price points — keep my numbers or adjust any tier?