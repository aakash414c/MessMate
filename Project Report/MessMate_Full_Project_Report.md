# MessMate Digital Mess Management System
## Full Project Report

**Department of Computer Science and Engineering**  
**Chitkara University, Himachal Pradesh**  
**Bachelor of Engineering in Computer Science and Engineering**

**Project team**  
Aakash Rana — 2311981005  
Aditya Antwal — 2311981035  
Anubhav — 2311981098  

Project guide: as listed in the academic submission  
Academic year: 2026

# Acknowledgement
We thank Chitkara University, Himachal Pradesh, and the Department of Computer Science and Engineering for the academic environment and resources that supported MessMate. We are grateful to our faculty mentors and project guide for their direction and feedback. We also acknowledge the coordinated contributions of Aakash Rana, Aditya Antwal and Anubhav in planning, implementing and documenting the system.

# Abstract
MessMate is a web-based platform for coordinating student meal planning and the daily work of an institutional mess. It brings menus, date-bounded bookings, attendance records, feedback, complaint tracking, inventory, supplier and purchase records, waste logging, staff duties, fee records and operational reports into one role-based application. Separate dashboards serve students, staff, managers and administrators. The browser interface uses HTML, CSS and JavaScript; the server uses Node.js and Express; MongoDB with Mongoose stores application records.

This report documents the problem, objectives, requirements, architecture, workflows, implementation, verification evidence and deployment considerations. The delivered prototype includes expiring, server-signed meal passes that staff can scan with a browser camera, with booking-checked manual check-in as a fallback. Administrator-recorded wallet credits can settle fees inside the demo ledger but are not stored value. Announcements support in-app read status and optional browser push; push delivery requires VAPID configuration and user opt-in. Waste estimates use staff-entered emission factors and sources. Production configuration and target-environment verification remain necessary before institutional use.

# Contents
1. Introduction  
2. Background and Related Approaches  
3. Feasibility and Requirements  
4. Development Method and Project Scope  
5. System Design  
6. Functional Modules  
7. Implementation  
8. Verification and Results  
9. Deployment and User Guide  
10. Limitations and Future Work  
11. Conclusion  
References  
Appendix A. Codebase and Configuration

# 1. Introduction
## 1.1 Project overview
University mess operations coordinate students, kitchen staff, managers and administrators across multiple meal periods. When bookings, stock counts, check-ins, complaints and fee records are kept in separate registers or tools, teams have limited shared visibility. MessMate provides a common digital workspace for these records and workflows.

## 1.2 Problem statement
Manual processes make it difficult to estimate meal demand, keep inventory records current, resolve complaints transparently and reconcile payments or attendance. Paper workflows also add administrative effort. A unified application can make operational information easier to record and review, and allow kitchen teams to use booking and attendance history as planning signals.

## 1.3 Aim and objectives
- Provide a centralized web application for student dining and mess operations.
- Give each of four user roles a dashboard and permissions suited to its duties.
- Let students view menus and reserve or cancel meals before configured cutoffs.
- Support staff check-ins tied to active bookings and prevent duplicates.
- Track stock, suppliers, purchasing, staff duties, complaints and measured waste.
- Provide scoped search, operational summaries and downloadable CSV reports.
- Use booking and observed attendance history for a transparent demand estimate.
- Record account, session and write activity using server-enforced access controls.

## 1.4 Scope and users
The project covers a classroom demonstration of campus mess administration. Students manage meal choices and see their records. Staff maintain menus, notices, check-ins and duties. Managers maintain operations and review reports. Administrators provision access and review account and activity records. Responsive browser layouts support desktop and mobile screens.

| Role | Primary use |
|---|---|
| Student | View all four meal menus; book or cancel meals; show a signed QR pass; read notices; submit ratings and complaints with an optional photo; review fee history and wallet ledger credits. |
| Mess Staff | Maintain menus and notices; scan signed QR passes or enter booking-checked attendance; update duties; process complaints within permissions. |
| Mess Manager | Manage stock and movements, suppliers, purchase orders, duties, complaints and waste; review forecasts and reports. |
| System Administrator | Create and manage accounts and roles; reset passwords; review activity, fee records and operational summaries. |

# 2. Background and Related Approaches
The supplied synopsis and mid-term report describe manual paper ledgers, standalone desktop tools and entry-focused QR/RFID systems. Each addresses only part of dining operations. MessMate combines student bookings and feedback with staff operations, inventory, management reports and administration.

