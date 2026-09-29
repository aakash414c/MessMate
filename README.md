# MessMate

MessMate is a student-project web app for hostel meal planning and mess operations. It uses Node.js, Express, MongoDB/Mongoose, and the existing HTML, CSS, and JavaScript pages.

## Requirements and setup

- Node.js 18 or newer
- MongoDB running locally or a MongoDB connection string

In PowerShell, from this project directory:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open [http://localhost:3000](http://localhost:3000). The server waits for MongoDB before it starts. Never commit `.env` or production credentials.

## Environment settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/messplanner` | MongoDB connection |
| `DEMO_ACCOUNT_PASSWORD` | `MessMateDemo!2026` | Password for newly seeded demo accounts; set your own value before first database startup |
| `QR_SIGNING_SECRET` | generated for this process if empty | Set a long private value when running multiple server instances; passes expire after 90 seconds |
| `VAPID_PUBLIC_KEY` | empty | Public key for optional browser push notifications |
| `VAPID_PRIVATE_KEY` | empty | Secret VAPID key; keep it out of source control |
| `VAPID_SUBJECT` | `mailto:messmate-admin@example.com` | Contact address or HTTPS URL identifying the push application |
| `BREAKFAST_CUTOFF` | `07:30` | Local time after which today's breakfast booking cannot be changed |
| `LUNCH_CUTOFF` | `10:30` | Lunch booking cutoff |
| `SNACKS_CUTOFF` | `15:00` | Snacks booking cutoff |
| `DINNER_CUTOFF` | `17:30` | Dinner booking cutoff |
| `MESS_MONTHLY_FEE` | `2500` | Monthly student fee in INR |
| `RAZORPAY_KEY_ID` | empty | Enables Razorpay checkout when paired with the secret |
| `RAZORPAY_KEY_SECRET` | empty | Server-side Razorpay order signature verification |

Passwords are stored as salted Node.js `scrypt` hashes. Session tokens are random, stored hashed in MongoDB, and sent to the browser only in an HTTP-only, SameSite=Strict cookie. Production deployments should use HTTPS (`NODE_ENV=production` enables the Secure cookie flag).

## Demo roles

The first database startup seeds academic demo accounts. All seeded accounts use the value of `DEMO_ACCOUNT_PASSWORD` configured before first startup (the local demo default above).

| Role | Demo user ID |
| --- | --- |
| Student | `240010130009` |
| Mess Staff | `BH4256854` |
| Mess Manager | `BH4256838` |
| System Administrator | `BH4256836` |

These are demo identities only. Students can create an account with a 12-digit student ID and a password of at least 12 characters. The registration endpoint always assigns the `student` role. Staff, manager, and administrator accounts are provisioned by an administrator; public registration cannot select those roles. The academic demo checks the ID format but does not verify identity against a campus directory.

## Available flows

- **Students:** create an account from the visible homepage sign-up link, select a date to see that day's breakfast, lunch, snacks, and dinner menus, reserve or cancel meals for today and the next 14 days before configurable meal cutoffs, submit ratings and complaints with an optional resized photo, see complaint status and in-app announcement read status, and review fee/payment history and their recorded wallet balance/ledger. With VAPID configured, students can opt in to browser push alerts. Menu details use local illustrative meal artwork and per-item icons; the artwork is not a photo of that day's actual preparation. Student global search covers menu text, current announcements, their own bookings, complaints, and payment records. Wallet credits are administrator-entered demo ledger amounts; students can use a sufficient balance to settle a fee in the same ledger, but this does not transfer real money. Paid items include an owner-only printable receipt; demo and ledger receipts state that no money was transferred.
- **Mess staff:** edit date-specific menus (up to 30 days), maintain recurring menus for each weekday, publish announcements, process complaints, scan student QR passes or record manual check-ins for existing bookings, and update assigned duties. A date-specific menu overrides the recurring menu; clearing the override restores the weekly or default menu.
- **Mess managers:** use a separate dashboard to manage stock and stock movements, suppliers, price-recorded purchase orders, staff duties, announcements, complaint statuses, and measured waste weights. Optional CO₂e estimates require a staff-entered factor and source, shown in monthly trends and exports. Search/sort/filter controls are available on manager operation lists. Managers can bulk-update visible duties; complaint bulk-resolution confirms before applying changes. Legacy purchase orders without unit prices remain blank in the expense export.
- **Administrators:** review operational summaries, complaints, hostel data, fee records, and a filterable user activity report; create student/staff/manager/admin accounts; filter accounts by role; change roles; record student wallet credits; and reset passwords (which signs the target account out of existing sessions).
- **Reports and search:** role-protected booking and check-in explorers support date, meal, status, ID search, multi-column sorting, and filtered CSV downloads. Other CSV reports cover complaints, inventory, purchase expenses, waste (including entered carbon factors and derived estimates), admin activity, and (admin only) fees. The demand estimate uses recent same-weekday bookings weighted toward newer records and observed check-in ratios when available; the UI labels estimates and history coverage. Global search spans records accessible to the signed-in role. Managers can bulk-update visible duties and bulk-resolve visible complaints.

## Upgrading an existing database

1. Stop the running app and make a database backup before upgrading. With MongoDB Database Tools installed, from PowerShell run `mongodump --uri $env:MONGODB_URI --out .\messmate-backup`.
2. Install the updated dependencies with `npm install` and keep the same `MONGODB_URI` so the app uses the intended database.
3. Set a strong `DEMO_ACCOUNT_PASSWORD` before the first startup if this database needs newly seeded demo accounts. Existing plaintext passwords are converted to salted `scrypt` hashes during startup without changing their password; existing hashed passwords remain unchanged.
4. Start with `npm start` and verify login, bookings, menu schedules, and reports against the upgraded data. Keep the backup until the checks pass.

For deployment, set `NODE_ENV=production`, use HTTPS at the application or trusted reverse-proxy edge, set a private MongoDB URI and strong secrets in the host's secret manager, and restrict network access to the database. Provider payment and deployment checks still need to be run in the target environment.

### Optional browser push setup

1. Run `npm run generate-vapid-keys` once from the project directory.
2. Copy the printed public key, private key, and a real `VAPID_SUBJECT` into the local `.env` file. Keep the private key secret and use the same pair across server restarts and instances.
3. Restart the app. Signed-in users can choose **Enable alerts** and grant browser notification permission. New announcements are then delivered to subscribed devices; in-app announcements continue to work if push is not configured.

Push subscriptions are stored per signed-in account and device. Unsubscribing in the dashboard removes the server subscription and browser subscription. Push and camera features require localhost or HTTPS in supported browsers.

## Limits and data notes

- The browser-camera QR flow requires camera permission and a secure context (localhost or HTTPS). Physical scanner hardware is not required. Staff can use the booking-checked manual fallback if a camera is unavailable. QR passes expire after 90 seconds and require a current-day booking.
- Wallet balances and ledger entries are administrator-recorded credits for classroom tracking. Ledger credits can pay the monthly fee inside the demo ledger; they are not real funds. Razorpay remains optional and requires valid provider credentials.
- Activity reports record successful authenticated write actions and sign-ins, not every page view or failed request. Carbon values are estimates only for waste entries with staff-entered emission factors and named sources; there is no automatic factor database or estimated avoided emissions.
- Announcements have in-app read/unread status and optional browser push delivery when VAPID keys are configured and the user opts in. Global search is role-scoped; bulk updates cover visible complaint and duty records, not every record type. Authentication and payment routes have per-process request limits; multi-instance deployments should configure a shared limiter store.
- The seeded data is for local classroom demonstration. Production HTTPS, secrets, database network restrictions, provider credentials, and rate limiting need target-environment configuration.
- MongoDB must be available for any persisted flow; the app does not fall back to in-memory storage.
