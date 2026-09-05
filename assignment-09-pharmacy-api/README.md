# Pharmacy & Healthcare Store API

A RESTful API for a pharmacy / healthcare store with **role-based access control (RBAC)** and **JWT authentication**. Built with Node.js, Express, and MongoDB (Mongoose).

Three roles — **customer**, **pharmacist**, **admin** — have different permissions across authentication, medicine inventory, and orders. Orders enforce real pharmacy rules: server-side pricing, prescription requirements, and safe stock deduction that only happens on approval.

---

## Tech Stack

- **Node.js + Express.js** — HTTP server and routing
- **MongoDB Atlas + Mongoose** — data store and ODM
- **jsonwebtoken** — JWT issuing/verification
- **bcryptjs** — password hashing
- **dotenv** — environment configuration
- **cors** — cross-origin support
- **nodemon** (dev) — auto-reload

---

## Project Structure

```
assignment-09-pharmacy-api/
├── config/db.js                     # Mongoose connection (graceful, never crashes)
├── controllers/
│   ├── authController.js            # register, register-staff, login, profile
│   ├── medicineController.js        # CRUD + expiring-soon report
│   ├── orderController.js           # place/list orders, status transitions + stock deduction
│   └── orderLogic.js               # pure, unit-tested business rules
├── middleware/
│   ├── auth.js                      # verify Bearer JWT -> req.user = { id, role }
│   └── roleGuard.js                 # authorizeRoles(...roles) -> 403 if not allowed
├── models/
│   ├── User.js                      # name, email, password(hashed), role
│   ├── Medicine.js                  # inventory item
│   └── Order.js                     # customer order with line items
├── routes/
│   ├── authRoutes.js
│   ├── medicineRoutes.js
│   └── orderRoutes.js
├── tests/orderLogic.test.js         # node:test unit tests (no DB needed)
├── postman/pharmacy-api.postman_collection.json
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string (see **Database Setup**) |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (optional, default `7d`) |
| `ADMIN_SECRET_KEY` | Shared secret required to create pharmacist/admin accounts |
| `PORT` | Port Express listens on (optional, default `5000`) |

```bash
cp .env.example .env
# then edit .env
```

---

## Database Setup (MongoDB Atlas)

No live database ships with this project — you supply your own `MONGO_URI`. To create a free cluster:

1. Go to <https://www.mongodb.com/cloud/atlas> and create a free account.
2. Create a **free (M0) shared cluster** (pick any cloud/region).
3. Under **Database Access**, create a database user with a username and password.
4. Under **Network Access**, add your IP address (or `0.0.0.0/0` for development — allows all IPs).
5. Click **Connect → Drivers** on your cluster and copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/pharmacy?retryWrites=true&w=majority
   ```
6. Replace `<user>` and `<password>`, add a database name (e.g. `pharmacy`), and paste it into `MONGO_URI` in your `.env`.

**Graceful degradation:** If `MONGO_URI` is missing or the connection fails, the server **still starts** and logs a clear warning instead of crashing (see `config/db.js`). Database-backed routes then return a clean JSON error until a valid URI is provided. All Mongoose logic is real (no mocks) — the API becomes fully functional the moment a valid `MONGO_URI` is supplied.

---

## How to Run

```bash
npm install          # install dependencies
npm run dev          # start with nodemon (auto-reload)
# or
npm start            # start with node
```

Server boots at `http://localhost:5000` (or your `PORT`). Health check:

```bash
curl http://localhost:5000/
```

Run the unit tests (no database required):

```bash
npm test
```

---

## Response Shape

Every endpoint returns a consistent JSON envelope:

```json
{ "success": true, "message": "…", "data": { } }
```

On error: `{ "success": false, "message": "…" }`. A centralized error handler and a 404 handler guarantee this shape throughout.

---

## Authentication

Send the JWT as a Bearer token:

```
Authorization: Bearer <token>
```

`register`, `login`, and `register-staff` all return a `token` in `data` for convenience.

---

## Endpoints & Role Requirements

### Auth (`/api/auth`)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | Public | Creates **customer** only (role in body ignored) |
| POST | `/register-staff` | `ADMIN_SECRET_KEY` required | Creates **pharmacist** or **admin**; key via `x-admin-secret` header or `adminSecret` body field. 403 if key wrong |
| POST | `/login` | Public | Verifies bcrypt hash, issues JWT `{ id, role }` |
| GET | `/profile` | Authenticated (any role) | Returns current user minus password |

### Medicines (`/api/medicines`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | Public | `?search=` (name or brand) and `?category=` filters |
| GET | `/expiring` | pharmacist, admin | Medicines expiring within next 30 days (real Mongo date-range query) |
| POST | `/` | pharmacist, admin | Validates required fields, `price >= 0`, `stockQuantity >= 0` |
| PUT | `/:id` | pharmacist, admin | Partial update (e.g. stock/price); 404 if not found |
| DELETE | `/:id` | **admin only** | 404 if not found |