| Area | Manual or isolated approach | MessMate capability |
|---|---|---|
| Meal planning | Fixed menus and estimated headcounts | Date-based bookings, cutoff rules and history-informed demand estimate |
| Attendance | Paper entry register | Signed QR camera scan or booking-checked manual check-in, with duplicate prevention |
| Feedback | Suggestion box or external forms | Ratings and complaint tickets with status tracking |
| Inventory | Paper or spreadsheet stock log | Stock movements, suppliers, purchase orders and low-stock visibility |
| Waste | Often not recorded consistently | Measured waste entries, trends and optional sourced CO2e estimates |
| Reporting | Manual collation | Role-scoped explorers and CSV exports |

The project contribution is operational integration rather than one isolated feature. Bookings can inform demand estimates; check-ins provide observed attendance; managers can compare demand, inventory and measured waste. These links support planning but do not guarantee reductions in waste or cost.

# 3. Feasibility and Requirements
## 3.1 Feasibility
**Operational:** Workflows follow campus roles. Students manage meal choices and records; staff update service records; managers maintain operations; administrators provision access. Staff can scan short-lived signed meal passes with a browser camera; booking-checked manual check-in remains a fallback.

**Technical:** The application uses Node.js, Express, Mongoose, MongoDB and modular HTML, CSS and JavaScript. REST-style JSON endpoints separate browser interaction from server persistence and authorization. Node.js 20.19+ and a reachable MongoDB instance are required.

**Economic and environmental:** A digital workflow may reduce paper logs and manual aggregation. Booking and inventory records can help plan meal quantities and purchasing. Benefits have not been quantified in a controlled deployment and are not guaranteed outcomes.

## 3.2 Functional requirements
| ID | Requirement | Current behavior |
|---|---|---|
| FR1 | Authentication | User ID and password sign-in; salted scrypt password storage; server-side sessions in HTTP-only cookies. |
| FR2 | Role authorization | Server checks student, staff, manager and admin permissions on protected routes. |
| FR3 | Menu control | Staff manage recurring weekday menus and date-specific overrides for breakfast, lunch, snacks and dinner. |
| FR4 | Meal booking | Students reserve or cancel within the supported date window and before server-enforced cutoffs. |
| FR5 | Attendance | Staff scan a signed, short-lived QR pass or use the manual fallback; the server requires a current active booking and blocks duplicates. |
| FR6 | Feedback | Students submit ratings and complaints with an optional image; authorized roles update complaint status. |
| FR7 | Inventory | Managers track stock, suppliers, purchase orders and received quantities; low stock is surfaced. |
| FR8 | Waste and sustainability | Managers record waste; CO2e requires an entered factor and source. |
| FR9 | Financial records | Students view fee history and wallet ledger; sufficient administrator-recorded demo credits can settle a fee; Razorpay is optional. |
| FR10 | Reports and search | Role-scoped search, filters and CSV exports are available for supported records. |
| FR11 | Notices and duties | Staff or managers publish in-app notices and maintain duties; opt-in browser push is available with VAPID configuration. |
| FR12 | Administration | Admins provision accounts, assign roles, reset passwords and review activity. |

## 3.3 Non-functional requirements
| Quality | Requirement / implementation note |
|---|---|
| Security | Salted scrypt password hashes; hashed session tokens in storage; HTTP-only, SameSite=Strict cookies; request limits on auth and payment routes. |
| Authorization | Protected operations enforce roles on the server; public registration always creates a student account. |
| Usability | Role dashboards and layouts adapt to desktop, tablet and mobile widths. |
| Maintainability | Pages, stylesheets and client controllers are split by role and concern. |
| Reliability | Persistent flows require MongoDB; there is no in-memory fallback. |
| Privacy | Search and reports are role-scoped; activity logs cover successful sign-ins and authenticated writes. |
| Deployment | Production requires HTTPS, managed secrets, database network controls and environment review. |

# 4. Development Method and Project Scope
## 4.1 Method
Project planning follows an Agile sequence: requirements and architecture; backend and authentication; core interface and workflows; analytics; integration and deployment preparation. The source package contains a more complete application than the original progress slides. Production deployment remains environment-dependent.

