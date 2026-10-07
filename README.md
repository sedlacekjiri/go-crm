# Go CRM

Partner CRM for **Go Car Rentals & Go Campers – Reykjavík office**. Same setup as the Froad admin:
plain HTML/CSS/JS on **Cloudflare Pages** + a free **D1** database, one password, no build step.
Push to GitHub → Cloudflare deploys it.

- **Partners**: hotels, guesthouses, OTAs, cafés · Reykjavík districts + capital region · contact people · bulk add
- **Pipeline**: New → Contacted → In talks → Accepted / Declined, plus interest Cold / Warm / Hot
- **Tasks & calendar**: Sales / Marketing tasks, multi-day tasks with deadlines, planned hotel visits
  (grouped by area), follow-ups and posts; logging a visit ticks the planned visit off automatically
- **Marketing**: content calendar for Instagram / Facebook / TikTok / Google / YouTube, idea bank,
  Google rating & reviews (Places API)
- **Front-line affiliates**: receptionists / concierges with their own code and commission (% or € per
  booking), paid only for completed, not-cancelled rentals; status Offered → Confirmed → Card given,
  printable business card with QR code, payouts and "to pay" balance
- **Visit log** with follow-up reminders (the "+ Log visit" button on the phone)
- **Sales**: import of the Caren (booking.caren.is) export, revenue by day / week / month,
  Go Car Rentals vs Go Campers, EUR ⇄ ISK (daily ECB rates), attribution by affiliate code
- **Goals**: monthly targets with an "on pace" indicator
- **Two passwords**: `ADMIN_PASSWORD` (you, can edit) and `VIEWER_PASSWORD` (owners, read-only)

## Setup on Cloudflare (once, ~10 minutes)

1. **Database** – Cloudflare dashboard → *Storage & Databases → D1* → **Create database** → name `go-crm`.
   (Tables are created automatically on first use.)
2. **Site** – *Workers & Pages → Create → Pages → Connect to Git* → choose `sedlacekjiri/go-crm`.
   - Framework preset: **None**
   - Build command: *(empty)*
   - Build output directory: **`public`**
   → **Save and Deploy**.
3. **Connect the database** – the new project → *Settings → Bindings → Add → D1 database*:
   variable name **`DB`**, database **`go-crm`** → Save.
4. **Passwords** – *Settings → Variables and Secrets → Add* (type **Secret**, environment *Production*):
   - `ADMIN_PASSWORD` – your password
   - `VIEWER_PASSWORD` – password for the owners (optional, read-only access)
   - `GOOGLE_PLACES_API_KEY` – optional, for Marketing → Google reviews (see below)
5. *Deployments* → **Retry deployment** (bindings and secrets apply to new deployments).
6. Open `https://go-crm.pages.dev` (or add a custom domain under *Custom domains*), log in.
   On the phone: Share → **Add to Home Screen**.

From now on every push to `main` redeploys automatically.

## Google reviews (optional)

Marketing → Google reviews reads the rating, review count and the newest reviews through Google's
official **Places API (New)** – about 60 requests a month, well inside the 1,000 free ones.

1. [console.cloud.google.com](https://console.cloud.google.com/) → new project (a billing account is required, nothing is charged in the free tier).
2. *APIs & Services → Library* → **Places API (New)** → Enable.
3. *Credentials → Create credentials → API key*, restrict it to Places API (New).
4. Cloudflare → *Settings → Variables and Secrets* → Secret `GOOGLE_PLACES_API_KEY`, redeploy.
5. In the CRM: Marketing → Google reviews → search your listing → Track.

Each check returns up to 5 reviews; the CRM keeps every review it has seen, so the list grows over time.

## Importing sales from Caren

1. In Caren export the bookings list for a period (CSV or Excel).
2. CRM → **Sales → Import bookings** → choose the file.
3. Check the column mapping (guessed automatically, remembered for next time). Booking number,
   created date and total price are required; *Affiliate / source* links a booking to a partner.
4. Import. Re-importing overlapping periods is safe – bookings are updated by booking number.

Set each partner's **Affiliate code** exactly as it appears in the export (case doesn't matter).
Codes that don't belong to any partner are still imported and listed under *Sales → By source*.
Amounts are converted to EUR and ISK with the ECB rate of the booking date
([frankfurter.dev](https://frankfurter.dev)). Cancelled bookings are kept but not counted.

## Files

```
public/index.html, styles.css     the page and its look
public/js/app.js                  login, navigation, router
public/js/views/*.js              Home, Partners, Partner, Tasks, Pipeline, Sales, Import, Goals
public/js/lib.js                  pure logic: import parsing, FX, analytics, goals (tested)
functions/api/*.js                the API (Cloudflare Pages Functions) – data, partners, contacts,
                                  activities, tasks, sales, goals
functions/_lib/db.js              password check, D1 tables
tests/lib.test.mjs                unit tests
```

## Local development

```bash
printf 'ADMIN_PASSWORD=dev\nVIEWER_PASSWORD=view\n' > .dev.vars
npx wrangler pages dev public --d1 DB=go-crm     # http://localhost:8788, local database
node --test tests/lib.test.mjs                   # unit tests
```