### Orders (`/api/orders`)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/` | **customer only** | See order rules below |
| GET | `/my-orders` | **customer only** | Only the caller's own orders |
| GET | `/` | pharmacist, admin | All orders; `?status=` filter |
| PATCH | `/:id/status` | pharmacist, admin | `{ status: approved \| dispensed \| cancelled }`; deducts stock on first approval |

**RBAC matrix summary**

- register → anyone (customer only)
- register-staff → valid `ADMIN_SECRET_KEY` (creates pharmacist/admin)
- GET medicines → public
- GET medicines/expiring → pharmacist, admin
- POST/PUT medicines → pharmacist, admin
- DELETE medicines/:id → admin only
- POST orders → customer only
- GET orders/my-orders → customer only (own orders)
- GET orders → pharmacist, admin
- PATCH orders/:id/status → pharmacist, admin

---

## Order Business Rules

**Placing an order** (`POST /api/orders`):

- Body: `{ items: [{ medicine, quantity }], prescriptionNotes? }`
- For each item, the medicine's **current price is looked up server-side** as `unitPrice` — the client-supplied price is never trusted.
- **Stock sufficiency** is checked; if short, responds `400` naming the medicine.
- If **any** item's medicine has `requiresPrescription: true`, a **non-empty `prescriptionNotes`** is required, else `400`.
- `totalAmount` is computed server-side as `sum(quantity * unitPrice)`.
- Order is created with status `pending`. **Stock is NOT decremented at this point.**

**Status transitions** (`PATCH /api/orders/:id/status`):

- On the **first** transition into `approved`, stock is decremented **atomically** per item using a conditional update guarded by `{ stockQuantity: { $gte: quantity } }`.
- If any item is now insufficient, the **whole** status change is rejected (`400`) and any partial decrements already applied are **rolled back**.
- **Re-approving** an already-approved order does **not** double-decrement (guarded by the `stockDeducted` flag on the order).

---

## Postman Collection

`postman/pharmacy-api.postman_collection.json` covers **all three roles** with token headers, including:

- Register customer; register-staff for pharmacist **and** admin; register-staff with a wrong secret (expect `403`)
- Login for each role (tokens auto-saved to collection variables via test scripts)
- Add medicine as pharmacist (`201`); **add medicine as customer (expect `403`)**
- Update medicine, expiring-soon report, delete medicine as admin (and delete as pharmacist → `403`)
- Place order as customer (`201`); place order as pharmacist (expect `403`)
- Approve order as pharmacist, with the **stock-deduction expectation documented** in the request description, plus a re-approve request demonstrating no double-decrement

Import it into Postman, set the `baseUrl` variable if needed (default `http://localhost:5000`), ensure `adminSecret` matches your `.env` `ADMIN_SECRET_KEY`, and run the folders top to bottom.

---

## Testing

- **Unit tests** (`npm test`, via Node's built-in `node:test`): cover the extracted pure functions in `controllers/orderLogic.js` — `computeTotalAmount`, `isPrescriptionRequired`, `prescriptionNotesSatisfied`, and `findInsufficientStock`. These run **without a database**. All 10 tests pass.
- **Boot without DB**: `npm start` with no `MONGO_URI` logs a warning and keeps serving (verified) rather than crashing.
- **Role/403 coverage**: exercised through the Postman collection (customer add-medicine → 403, wrong admin secret → 403, etc.).

---

## Design Choices

Because the assignment said to make reasonable choices autonomously, the following decisions were made and are documented here:

1. **`ADMIN_SECRET_KEY` accepted via header or body.** `register-staff` reads the key from the `x-admin-secret` header **or** an `adminSecret` body field, for flexibility. A wrong/missing key returns `403`.
2. **Passwords are `select: false`.** They are excluded from queries by default and only explicitly selected during login, so `GET /profile` and other responses never leak the hash.
3. **Tokens returned on register/login.** Convenient for API clients and the Postman flow; `{ id, role }` is the JWT payload, and role guards trust the role claim from the verified token.
4. **Stock deduction strategy.** Rather than requiring a replica-set transaction (MongoDB Atlas supports them, but a standalone/local Mongo may not), stock is decremented with **per-item conditional atomic updates** (`$inc` guarded by `$gte`). This prevents negative stock under concurrency, and failed approvals are rolled back item-by-item. A `stockDeducted` flag on the order makes approval idempotent for stock. This is portable across all MongoDB deployments.
5. **Prescription rule is order-level.** If any single item requires a prescription, the whole order requires non-empty `prescriptionNotes`. This matches how a pharmacist would handle a mixed basket.
6. **Server-authoritative pricing and totals.** Client-supplied prices/totals are ignored; `unitPrice` comes from the live medicine record and `totalAmount` is recomputed server-side.
7. **Graceful DB handling.** Per the constraint that no live Atlas cluster is guaranteed, `config/db.js` never throws — it warns and lets Express boot, so the app is demonstrable without credentials while remaining fully real (non-mocked) once a URI is set.
8. **Business logic extracted for testability.** The trickiest rules live in `orderLogic.js` as pure functions so they can be unit-tested deterministically without a database.
9. **Search is case-insensitive regex** on name/brand, and `category` filter is an exact (case-insensitive) match — simple and predictable for a small catalogue.