| Phase | Emphasis | Current project outcome |
|---|---|---|
| 1 | Requirements and architecture | Four role workspaces and operational modules. |
| 2 | Backend and authentication | Express API, Mongo records, session handling and role checks. |
| 3 | Core workflows | Menus, bookings, check-ins, inventory, suppliers and duties. |
| 4 | Reporting and search | Demand estimate, waste summaries, scoped search and CSV downloads. |
| 5 | Integration and deployment | Setup and upgrade guidance; production and hardware checks remain. |

## 4.2 Implementation status
The supplied PROJECT_STATUS.md records implementation across principal workflows and local checks for backend behavior. Those checks are source-reported project evidence, not fresh execution while preparing this report.

| Module group | Current status |
|---|---|
| Authentication and administration | Implemented; role access, student signup and admin account controls. |
| Menus and meal bookings | Implemented; recurring menus, date overrides, date window and configurable cutoffs. |
| Attendance | Signed expiring QR camera scans and booking-checked manual fallback; camera workflow still needs end-to-end verification. |
| Feedback, complaints and notices | Implemented; complaint lifecycle, optional photo attachments, in-app read tracking and optional VAPID-backed push. |
| Inventory, purchasing and duties | Implemented for manager workflows. |
| Waste, forecasting, reports and search | Implemented with recorded-data limits and CSV exports. |
| Wallet and fees | Fee history, receipts and demo-ledger fee settlement from administrator-recorded credits; no stored value. |
| Production deployment and hardware | Core app runs locally; production secrets, HTTPS, shared rate limiting, provider services and target-device camera flow remain to be configured or verified. |

# 5. System Design
## 5.1 Architecture
The browser presents static HTML and loads modular JavaScript controllers. Controllers call the Express server through JSON endpoints. Express authenticates the session, checks the user role and applies workflow rules before accessing MongoDB records through Mongoose. Reports use records available to the signed-in role.

| Layer | Components | Responsibility |
|---|---|---|
| Presentation | Public pages, role dashboards, CSS and browser JS | Navigation, forms, dashboards, tables, search and responsive layout. |
| Application/API | Node.js and Express in server.js | Routing, input validation, authentication, authorization, rules and report responses. |
| Persistence | MongoDB through Mongoose | Accounts, sessions, bookings, menus, attendance, complaints, inventory and operations. |
| External service | Optional Razorpay and browser push | Razorpay verification requires provider credentials; browser push requires VAPID keys and user opt-in. |

## 5.2 Data flow by role
| Actor | Input | Platform response |
|---|---|---|
| Student | Credentials, bookings, ratings, photo complaints, selected date and QR request | Menus, booking status, signed meal pass, notices, complaint state and own financial records. |
| Mess staff | Menu changes, notices, QR scans or manual check-ins, duty updates | Validation feedback and saved service records. |
| Manager | Stock, suppliers, purchases, complaint decisions, waste | Low-stock visibility, estimates, operational summaries and exports. |
| Administrator | Account and role changes, wallet credits, password resets | Updated access, fee/account views and activity reports. |

## 5.3 Booking and attendance workflow
1. A student selects a service date and meal slot and requests a booking or cancellation.
2. The server checks date range, ownership and cutoff before saving the status.
3. For today's active booking, the student displays a signed QR pass and staff scan it with the dashboard camera; staff can use the booking-checked manual fallback.
4. The server verifies the signature, expiry, service date and active booking, then rejects duplicate check-ins.
5. Reports and demand summaries use bookings and, where available, observed check-in ratios.

> **Attendance boundary:** A browser-camera scanner is implemented for signed, short-lived passes. It requires camera permission and a secure context such as localhost or HTTPS; physical handheld scanner hardware is not connected, and the new camera flow still needs end-to-end verification.

## 5.4 Data organization
MongoDB collections managed through Mongoose hold users and sessions, menus and bookings, attendance, ratings and complaints, announcements, inventory and movements, suppliers and purchase orders, duties, waste, fee/payment records and administrative activity. References associate records with owners and permitted operators.

| Entity group | Representative data |
|---|---|
| User and session | User ID, role, password hash, wallet ledger; hashed session token and expiry. |
| Menu and booking | Date or weekday, meal slot, menu content; student, date, slot and status. |
| Attendance | Student and booking context, check-in time and duplicate-prevention key. |
| Inventory and purchasing | Stock item, quantity, unit and threshold; movement, supplier and order. |
| Feedback and complaint | Student, meal/date, rating or complaint, category and status. |
| Waste and analytics | Recorded weight/date; optional entered emission factor/source; booking/check-in history. |
| Finance and audit | Fee/payment state, wallet credit ledger and authenticated activity events. |

