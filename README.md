# MessMate

MessMate is a full-stack digital mess management web app built for hostel and campus meal operations. It helps students, staff, managers, and administrators handle meal bookings, complaints, announcements, payment tracking, inventory, and daily operations from a single dashboard system.

## Overview

This project is designed for a hostel mess workflow where:
- students can book meals and view menus
- staff can manage daily menus and attendance
- managers can monitor stock, waste, and supplier records
- admins can manage users, fees, reports, and activity logs

It uses Node.js, Express, MongoDB, and a browser-based frontend built with HTML, CSS, and JavaScript.

## Features

- Student meal booking and cancellation
- Daily and weekly menu management
- Attendance and check-in tracking
- Complaint submission and admin resolution flow
- Announcements and notifications
- Wallet and fee management
- Staff and manager dashboards
- Inventory and stock reporting
- Waste tracking and exports
- User activity and admin analytics
- Role-based access for students, staff, managers, and admins

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Auth/session handling: Express-based authenticated flows
- Payments: Razorpay-ready integration with demo payment flow

## Requirements

- Node.js 20.19 or newer
- MongoDB running locally or a valid MongoDB connection string

## Quick Start

From the project directory:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Then open:

```text
http://localhost:3000
```

## Environment Variables

Create a `.env` file based on `.env.example` and set values such as:

| Variable | Development default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Use `production` only on the hosted service. Production startup requires a persistent database and stable QR secret. |
| `PORT` | `3000` | Web server port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/messplanner` | MongoDB connection string; required in production. |
| `DEMO_ACCOUNT_PASSWORD` | `MessMateDemo!2026` | Local seeded-account password; demo accounts are not seeded in production. |
| `QR_SIGNING_SECRET` | Random per local process | Stable random value with at least 32 bytes in production; do not rotate casually because it invalidates active QR passes. |
| `BOOTSTRAP_ADMIN_USER_ID` | empty | Optional first production admin ID; pair with `BOOTSTRAP_ADMIN_PASSWORD`. Remove both after the initial account is created and verified. |
| `BOOTSTRAP_ADMIN_PASSWORD` | empty | One-time first-admin password (16–200 characters). Store only as a host secret. |
| `MESSMATE_PUBLIC_URL` | empty | Public HTTPS origin for the install QR on non-Render hosts. Render's service URL is detected automatically. |
| `BREAKFAST_CUTOFF` | `07:30` | Booking cutoff for breakfast |
| `LUNCH_CUTOFF` | `10:30` | Booking cutoff for lunch |
| `SNACKS_CUTOFF` | `15:00` | Booking cutoff for snacks |
| `DINNER_CUTOFF` | `17:30` | Booking cutoff for dinner |
| `MESS_MONTHLY_FEE` | `2500` | Monthly fee in INR |
| `RAZORPAY_KEY_ID` | empty | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | empty | Razorpay secret |

## Demo Accounts

In development, the app seeds demo accounts for testing. Production does not create these default accounts. Set the one-time `BOOTSTRAP_ADMIN_USER_ID` and `BOOTSTRAP_ADMIN_PASSWORD` secrets when first deploying if an administrator account is needed. Once it is created and access is verified, remove those two environment variables.

| Role | Demo User ID |
| --- | --- |
| Student | `240010130009` |
| Staff | `BH4256854` |
| Manager | `BH4256838` |
| Admin | `BH4256836` |

## Project Structure

```text
.
├── css/
├── js/
├── assets/
├── index.html
├── signup.html
├── staff-dashboard.html
├── manager-dashboard.html
├── admin-dashboard.html
├── student-dashboard.html
├── manifest.webmanifest
├── service-worker.js
├── vendor/
├── server.js
├── package.json
├── .env.example
├── README.md
└── Project Report/
```

## Running in This Environment

For local testing without a native MongoDB service, start the disposable in-memory database runner with:

```powershell
node run-memory-db.js
```

Data in that development database is lost when the runner stops. For a persistent local database, use:

```powershell
npm install
npm start
```

## Notes

- **PWA / QR:** the app has a web manifest, app icons, install prompt, a limited offline shell, and a public-site QR endpoint. The QR is enabled only when the host has an HTTPS URL (`RENDER_EXTERNAL_URL` on Render or `MESSMATE_PUBLIC_URL` elsewhere). Dashboard data and API responses are never cached; bookings and check-ins still need a live connection.
- **Render + MongoDB Atlas deployment:** push the project to a private Git repository, create an Atlas database user with access to a dedicated `messmate` database, and restrict Atlas network access to the hosting service's allowed outbound addresses. In Render, create a Blueprint from `render.yaml`, provide the `MONGODB_URI` and a one-time bootstrap admin ID/password, then deploy. Render generates the stable QR signing key. Remove the bootstrap secrets after verifying first sign-in. Set `MESSMATE_PUBLIC_URL` only when using a custom domain or a host other than Render. See [Render's Node/Express deployment guide](https://render.com/docs/deploy-node-express-app), [Render environment-variable guidance](https://render.com/docs/configure-environment-variables), and [MongoDB Atlas connection setup](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
- **Security:** Helmet supplies common security headers, production uses HTTPS-only cookies and HSTS, JSON input is size-limited, API responses are `no-store`, `/api/health` checks MongoDB readiness, and static hosting is limited to public pages plus the `assets`, `css`, `js`, and `vendor` folders. `npm audit` reports the dependency tree at zero known vulnerabilities at the last check. A strict Content Security Policy is not enabled yet because existing pages use inline event handlers; refactor those handlers before adding CSP. The rate limiter uses per-process memory, so configure a shared store before running multiple service instances.
- **Deployment cost:** the included Render Blueprint uses the Free plan for a low-cost academic demo; check Render's current plan limits before relying on it for continuous availability.
- The project is intended for academic and classroom demonstration use.
- MongoDB must be available for persistent data operations.

## License

This project is provided for academic and educational purposes.

## Author

MessMate project repository.
