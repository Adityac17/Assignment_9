# Pharmacy & Healthcare Store API

> A production-style REST API for a pharmacy and healthcare store — JWT authentication, role-based access control (customer / pharmacist / admin), medicine inventory with an expiring-soon report, and orders with server-authoritative pricing, prescription enforcement, and atomic stock management.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Mongoose](https://img.shields.io/badge/Mongoose-8.5-880000?logo=mongoose&logoColor=white)](https://mongoosejs.com/)
[![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Database Setup (MongoDB Atlas)](#database-setup-mongodb-atlas)
- [Running the API](#running-the-api)
- [API Reference](#api-reference)
- [Role-Based Access Control (RBAC) Matrix](#role-based-access-control-rbac-matrix)
- [Data Models](#data-models)
- [Business Logic Notes](#business-logic-notes)
- [Postman Collection](#postman-collection)
- [Example Workflow](#example-workflow)
- [Design Choices & Notes](#design-choices--notes)
- [Author](#author)
- [License](#license)

---

## Overview

This service powers the back-end of a pharmacy and healthcare store. It exposes a
clean JSON API for three distinct actors:

- **Customers** browse the public medicine catalogue and place orders.
- **Pharmacists** manage inventory, review the expiring-soon report, and approve/dispense orders.
- **Admins** have every pharmacist capability plus the ability to delete medicines.

Authentication is handled with stateless **JWTs**, and every protected route is
gated by a reusable **role-guard** middleware. All money and stock decisions are
made **on the server** — the client can never dictate prices or bypass prescription
rules. Every response follows a single, predictable envelope:

```json
{ "success": true, "message": "human readable", "data": { } }
```

> **Boot resilience:** By design, the server always starts even when no database is
> reachable. If `MONGO_URI` is missing or the connection fails, it logs a clear
> warning and keeps listening; data-backed routes return errors until a valid URI
> is supplied. This makes the API easy to inspect and grade without a guaranteed
> live cluster.

## Features

- **JWT authentication** — register, login, and an authenticated profile endpoint. Passwords are hashed with `bcryptjs` and never returned.
- **Role-based access control** — `customer`, `pharmacist`, and `admin` roles enforced by middleware, returning precise `403` messages.
- **Secure staff onboarding** — public registration only ever creates customers; pharmacist/admin accounts require a shared `ADMIN_SECRET_KEY`.
- **Medicine inventory** — create, update, list (with search + category filter), and admin-only delete.
- **Expiring-soon report** — a real Mongo date-range query returning medicines expiring within the next 30 days.
- **Orders with server-authoritative pricing** — unit prices are looked up server-side at order time; the client's price is ignored.
- **Prescription enforcement** — orders containing prescription-only medicines require non-empty prescription notes.
- **Atomic stock decrement** — stock is deducted exactly once, on the first approval, using a guarded `$inc` with per-item rollback; re-approval never double-decrements.
- **Consistent JSON envelope** — every route (including 404 and centralized error handling) returns `{ success, message, data? }`.
- **Unit-tested business logic** — pricing, prescription, and stock rules are isolated as pure functions with Node's built-in test runner.

## Tech Stack

| Layer            | Technology            | Purpose                                             |
| ---------------- | --------------------- | --------------------------------------------------- |
| Runtime          | Node.js (18+)         | JavaScript server runtime                           |
| Web framework    | Express 4.19          | Routing, middleware, JSON handling                  |
| Database         | MongoDB Atlas         | Document persistence                                |
| ODM              | Mongoose 8.5          | Schemas, validation, queries, indexes               |
| Authentication   | jsonwebtoken 9        | Stateless JWT issuance & verification               |
| Password hashing | bcryptjs 2.4          | Salted password hashing                             |
| CORS             | cors 2.8              | Cross-origin resource sharing                       |
| Config           | dotenv 16             | Loading environment variables                       |
| Dev tooling      | nodemon 3             | Auto-reload during development                       |
| Testing          | `node:test`           | Built-in unit tests for pure business logic         |

## Project Structure

```
assignment-09-pharmacy-api/
├── config/
│   └── db.js                 # Mongoose connection (never crashes on failure)
├── controllers/
│   ├── authController.js      # register, register-staff, login, profile
│   ├── medicineController.js  # list, expiring, create, update, delete
│   ├── orderController.js     # createOrder, myOrders, listOrders, updateOrderStatus
│   └── orderLogic.js          # pure, testable order rules (pricing/prescription/stock)
├── middleware/
│   ├── auth.js                # verifies Bearer JWT -> req.user = { id, role }
│   └── roleGuard.js           # authorizeRoles(...roles) factory (403 on mismatch)
├── models/
│   ├── User.js                # name, email, password (hashed), role
│   ├── Medicine.js            # inventory item + text/expiry indexes
│   └── Order.js               # customer, line items, totals, status, stockDeducted
├── routes/
│   ├── authRoutes.js          # /api/auth/*
│   ├── medicineRoutes.js      # /api/medicines/*
│   └── orderRoutes.js         # /api/orders/*
├── postman/
│   └── pharmacy-api.postman_collection.json   # all 3 roles incl. 403 cases
├── tests/
│   └── orderLogic.test.js     # unit tests for orderLogic.js
├── .env.example
├── package.json
└── server.js                  # app wiring, health check, 404 + error handlers
```

## Prerequisites

- **Node.js** 18 or newer and **npm**
- A **MongoDB** connection string — a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works perfectly (see [Database Setup](#database-setup-mongodb-atlas))

## Installation & Setup

```bash
# 1. Clone the repository
git clone https://github.com/Adityac17/Assignment_9.git
cd Assignment_9

# 2. Switch to the assignment branch and enter the project directory
git checkout assignment-09
cd assignment-09-pharmacy-api

# 3. Install dependencies
npm install

# 4. Create your environment file from the template
cp .env.example .env
#   then edit .env and fill in the values (see below)
```

## Environment Variables

Copy `.env.example` to `.env` and set the following:

| Variable          | Required | Default | Description                                                                             |
| ----------------- | :------: | ------- | --------------------------------------------------------------------------------------- |
| `MONGO_URI`       |   Yes*   | —       | MongoDB Atlas connection string. If omitted, the server boots but data routes error.    |
| `JWT_SECRET`      |   Yes    | —       | Secret used to sign and verify JWTs. Use a long random string in production.             |
| `ADMIN_SECRET_KEY`|   Yes    | —       | Shared secret required to create pharmacist/admin accounts via `/api/auth/register-staff`.|
| `PORT`            |    No    | `5000`  | Port Express listens on.                                                                 |
| `JWT_EXPIRES_IN`  |    No    | `7d`    | Lifetime of issued tokens (any [ms](https://github.com/vercel/ms) / `jsonwebtoken` value).|

\* `MONGO_URI` is not required for the process to start (by design), but it is required for any database-backed functionality.

Example `.env`:

```dotenv
MONGO_URI=mongodb+srv://user:pass@cluster0.abcde.mongodb.net/pharmacy?retryWrites=true&w=majority
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
ADMIN_SECRET_KEY=super_secret_admin_key
PORT=5000
```

## Database Setup (MongoDB Atlas)

You can provision a free cluster in a few minutes:

1. Create an account at [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a **free (M0) shared cluster**.
2. Under **Database Access**, create a database user with a username and password.
3. Under **Network Access**, add your IP address (or `0.0.0.0/0` for open access while developing).
4. Click **Connect → Drivers** and copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/pharmacy?retryWrites=true&w=majority
   ```
5. Replace `<user>` and `<password>`, choose a database name (e.g. `pharmacy`), and paste the result into `MONGO_URI` in your `.env`.

Collections (`users`, `medicines`, `orders`) and their indexes are created automatically by Mongoose on first use — no manual migration required.

## Running the API

```bash
# Development (auto-reload via nodemon)
npm run dev

# Production
npm start

# Run the business-logic unit tests
npm test
```

Once running you should see `[server] Pharmacy API listening on port 5000`. Verify with the health check:

```bash
curl http://localhost:5000/
# { "success": true, "message": "Pharmacy & Healthcare Store API is running", "data": { "endpoints": [ ... ] } }
```

## API Reference

Base URL: `http://localhost:5000`

All protected endpoints expect an `Authorization: Bearer <token>` header. "Role required" of **Public** means no authentication is needed.

### Authentication — `/api/auth`

| Method | Endpoint                  | Role required | Description                                                                                          |
| ------ | ------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`      | Public        | Register a new account. Always created as `customer` (any `role` in the body is ignored). Returns a token. |
| POST   | `/api/auth/register-staff`| Public + secret | Create a `pharmacist` or `admin`. Requires the correct `ADMIN_SECRET_KEY` via `x-admin-secret` header or `adminSecret` body field. |
| POST   | `/api/auth/login`         | Public        | Authenticate with email + password; returns a JWT.                                                   |
| GET    | `/api/auth/profile`       | Authenticated | Return the current user's record (password excluded).                                                |

### Medicines — `/api/medicines`

| Method | Endpoint                      | Role required        | Description                                                                          |
| ------ | ----------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/medicines`              | Public               | List the catalogue. Supports `?search=` (matches name or brand) and `?category=`.    |
| GET    | `/api/medicines/expiring`     | Pharmacist / Admin   | Medicines expiring within the next 30 days (Mongo date-range query).                  |
| POST   | `/api/medicines`              | Pharmacist / Admin   | Create a medicine.                                                                    |
| PUT    | `/api/medicines/:id`          | Pharmacist / Admin   | Update a medicine (e.g. adjust stock or price).                                       |
| DELETE | `/api/medicines/:id`          | **Admin only**       | Delete a medicine.                                                                    |

### Orders — `/api/orders`

| Method | Endpoint                    | Role required      | Description                                                                                     |
| ------ | --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| POST   | `/api/orders`               | **Customer only**  | Place an order. Prices resolved server-side; prescription notes enforced; created as `pending`. |
| GET    | `/api/orders/my-orders`     | **Customer only**  | List the authenticated customer's own orders.                                                   |
| GET    | `/api/orders`               | Pharmacist / Admin | List all orders. Supports optional `?status=` filter.                                            |
| PATCH  | `/api/orders/:id/status`    | Pharmacist / Admin | Update status to `approved`, `dispensed`, or `cancelled`. First approval decrements stock atomically. |

## Role-Based Access Control (RBAC) Matrix

| Capability                                | Customer | Pharmacist | Admin |
| ----------------------------------------- | :------: | :--------: | :---: |
| Register (self, as customer)              |    ✅    |     ✅     |  ✅   |
| Login / view own profile                  |    ✅    |     ✅     |  ✅   |
| Browse medicine catalogue (public)        |    ✅    |     ✅     |  ✅   |
| Create staff account (with secret key)    |    —     |     —      |  —¹   |
| Create / update medicines                 |    ❌    |     ✅     |  ✅   |
| View expiring-soon report                 |    ❌    |     ✅     |  ✅   |
| Delete medicines                          |    ❌    |     ❌     |  ✅   |
| Place an order                            |    ✅    |     ❌     |  ❌   |
| View own orders (`/my-orders`)            |    ✅    |     ❌     |  ❌   |
| View all orders                           |    ❌    |     ✅     |  ✅   |
| Approve / dispense / cancel orders        |    ❌    |     ✅     |  ✅   |

¹ Staff creation is not tied to a logged-in role — it is gated by the shared `ADMIN_SECRET_KEY`, not by a JWT. This bootstraps the very first pharmacist/admin when no such account exists yet.

## Data Models

### User

| Field       | Type   | Notes                                                              |
| ----------- | ------ | ----------------------------------------------------------------- |
| `name`      | String | Required, trimmed                                                 |
| `email`     | String | Required, unique, lowercased, format-validated                   |
| `password`  | String | Required, min 6 chars, hashed with bcrypt, `select: false`        |
| `role`      | String | One of `customer` \| `pharmacist` \| `admin` (default `customer`) |
| timestamps  | Date   | `createdAt`, `updatedAt`                                          |

### Medicine

| Field                  | Type    | Notes                                                        |
| ---------------------- | ------- | ----------------------------------------------------------- |
| `name`                 | String  | Required, trimmed (text-indexed)                             |
| `brand`                | String  | Required, trimmed (text-indexed)                             |
| `category`             | String  | Required, trimmed                                           |
| `dosageForm`           | String  | One of `Tablet` \| `Capsule` \| `Syrup` \| `Injection`      |
| `price`                | Number  | Required, `min: 0`                                          |
| `stockQuantity`        | Number  | Required, `min: 0`, default `0`                             |
| `requiresPrescription` | Boolean | Default `false`                                            |
| `expiryDate`           | Date    | Required (indexed for the expiring-soon range query)        |
| timestamps             | Date    | `createdAt`, `updatedAt`                                    |

### Order (with line items)

| Field               | Type       | Notes                                                                    |
| ------------------- | ---------- | ----------------------------------------------------------------------- |
| `customer`          | ObjectId   | Ref → `User`, required                                                   |
| `items`             | Array      | One or more line items (see below); must be non-empty                    |
| `totalAmount`       | Number     | Server-computed, `min: 0`                                                |
| `prescriptionNotes` | String     | Trimmed, default `''` (required when any item needs a prescription)      |
| `status`            | String     | One of `pending` \| `approved` \| `dispensed` \| `cancelled` (default `pending`) |
| `stockDeducted`     | Boolean    | Internal guard; flips to `true` on first approval to prevent double-decrement |
| timestamps          | Date       | `createdAt`, `updatedAt`                                                 |

**Order line item** (embedded, no `_id`):

| Field       | Type     | Notes                                              |
| ----------- | -------- | -------------------------------------------------- |
| `medicine`  | ObjectId | Ref → `Medicine`, required                          |
| `quantity`  | Number   | Required, `min: 1`                                 |
| `unitPrice` | Number   | Required, `min: 0` — snapshot of the server price at order time |

## Business Logic Notes

The rules that are easiest to get wrong live in `controllers/orderLogic.js` as
**pure, side-effect-free functions** (no Express, no Mongoose), so they can be
unit-tested without a database. The controller wires them to real documents.

- **Server-authoritative pricing.** When an order is placed, each item's
  `unitPrice` is read from the medicine's *current* database price and the
  `totalAmount` is computed on the server. Any price sent by the client is
  ignored — clients cannot underpay.

- **Prescription enforcement.** If **any** item in the order references a medicine
  with `requiresPrescription: true`, the request must include non-empty
  `prescriptionNotes`; otherwise it is rejected with `400`.

- **Stock sufficiency at order time.** Placing an order checks that each requested
  quantity is available and names the short medicine if not. This is a best-effort
  check — the authoritative check happens again at approval.

- **Atomic stock decrement on first approval only.** Placing an order does **not**
  touch stock. Stock is decremented only on the **first** transition into
  `approved`, using a per-item conditional update guarded by
  `{ stockQuantity: { $gte: quantity } }` with `$inc: { stockQuantity: -quantity }`.
  If any item is short, decrements already applied in that request are **rolled
  back** and the approval fails with `400`. The order's `stockDeducted` flag then
  guards against re-approval, so stock is **never double-decremented**.

## Postman Collection

A ready-to-run collection covering **all three roles** — including negative
`403` authorization cases — is provided at:

```
postman/pharmacy-api.postman_collection.json
```

Import it into Postman, then set the collection variables (`baseUrl`,
`adminSecret`, and the per-role token variables `customerToken` / `pharmacistToken`
/ `adminToken`, plus `medicineId` / `orderId`) as you go. Notable requests include:

- **Auth:** register customer, register pharmacist/admin with the secret, and a **wrong-secret** attempt expecting `403`; logins for each role.
- **Medicines:** add medicine as pharmacist (and a prescription-only medicine), add medicine **as customer expecting `403`**, expiring-soon report, expiring-soon **as customer expecting `403`**, delete as admin, delete **as pharmacist expecting `403`**.
- **Orders:** place order as customer, place order **as pharmacist expecting `403`**, my-orders, all-orders with `?status`, **approve (decrements once)**, **re-approve (no double decrement)**, and dispense.

## Example Workflow

A full lifecycle: register a customer → create a pharmacist → add a medicine →
place an order → approve it. All responses use the `{ success, message, data }`
envelope.

**1. Register a customer** (public)

```http
POST /api/auth/register
Content-Type: application/json

{ "name": "Asha Rao", "email": "asha@example.com", "password": "secret123" }
```

```json
{
  "success": true,
  "message": "Customer registered successfully",
  "data": {
    "id": "665f...",
    "name": "Asha Rao",
    "email": "asha@example.com",
    "role": "customer",
    "token": "eyJhbGciOi..."
  }
}
```

**2. Create a pharmacist** (requires the admin secret)

```http
POST /api/auth/register-staff
Content-Type: application/json
x-admin-secret: super_secret_admin_key

{ "name": "Dr. Mehta", "email": "mehta@pharmacy.com", "password": "secret123", "role": "pharmacist" }
```

```json
{
  "success": true,
  "message": "Staff account (pharmacist) created successfully",
  "data": { "id": "665f...", "role": "pharmacist", "token": "eyJhbGciOi..." }
}
```

**3. Log in and add a medicine** (as the pharmacist)

```http
POST /api/medicines
Content-Type: application/json
Authorization: Bearer <pharmacistToken>

{
  "name": "Amoxicillin 500mg",
  "brand": "Cipla",
  "category": "Antibiotic",
  "dosageForm": "Capsule",
  "price": 45,
  "stockQuantity": 100,
  "requiresPrescription": true,
  "expiryDate": "2026-12-31"
}
```

```json
{
  "success": true,
  "message": "Medicine created",
  "data": { "_id": "6660...", "name": "Amoxicillin 500mg", "price": 45, "stockQuantity": 100, "requiresPrescription": true }
}
```

**4. Place an order** (as the customer — note prescription notes are required)

```http
POST /api/orders
Content-Type: application/json
Authorization: Bearer <customerToken>

{
  "items": [{ "medicine": "6660...", "quantity": 2 }],
  "prescriptionNotes": "Rx #A-1024, Dr. Mehta, 2025-09-10"
}
```

```json
{
  "success": true,
  "message": "Order placed",
  "data": {
    "_id": "6661...",
    "customer": "665f...",
    "items": [{ "medicine": "6660...", "quantity": 2, "unitPrice": 45 }],
    "totalAmount": 90,
    "status": "pending",
    "stockDeducted": false
  }
}
```

**5. Approve the order** (as pharmacist/admin — stock decrements once)

```http
PATCH /api/orders/6661.../status
Content-Type: application/json
Authorization: Bearer <pharmacistToken>

{ "status": "approved" }
```

```json
{
  "success": true,
  "message": "Order status updated to approved",
  "data": { "_id": "6661...", "status": "approved", "stockDeducted": true }
}
```

At this point the medicine's `stockQuantity` has dropped from `100` to `98`.
Re-sending the same approval leaves stock untouched.

## Design Choices & Notes

- **Single response envelope.** Every route, plus the 404 and centralized error
  handlers, returns `{ success, message, data? }` for predictable client parsing.
- **Boots without a database (by assignment constraint).** `config/db.js` never
  throws or exits — a missing/invalid `MONGO_URI` logs a warning and the server
  still starts, so the API can be inspected without a guaranteed live cluster.
  All model logic is written against real queries, so it is fully functional the
  moment a valid URI is supplied.
- **Security by default.** Passwords use `select: false` and are hashed with a
  `pre('save')` bcrypt hook; JWTs carry only `{ id, role }`; public registration
  can never escalate to a staff role.
- **Separation of concerns.** Pure order rules (`orderLogic.js`) are decoupled
  from Express and Mongoose so they can be unit-tested with `npm test`.
- **Database-side work, not app-side filtering.** Search, category filtering, and
  the expiring-soon report are real Mongo queries backed by indexes rather than
  in-memory scans.
- **Correctness of stock.** Atomic guarded `$inc` updates with rollback and the
  `stockDeducted` flag prevent both overselling and double-decrementing.

## Author

**Aditya S Chouksey**

## License

Released under the [MIT](https://opensource.org/licenses/MIT) License.
