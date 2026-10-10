# 🏨 InnControl - Hotel Room Reservation System

**InnControl** is a complete, production-grade Hotel Room Reservation Web Application built with **Node.js, Express, SQLite3, Vanilla JavaScript, and Tailwind CSS**.

The system strictly enforces the Software Engineering **SAT II** specifications while delivering a polished light-themed web interface complete with real-time room availability tracking, rate snapshotting, transaction atomicity, destination filtering, check-in/check-out date selection, authentic username & password login, and role-separated Guest vs. Admin portals.

---

## 🌟 Features & Specifications

### 🔑 Authentication & Pre-configured Credentials
Users log in with their **Username** and **Password** via the interactive Login Modal.

| Username | Password | Role | Access Level |
| :--- | :--- | :--- | :--- |
| `user1` | `user123` | Customer | Room Booking, Personal Reservations, Cancellation |
| `user2` | `user123` | Customer | Room Booking, Personal Reservations, Cancellation |
| `admin1` | `admin123` | Administrator | System Reservations Console, Sequential Status Workflow |

---

### 🎨 Visual & UI Design
- **Color Scheme**: Clean, modern light palette with Indigo/Slate accents, subtle borders (`border-slate-200`), bold typography (`Inter`), and high contrast readable text.
- **Portals**: Distinct **Guest Portal** (Find & Book Rooms, My Booking History) and **Admin Console** (System Reservations & Sequential Status Transitions).
- **Interactive Authentication**: Header button triggers the Login Modal with quick-fill demo buttons for `user1`, `user2`, and `admin1`.

---

## 📋 Strict Business Rule Compliance (BR1 - BR10)

| Rule | Title | Description & Implementation |
| :--- | :--- | :--- |
| **BR1** | **Quantity Bounds** | Quantity inputs restricted between **1 and 5**. Rejects 0, negative values, decimals, or > 5 both on UI and API level. |
| **BR2 & BR6** | **Real-time Inventory & Atomicity** | Re-validates room availability inside an isolated database transaction (`BEGIN IMMEDIATE TRANSACTION` ... `ROLLBACK`). Guarantees zero partial updates. |
| **BR3 & BR7** | **Historical Rate Snapshot & Audit** | On successful reservation, locks room rate in `ReservationItems` snapshot table. Future room price changes do not modify historical totals. Logs audit record in `StatusHistory`. |
| **BR4** | **Fare Calculation Formula** | `Base Total = Rate x Quantity`<br>Booking charge = **Rs. 50** if `Base Total < Rs. 1,000`, otherwise **Rs. 0**.<br>`Grand Total = Base Total + Booking Charge`. |
| **BR5** | **Validation Requirements** | Customer Name cannot be blank. Phone Number must match a 10-digit numerical regex (`/^\d{10}$/`). |
| **BR8** | **Sequential Admin Status** | Advanced sequentially: `CONFIRMED` &rarr; `CHECKED_IN` &rarr; `COMPLETED`. Skipping stages is prohibited. |
| **BR9** | **User Cancellation & Single Restore** | Users can cancel their own `CONFIRMED` bookings. Sets status to `CANCELLED`, restores room inventory, and sets `capacity_restored = 1` to block duplicate API calls from restoring stock twice. |
| **BR10** | **Strict Access Control** | Enforces HTTP `403 Forbidden` if a user attempts to view or cancel another user's reservation or access the Admin console. |

---

## 📊 Database Schema & Initial Seed Data

### Initial Room Seed (`Resources` Table)

| Room ID | Name | Rate (Per Night) | Initial Availability | Hotel Property | Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R101** | Room A | Rs. 499 | 10 | InnControl Grand Hotel | MG Road, Bengaluru |
| **R102** | Room B | Rs. 799 | 5 | InnControl Luxury Suites | Indiranagar, Bengaluru |
| **R103** | Room C | Rs. 199 | 20 | InnControl Express Stay | Koramangala, Bengaluru |
| **R104** | Room D | Rs. 1,299 | 0 *(Sold Out)* | InnControl Royal Palace | UB City, Bengaluru |
| **R105** | Room E | Rs. 1,000 | 3 | InnControl Business Resort | Whitefield, Bengaluru |

---

## 🛠️ Technology Stack

- **Backend**: Node.js & Express.js
- **Database**: SQLite3 (`sqlite3` module with SQL transactions and promises)
- **Frontend**: Vanilla HTML5 / ES6 JavaScript + Tailwind CSS (via CDN)
- **Fonts**: Inter (Google Fonts)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Installation & Run

1. **Navigate to your cloned/downloaded folder**:
   ```bash
   cd <your-cloned-or-downloaded-folder>
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Express Server**:
   ```bash
   npm start
   ```

4. **Access the Web App**:
   Open browser at `http://localhost:3000`

---

## 📡 API Reference

### Authentication & Public / Guest Endpoints

- `POST /api/login` - Authenticate customer or admin credentials.
- `GET /api/rooms` - Fetch list of active rooms (Optional query params: `location`, `hotel`).
- `GET /api/me` - Fetch active user identity (Header `x-user-id: user1`).
- `POST /api/reservations` - Create a room booking transactionally (Header `x-user-id: user1`).
  - *Body*: `{ roomId, quantity, customerName, phone, checkInDate, checkOutDate }`
- `GET /api/reservations/my` - Get historical reservations for logged-in user.
- `POST /api/reservations/:id/cancel` - Cancel user's `CONFIRMED` booking and restore room inventory.

### Admin Endpoints

- `GET /api/admin/reservations` - Get global system bookings and audit logs (Header `x-user-id: admin1`).
- `POST /api/admin/reservations/:id/advance` - Advance booking status sequentially (`CONFIRMED` &rarr; `CHECKED_IN` &rarr; `COMPLETED`).

---

## 📝 License & Attribution
Developed for Software Engineering SAT II Requirements.