## 5.5 Security design
- Passwords use Node.js scrypt with per-password salts; startup migration converts legacy plaintext values while preserving passwords.
- Session tokens are random, stored as hashes in MongoDB and sent through HTTP-only, SameSite=Strict cookies. Production mode enables the Secure flag.
- Protected operations enforce role permissions on the server. Public registration cannot select a privileged role.
- Password resets revoke active sessions for the affected account.
- Search and operational reports are role-scoped; receipt output is owner-restricted.
- Production still needs HTTPS, private secrets, restricted database access and operational security review.

# 6. Functional Modules
## 6.1 Authentication and role dashboards
Sign-in identifies the role and directs the browser to its dashboard. Student registration validates a 12-digit ID and password length; the server assigns the student role. Staff, manager and admin accounts are provisioned by an administrator.

## 6.2 Menu scheduling and bookings
Staff maintain recurring weekday menus and date-specific overrides. A date-specific menu takes precedence; clearing it restores recurring or default content. Students view breakfast, lunch, snacks and dinner for a selected date. Booking changes are limited by date range and configurable server-side cutoffs.

## 6.3 Attendance
Students can generate a server-signed QR pass for today's active booking. Staff scan it with the browser camera, which verifies its signature, 90-second expiry, service date and booking before recording attendance. Booking-checked manual entry remains available, and duplicate check-ins are blocked. Physical handheld scanner hardware is not connected.

## 6.4 Ratings and grievance handling
Students submit meal ratings and comments and file complaints with an optional resized JPEG, PNG or WebP photo. Tickets move through Pending, In Progress and Resolved. Authorized staff, managers and admins process records; managers can bulk-resolve after confirmation. Students see their own complaint status and can retrieve their own attachment.

## 6.5 Inventory, suppliers and purchasing
Managers create stock records, log movements, maintain suppliers and register purchase orders. Received purchases affect quantities. Items at or below thresholds are surfaced. Operational lists support applicable search, filter and sort controls.

## 6.6 Waste and sustainability
Managers record measured waste weights and review trends. Optional CO2e estimates require both an entered factor and its source. The application does not choose factors or calculate avoided emissions.

## 6.7 Wallet, fees and receipts
Administrators record student credits; students review balance and ledger history and can settle a fee from a sufficient demo balance. The atomic fee debit and payment are recorded in the MessMate ledger; no stored-value funds, self-service top-ups, transfers or refunds are provided. Optional Razorpay checkout remains dependent on valid provider credentials. Paid entries have owner-only printable receipts that disclose whether money moved.

## 6.8 Notices, duties, search and reports
Staff and managers publish in-app announcements; students can mark them read. With stable VAPID keys and explicit browser opt-in, new announcements can also be sent as browser push notifications. Managers assign duties and update completion. Role-scoped search, filtered reports and CSV exports cover supported records; primary and secondary sorting and visible bulk updates are available for operational lists.

# 7. Implementation
## 7.1 Technology stack
| Area | Technology / approach |
|---|---|
| Frontend | HTML5, CSS3, modular vanilla JavaScript, responsive layouts, charts and browser-camera QR scanning. |
| Backend | Node.js 20.19+ and Express.js 4 REST-style JSON routes. |
| Database | MongoDB via Mongoose; persisted flows require a reachable database. |
| Authentication | Salted scrypt hashes, hashed opaque session tokens and HTTP-only cookies; auth and payment endpoints have request limits. |
| Attendance | Signed, expiring QR passes and browser-camera scanning with booking-checked manual fallback. |
| Reports | Authorized report endpoints, filtered CSV downloads and printable receipts. |
| Optional notifications | Web Push using VAPID keys and per-user opt-in. |
| Optional payments | Razorpay order/signature verification when server credentials are configured; demo wallet settlement uses the internal ledger. |

