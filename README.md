# LoadFlow — Freight Brokerage Operations Suite

LoadFlow is a high-performance logistics coordination suite connecting Shippers, Brokers, and Carriers. It features real-time shipment status tracking, admin-customizable Role-Based Access Control (RBAC), automatic carrier compliance checks, and a detailed audit logging timeline.

## Technical Stack

1. **Backend**: Node.js + Express.js + TypeScript (managed via `tsx`).
2. **Frontend**: React + Vite + TypeScript.
3. **Database**: DAO-pattern JSON-file-based datastore (`backend/db.json`). This ensures 100% OS-agnostic execution, bypassing native binary compilation issues on Windows, while preserving database constraints, autoincrements, and data relationships.
4. **Styling**: Vanilla HSL-variable-driven CSS with glassmorphism panels, customized layouts, responsive grid widgets, and micro-interactions.

---

## Quick Start

You can boot both the API server (Port 5000) and the React web app (Port 5173) with a single command from the root of the project:

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Launch Development Servers
```bash
npm run dev
```

The web console will open at [http://localhost:5173](http://localhost:5173).

---

## Automated RBAC Testing

A complete programmatic API integration test suite is included to verify security policies (e.g. shipper scoping, dispatcher permission locks, compliance status blockages). Run:

```bash
npm run test-rbac --prefix backend
```

---

## Seed Accounts for Quick-Login

The database automatically initializes with a mock seed dataset. Use the **Evaluation Quick-Login** panel on the right of the login screen to sign in instantly with one click, or use standard credentials:

*All seed accounts use the password:* `password`

### Broker Org: *Apex Logistics*
* **Broker Admin (Owner)**: `broker_admin` (Full permissions to assign staff, roles, loads, overrides)
* **Broker Dispatcher**: `broker_dispatch` (Permission: Assign carriers, sign rates. *Blocked from posting new loads*)
* **Ops Lead**: `broker_ops` (Full operations + compliance override credentials)

### Carrier Org: *Titan Freight*
* **Carrier Admin (Owner)**: `carrier_admin` (Create roles, manage staff, update insurance)
* **Carrier Dispatcher**: `carrier_dispatch` (Permission: Accept rate confirmations, update status, upload POD)
* **Carrier Driver**: `carrier_driver` (Permission: Update load status, upload POD. *Blocked from signing rate agreements*)

### Shippers
* **ACME Manufacturing**: `shipper_acme` (Can view and track only ACME loads. *Scoping blocks them from viewing others*)
* **Retail Giant Corp**: `shipper_walmart` (Track Walmart loads)

---

## Key Features & Business Rules

1. **Admin-Defined RBAC**: Broker and Carrier admins can create custom staff roles (e.g. "Dispatcher", "Driver", "Ops Lead") by selecting specific permission bundles from the catalog (`load.create`, `load.assign_carrier`, etc.). API requests check permissions, never role names.
2. **Org & Object-Level Scoping**: Shippers see only their own shipments. Carrier staff see only their own carrier's assigned loads. Broker staff see only their own brokerage's loads. Unauthorized requests return `403 Forbidden` and write a warning to the audit logs.
3. **Compliance Verification**: Carriers record an MC/DOT authority status, insurance expiry date, and approved equipment/commodity types. Assigning a carrier automatically evaluates compliance. Expired credentials block progression past "Carrier Assigned" state unless overrode by an authorized Broker.
4. **Rate Confirmation Versioning**: Brokers propose versioned rate contracts (base rate + accessorial fuel/tarp fees). Advancement past assignment requires both parties to sign the latest version. Doing so automatically shifts the cargo state to "Rate Confirmed".
5. **Audit Trails**: Every status transition, carrier assignment, rate confirmation proposal/signing, compliance blockage, and security violation writes a permanent log detailing the actor and timestamps.
