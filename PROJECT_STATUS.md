# MessMate project status

## Assessment

The extracted starter included basic Express/Mongoose login, a single current menu, student attendance submission, reviews, complaints, and a fee demo. It had plaintext demo passwords, browser-stored bearer tokens, no manager account, and no booking, inventory, announcements, waste, duties, or purchase workflows. The synopsis matches the requested scope. The existing Node/Express/MongoDB and separate HTML/CSS/JS stack is retained.

## Implemented

- Salted `scrypt` password storage, HTTP-only SameSite session cookies, hashed server-side session tokens, logout, and server-side role checks for student, staff, manager, and admin.
- Student self-registration with 12-digit ID/password validation, automatic session sign-in, and a server-enforced student-only role; staff, manager, and admin accounts remain administrator-provisioned.
- Student complaint cards separate the status into a color-coded badge. The selected-date menu detail pairs planned dishes with local illustrative meal art and per-item food icons; the artwork is explicitly labeled illustrative. Search help text names the student-visible record types.
- Date-bounded meal bookings and cancellation with server-side configurable cutoffs; student booking status and current menu.
- Student-owned complaint history and Pending / In Progress / Resolved processing for staff, managers, and admins.
- Persisted announcements; staff/manager publishing, in-app read status and optional VAPID-backed browser push. Users explicitly opt in from each signed-in dashboard.
- Student complaint forms accept one optional JPEG/PNG/WebP photo. The browser resizes it, the server checks the image signature and size, and only the complaint owner or authorized operational roles can retrieve it.
- Recurring menus for all seven weekdays with date-specific overrides and a clear-override action; students see the resolved menu by date.
- Admin account provisioning with role filters, role updates, password resets, and session revocation for reset accounts.
- Student fee balances/status and payment history; fees can be paid through configured Razorpay or the administrator-funded demo wallet ledger. Paid transactions have owner-only print/save-as-PDF receipts with the payment basis disclosed.
- Student QR passes signed by the server, limited to today’s active booking, and expiring after 90 seconds; staff can scan with the browser camera. Scans validate signature, expiry, date, and booking; booking-checked manual check-in remains a fallback, and duplicate entries are rejected.
- Manager operations for stock items and movement history, suppliers, price-recorded purchase orders and receiving, staff assignments, and measured waste. Purchase costs have a CSV expense export. Managers can bulk-update visible duties and bulk-resolve visible complaints after confirmation. Waste shows monthly sourced CO₂e trends based only on entered factors.
- Date-specific menu scheduling, low-stock visibility, same-weekday 28-day recency-weighted demand estimates with observed check-in ratios, CSV exports for bookings/check-ins/complaints/inventory/purchase expenses/waste/admin activity/fees, setup documentation, and role demo credentials.
- Added snacks as a fourth configurable meal slot across recurring and date-specific menus, student reservations, cutoffs, check-ins, waste records, forecasts, dashboard totals, and filtered reports. Existing databases receive the sample snack menus through the v2 seed migration.
- Booking/check-in report explorer for staff, managers, and admins with date/meal/status/ID filters, primary and secondary sorting, and filtered CSV downloads. Manager lists include search/filter/sort controls; admin payment records can be searched and sorted.
- Startup migration converts existing plaintext account passwords to salted `scrypt` hashes while preserving those passwords; README includes backup/upgrade steps.
- Local MongoDB checks pass for authentication/logout, bookings/cutoffs, recurring and date-specific menu precedence/clearing, complaint handling, announcements, duplicate check-in prevention, inventory/purchase receiving, waste, duties, filtered reports/CSV exports, role denial, and legacy plaintext-password migration. Receipt authorization is verified against an isolated database. `npm audit` previously reported zero vulnerabilities after compatible transitive fixes; a fresh audit could not reach the registry in this environment.
- Added administrator-recorded student wallet credits with a running balance, student-visible ledger, and fee settlement from a sufficient demo wallet balance. This is still not stored value.
- Added admin activity reporting and CSV for successful sign-ins and authenticated write actions, role-scoped global search, in-app announcement read/unread receipts, and optional background browser push delivery.
- Updated meal demand estimates to use recent same-weekday booking volumes with recency weighting and observed check-in ratios; without attendance history the interface states its booking-only fallback.
- Added optional CO₂e estimation to waste entries. A factor and its source are both required; trend summaries and CSV include only sourced estimates and make no avoided-emissions claim.
- Added per-process request limits to registration/sign-in and payment endpoints.
- Improved narrow and tablet layouts, especially manager forms, and added scroll reveals that honor the reduced-motion preference. Browser layout checks covered 320px, 360px, 390px, 768px, 1024px, and 1440px on the landing/signup pages and all four dashboards.
- Added the PWA manifest and icons, install prompt, limited static offline shell, and a public phone QR when an HTTPS deployment URL is configured. API responses and dashboard data are never cached.
- Added Helmet security headers, HTTPS-only production cookies/HSTS and proxy trust, production database/QR-secret startup checks, optional one-time admin bootstrap, `no-store` API responses, MongoDB-aware health checks, and an allowlist for public static files. Project documents, package metadata, and server source are no longer served as static files.
- Copied the staff QR scanner library into the explicitly hosted `vendor/` folder instead of exposing `node_modules`.
- Current `npm audit` reports zero known vulnerabilities. Isolated production-mode checks verified QR generation, bootstrap admin sign-in, absence of seeded demo admin credentials, security headers, and static-file restrictions.

## Remaining scope and configuration

- **Wallet:** students can use administrator-entered demo credits to settle a fee in the MessMate ledger. There are no real stored-value funds, student self-service top-ups, transfers, or refunds.
- **Browser push:** the feature is implemented but needs a stable VAPID key pair, HTTPS or localhost, and each user's explicit browser opt-in before delivery is active.
- **Bulk management:** bulk updates cover visible duties and complaint records; other record types do not have bulk mutation controls.
- **Sustainability:** CO₂e trends use manually supplied factors and sources. The application does not choose factors or calculate avoided emissions.
- **Purchase expenses:** new purchase orders require unit prices; legacy orders created before this field was added remain blank in the expense export.

## Remaining deployment and hardware work

- Razorpay server-side verification is implemented, but a provider sandbox transaction still needs valid test credentials.
- The Render Blueprint is prepared, but a private Git remote, persistent Atlas database, production secrets, and a real HTTPS deployment are still needed to publish the site and enable its phone QR. Production use still needs a deployment-specific security review; a strict Content Security Policy is deferred until inline event handlers are refactored, and the current rate limiter uses per-process memory (configure a shared store before horizontal scaling).
- Physical handheld scanner hardware is not connected or required; the staff dashboard uses a browser camera scanner and retains manual check-in as a fallback. Camera scanning requires localhost or HTTPS and browser camera permission.

Earlier local MongoDB checks covered the existing authentication, booking, menu, complaint, announcement, attendance, inventory, waste, duties and report flows. QR check-in was exercised on an isolated in-memory database; live Razorpay payments, live Web Push, actual cloud hosting, and physical-device camera scanning remain unverified.