## 7.2 Application structure
| Path | Purpose |
|---|---|
| server.js | Express server, models, authorization, business rules and API endpoints. |
| index.html / signup.html | Public landing page, sign-in and student registration. |
| student-dashboard.html | Student menu, bookings, wallet, notices, ratings and complaints. |
| staff-dashboard.html | Staff menus, notices, check-ins, duties and complaints. |
| manager-dashboard.html | Inventory, suppliers, purchasing, duties, waste, forecasts and reports. |
| admin-dashboard.html | Account, role, password reset, fee and wallet records, and activity reporting. |
| service-worker.js / js/push-notifications.js | Optional browser push subscription and notification handling. |
| css/ and js/ | Shared and role-specific styling and client controllers. |

## 7.3 Configuration and seed data
The project documents PORT, MONGODB_URI, DEMO_ACCOUNT_PASSWORD, meal cutoffs, monthly fee, QR_SIGNING_SECRET, optional Razorpay keys and optional VAPID keys in .env.example and README.md. First startup seeds academic demo accounts using the configured password; replace it before use beyond a local demo. Demo identities are not checked against a campus directory.

# 8. Verification and Results
## 8.1 Verification evidence
The supplied PROJECT_STATUS.md records local MongoDB checks for authentication and logout, bookings/cutoffs, recurring and date-specific menu precedence, complaints, announcements, duplicate check-in prevention, inventory and purchase receiving, waste, duties, filtered reports/CSV, role denial and legacy password migration. Receipt authorization was checked against an isolated database. Registration was exercised with a role-escalation attempt and remained student-only.

These are reported checks, not tests rerun while preparing this report. The newer QR-camera, wallet fee settlement, complaint photo, browser push, bulk update, purchase-expense export and revised forecast paths have not had end-to-end verification recorded. Razorpay sandbox use, production HTTPS, stable production VAPID setup and deployment rate-limit configuration also remain unverified; physical handheld scanner hardware is outside the browser implementation.

## 8.2 Test case summary
| ID | Scenario | Expected / recorded outcome |
|---|---|---|
| TC01 | Valid sign-in and sign-out | Authenticated session created and cleared. |
| TC02 | Unauthorized or wrong-role access | Protected operation denied by server authorization. |
| TC03 | Booking before cutoff | Booking saved for eligible date and slot. |
| TC04 | Booking after cutoff | Server rejects late change. |
| TC05 | Duplicate check-in | Second QR or manual check-in for the same booking is rejected. |
| TC06 | Menu override precedence | Date menu overrides weekly menu; clearing restores fallback. |
| TC07 | Purchase receiving | Received order updates inventory and movement history. |
| TC08 | Complaint lifecycle | Status updates through supported states; student sees own ticket. |
| TC09 | Filtered report | Role-scoped rows and CSV reflect filters. |
| TC10 | Signup role escalation | Public registration remains student. |
| TC11 | Legacy password migration | Plaintext converted to salted hash without changing login password. |
| TC12 | Receipt authorization | Receipt available only to owning account. |

## 8.3 Interpretation
Recorded checks support core workflow and access-control behavior in a local demonstration environment. They do not establish production performance, availability, security certification or measured waste reduction. The newly added camera-scanning flow, VAPID delivery, wallet settlement and other recent additions still need end-to-end checks; provider credentials and live deployment controls need separate verification.

# 9. Deployment and User Guide
## 9.1 Local setup
1. Install Node.js 20.19+ and run MongoDB locally, or obtain a private MongoDB connection string.
2. In the project directory run `npm install`.
3. Copy `.env.example` to `.env`; set `MONGODB_URI` and replace `DEMO_ACCOUNT_PASSWORD` before first startup. Run `npm run generate-vapid-keys` to write a stable Web Push key pair to the ignored `.env` file; the command does not print the private key.
4. Run `npm start`. The server waits for MongoDB before serving the app.
5. Open `http://localhost:3000`. Use a provisioned account or create a student account. Allow notifications for the site in browser settings before opting in to alerts.

## 9.2 Configuration
| Variable | Purpose | Default / note |
|---|---|---|
| PORT | HTTP port | 3000 |
| MONGODB_URI | MongoDB connection | Local messplanner database |
| DEMO_ACCOUNT_PASSWORD | Newly seeded demo account password | Set a strong private value before startup. |
| BREAKFAST_CUTOFF | Breakfast cutoff | 07:30 local time |
| LUNCH_CUTOFF | Lunch cutoff | 10:30 local time |
| SNACKS_CUTOFF | Snacks cutoff | 15:00 local time |
| DINNER_CUTOFF | Dinner cutoff | 17:30 local time |
| QR_SIGNING_SECRET | QR pass signing | Set a stable private value when using multiple instances. |
| VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT | Optional browser push | `npm run generate-vapid-keys` writes a stable local pair to `.env`; in production, set the matching pair as host secrets. Keep the private key secret. |
| MESS_MONTHLY_FEE | Classroom fee value | INR 2500 |
| RAZORPAY_KEY_ID / SECRET | Optional provider workflow | Empty until configured with valid credentials. |

