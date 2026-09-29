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

- Node.js 18 or newer
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

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Web server port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/messplanner` | MongoDB connection string |
| `DEMO_ACCOUNT_PASSWORD` | `MessMateDemo!2026` | Demo account password |
| `BREAKFAST_CUTOFF` | `07:30` | Booking cutoff for breakfast |
| `LUNCH_CUTOFF` | `10:30` | Booking cutoff for lunch |
| `SNACKS_CUTOFF` | `15:00` | Booking cutoff for snacks |
| `DINNER_CUTOFF` | `17:30` | Booking cutoff for dinner |
| `MESS_MONTHLY_FEE` | `2500` | Monthly fee in INR |
| `RAZORPAY_KEY_ID` | empty | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | empty | Razorpay secret |

## Demo Accounts

On first startup, the app seeds demo accounts for testing.

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
├── server.js
├── package.json
├── .env.example
├── README.md
└── Project Report/
```

## Running in This Environment

This workspace uses an in-memory MongoDB fallback for local testing when a native MongoDB service is not installed. For a normal local install, use:

```powershell
npm install
npm start
```

## Notes

- Production deployments should use HTTPS and secure environment variables.
- The project is intended for academic and classroom demonstration use.
- MongoDB must be available for persistent data operations.

## License

This project is provided for academic and educational purposes.

## Author

MessMate project repository.
