# Ticket Booking Platform — Backend API

A RESTful Express.js API powering the Ticket Booking Platform. It provides endpoints for ticket listings, bookings, user management, and admin/vendor dashboards, backed by MongoDB and secured with JWT authentication via a remote JWKS endpoint.

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (via `mongodb` driver)
- **Authentication:** JWT verification using `jose-cjs` with a remote JWKS endpoint
- **Config:** `dotenv`

---

## Getting Started

### Prerequisites

- Node.js v18+
- A MongoDB Atlas cluster (or local instance)
- A `.env` file with the required variables (see below)

### Installation

```bash
git clone https://github.com/md-siam-kazi-dev/ticketlagbe-backend.git
cd ticket-booking-api
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
MONOGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
```

### Running the Server

```bash
node index.js
```

The server starts on **port 9000**.

```
Server successfully running on port 9000
```

---

## Authentication

Protected routes require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Tokens are verified against the remote JWKS endpoint at:
```
https://ticketbookplatform.vercel.app/api/auth/jwks
```

Unauthenticated requests return `401 Unauthorized`. Invalid tokens return `403 Forbidden`.

---

## API Reference

### Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | No | Verify the API is running |

---

### Tickets

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/allticketpag` | No | Paginated approved tickets with filtering and sorting |
| GET | `/api/allticket` | No | All tickets (no filter) |
| GET | `/api/allticket/ad` | No | All approved tickets (no pagination) |
| GET | `/api/allticket/latest` | No | 6 most recently approved tickets |
| GET | `/api/tickets/:id` | No | Single approved ticket by ID |
| GET | `/api/adticket` | No | Tickets flagged as advertisements |
| GET | `/api/myticket/:email` | No | All tickets belonging to a vendor |
| POST | `/api/ticket` | ✅ | Add a new ticket listing |
| PATCH | `/api/ticket` | ✅ | Update an existing ticket by ID |
| PATCH | `/api/ticket/ad` | No | Toggle advertisement status on a ticket |
| DELETE | `/api/ticket/:id` | ✅ | Delete a ticket listing |

#### Query Parameters for `GET /api/allticketpag`

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1, page size: 6) |
| `to` | string | Regex filter on destination |
| `from` | string | Regex filter on origin |
| `type` | string | Regex filter on transport type |
| `sort` | `asc` \| `desc` \| `none` | Sort by price |

---

### Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/bookings/:email` | ✅ | All bookings for a user |
| GET | `/api/bookings/vendor/:email` | ✅ | All bookings for a vendor's tickets |
| GET | `/api/trx/:email` | ✅ | Paid transactions for a user |
| GET | `/api/vendor/rev/:email` | ✅ | Paid bookings for vendor revenue tracking |
| POST | `/api/bookings` | ✅ | Create a booking (decrements ticket inventory) |
| PATCH | `/api/paidbooking` | ✅ | Mark a booking as paid with a transaction ID |
| PATCH | `/api/reqbookings/:id` | ✅ | Update booking status (accept / reject) |

---

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/getuser/:email` | ✅ | Get user profile by email |
| GET | `/api/user/stats/:email` | ✅ | User booking statistics (spending, seats, statuses) |
| PATCH | `/api/admin/getuser` | ✅ | Update user name and profile image |

---

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/user` | ✅ | List all registered users |
| GET | `/api/admin/overview` | ✅ | Platform-wide stats (tickets, accounts, statuses) |
| PATCH | `/api/admin/tickets` | ✅ | Approve or reject a ticket listing |
| PATCH | `/api/admin/users` | ✅ | Change user role or block fraudulent vendors |

---

### Vendor

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/vendoroverview/:email` | ✅ | Vendor dashboard stats (revenue, sold seats, bookings) |

---

## Database Structure

| Database | Collection | Purpose |
|----------|------------|---------|
| `Tickets` | `tickets` | Ticket listings |
| `Tickets` | `booking` | Booking records |
| `TL_AUTH` | `user` | User accounts and roles |

---

## Error Responses

| Status | Meaning |
|--------|---------|
| 401 | Missing or malformed `Authorization` header |
| 403 | Invalid or expired JWT token |
| 404 | Resource not found |
| 500 | Internal server error |

---

## Notes

- The server binds to **port 9000**.
- Ticket pagination uses a fixed page size of **6 items**.
- When a booking is created, the source ticket's `quantity` is decremented and `totalSold` is incremented atomically.
- Marking a vendor as fraudulent (`isFraud: true`) blocks their account and **deletes all their ticket listings**.
