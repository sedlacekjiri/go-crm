# Go CRM

Partner CRM for **Go Car Rentals & Go Campers – Reykjavík office**.
Track hotels, guesthouses, OTAs and cafés you visit, log every visit, and show the owners
how much revenue the partner network brings (EUR & ISK).

- **Partners**: tabs per type, Reykjavík districts + capital region, several contact people, bulk add
- **Pipeline**: New → Contacted → In talks → Accepted / Declined, plus interest Cold / Warm / Hot
- **Activity log**: visits, meetings, calls, e-mails, with next follow-up reminders
- **Sales**: import of the Caren (booking.caren.is) export (CSV / Excel), revenue by day / week / month,
  Go Car Rentals vs Go Campers, EUR ⇄ ISK with daily ECB rates, attribution by affiliate code
- **Goals**: monthly targets with an "on pace" indicator
- **Roles**: you = admin (edit), owners = viewer (read-only)
- Works on the phone (bottom navigation, "Add to Home Screen")

Stack: Next.js 16 · Supabase (Postgres + Auth) · Tailwind · Recharts. Everything runs on free tiers.

---

## Setup (once, ~15 minutes)

### 1. Supabase (database + login)

1. Create a free account at [supabase.com](https://supabase.com) → **New project** (region: *West EU (Ireland)* or *Central EU (Frankfurt)*).
2. **SQL Editor** → *New query* → paste the whole of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up"
   (only people you invite can log in).
4. **Authentication → Users → Add user → Create new user**: your e-mail + password, tick *Auto Confirm User*.
   **The first user created becomes admin**, everybody after that is a read-only viewer.
5. **Project Settings → API**: copy *Project URL* and the *anon public* key.

> On the free plan Supabase pauses a project after 7 days without any activity. Using the CRM keeps it awake;
> if it does pause, click *Restore* in the Supabase dashboard (data is kept).

### 2. Vercel (hosting)

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → import `go-crm`.
2. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
3. **Deploy**. Every push to `main` redeploys automatically.

On the phone: open the URL → Share → **Add to Home Screen**.

### 3. Owners (read-only access)

Supabase → Authentication → Users → **Add user** (or *Invite user*). They get the viewer role automatically.
To change a role: Table Editor → `app_users` → `role` = `admin` / `viewer`.

---

## Importing sales from Caren

1. In Caren export the bookings list for a period (CSV or Excel).
2. CRM → **Sales → Import bookings** → choose the file.
3. Check the column mapping (guessed automatically, remembered for next time):
   booking number, created date and total price are required; affiliate / source links the booking to a partner.
4. Import. Re-importing overlapping periods is safe – bookings are updated by booking number, never duplicated.

**Partner attribution:** set the partner's *Affiliate code* exactly as it appears in the export's affiliate column
(case doesn't matter). Bookings with codes that don't belong to any partner are still imported and shown
in *Sales → By source*; they link up as soon as you add that code to a partner.

Amounts are stored in the original currency and converted to EUR and ISK using the ECB reference rate
of the booking date ([frankfurter.dev](https://frankfurter.dev), free, no key). Cancelled bookings
(status containing "cancel") are kept but excluded from revenue.

---

## Local development

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (import parsing, FX, analytics)
```

## Project layout

```
supabase/schema.sql      database tables, roles, row-level security
src/proxy.ts             session refresh + redirect to /login
src/lib/                 types, data access, Caren import parser, FX, analytics, goals
src/components/          UI building blocks, chart, layout shell
src/app/                 pages: / (dashboard), partners, pipeline, sales, sales/import, goals, login
```