## 9.3 Demo and upgrade notes
Seeded accounts are for classroom use. Student IDs are format-checked, not verified against a university directory. Before upgrading an existing database, stop the app and make a backup. Follow the README upgrade procedure and keep the backup until login, bookings, menus and reports are checked.

# 10. Limitations and Future Work
## 10.1 Current limitations
- Browser-camera QR scanning is implemented but still needs end-to-end verification on target devices; it requires camera permission and localhost or HTTPS. No physical handheld scanner is connected.
- Wallet credits are administrator-entered classroom ledger entries that can settle a fee in-app. They are not real or transferable funds; students cannot top up, transfer or refund them.
- Payment sandbox behavior requires provider credentials and was not verified in recorded checks; demo transactions are not money transfers.
- Browser push is optional, requires stable VAPID keys and user opt-in, and still needs delivery verification in the target environment.
- Bulk actions cover visible duties and complaints; other records do not have bulk mutation controls.
- CO2e estimates require a staff-entered factor/source; no automatic factor database or avoided-emissions calculation exists.
- Demand estimates use a 28-day same-weekday history with greater weight on recent bookings and observed check-in ratios when available; otherwise the interface shows a booking-only fallback.
- MongoDB is required; the app has no in-memory persistence fallback.
- Production HTTPS, managed secrets, database restrictions, a shared rate-limit store, backups and target-environment checks remain necessary. New QR, payment, photo and push paths are not yet end-to-end verified.

## 10.2 Future work
- Connect verified campus identity provisioning.
- Complete end-to-end verification of signed QR scanning across supported target devices and browsers.
- Complete payment-provider sandbox checks and validate receipts.
- Configure and verify optional browser push delivery with production VAPID keys and user consent.
- Extend audited bulk operations and institutional reports.
- Establish sourced sustainability factors and a documented measurement method.
- Run deployment-specific security, accessibility, cross-browser, load and recovery checks.

# 11. Conclusion
MessMate brings student meal planning and mess operations into one role-based web application. The delivered prototype includes four-meal menus, cutoff-controlled bookings, signed QR and manual check-in, ratings and photo complaints, inventory and priced purchasing, duties, sourced waste estimates, forecasts, announcements, role-scoped reports, CSV exports, fee receipts and demo-ledger fee settlement. Browser push and Razorpay are optional integrations. The system remains an academic prototype: recent flows still need end-to-end verification, and production secrets, HTTPS, database controls, payment credentials and push keys must be configured before live institutional use.

# References
1. Sharma, A., & Verma, R. (2019). Challenges in Hostel Administration and Mess Operations in Higher Education Institutions. Journal of Campus Administration & Technology, 12(2), 45–58. Reference as listed in supplied academic materials.
2. Kumar, P., & Singh, S. (2020). Design and Development of Web-Based Smart Mess Management System. International Journal of Computer Applications, 178(14), 22–29. Reference as listed in supplied academic materials.
3. Patel, K., Mehta, M., & Shah, D. (2021). Automated Mess Access Control using QR Code Verification. IEEE Transactions on Consumer Electronics & Smart Campus, 67(3), 201–209. Reference as listed in supplied academic materials.
4. Express.js Documentation. https://expressjs.com/
5. Node.js Documentation. https://nodejs.org/docs/
6. MongoDB Documentation. https://www.mongodb.com/docs/
7. Mongoose Documentation. https://mongoosejs.com/docs/
8. MessMate source package, including README.md, PROJECT_STATUS.md, package.json and application files.

# Appendix A. Codebase and Report Folder
The project repository separates the Express API (`server.js`), public pages, four role dashboards, styles (`css/`), browser controllers (`js/`), branding and meal artwork (`assets/`), and setup notes (`README.md`, `.env.example`).

This Project Report folder contains the consolidated report and preserved copies of the supplied synopsis, progress presentation and mid-term report. The application source and setup instructions remain in the parent MessMate-Website folder.
