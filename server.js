const express = require('express');
const path = require('path');
const { initDb, runAsync, getAsync, allAsync } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware for auth check simulation
async function authMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Missing authentication user identity (x-user-id header)' });
  }

  try {
    const user = await getAsync('SELECT * FROM Users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid user identity' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authentication database error' });
  }
}

// ------------------- API ENDPOINTS -------------------

// Login Endpoint (Authentication)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await getAsync('SELECT id, name, role, password FROM Users WHERE id = ?', [username.trim()]);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password credentials.' });
    }

    // Omit password from output
    const { password: _, ...userProfile } = user;
    res.json({ message: 'Login successful', user: userProfile });
  } catch (err) {
    res.status(500).json({ error: 'Database error during authentication.' });
  }
});

// 1. Get Logged-in User Profile
app.get('/api/me', authMiddleware, (req, res) => {
  const { password: _, ...userProfile } = req.user;
  res.json(userProfile);
});

// 2. Get Rooms (Resources)
app.get('/api/rooms', async (req, res) => {
  try {
    const { location, hotel } = req.query;
    let sql = 'SELECT * FROM Resources WHERE 1=1';
    const params = [];

    if (location && location !== 'all') {
      sql += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }

    if (hotel && hotel !== 'all') {
      sql += ' AND hotel_name LIKE ?';
      params.push(`%${hotel}%`);
    }

    sql += ' ORDER BY id ASC';
    const rooms = await allAsync(sql, params);
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// 3. Create Reservation (BR1, BR2, BR3, BR4, BR5, BR6, BR7)
app.post('/api/reservations', authMiddleware, async (req, res) => {
  const { roomId, quantity, customerName, phone, checkInDate, checkOutDate } = req.body;
  const user = req.user;

  // BR5: Customer Name cannot be empty. Phone Number must be exactly 10 digits (regex).
  if (!customerName || typeof customerName !== 'string' || customerName.trim() === '') {
    return res.status(400).json({ error: 'Customer Name cannot be empty.' });
  }

  const phoneRegex = /^\d{10}$/;
  if (!phone || typeof phone !== 'string' || !phoneRegex.test(phone.trim())) {
    return res.status(400).json({ error: 'Phone Number must be exactly 10 digits.' });
  }

  // BR1: Quantity must be integer between 1 and 5.
  const qtyNum = Number(quantity);
  if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 5) {
    return res.status(400).json({ error: 'Quantity must be an integer between 1 and 5.' });
  }

  // Date validation
  if (!checkInDate || !checkOutDate) {
    return res.status(400).json({ error: 'Check-in and Check-out dates are required.' });
  }

  if (new Date(checkOutDate) <= new Date(checkInDate)) {
    return res.status(400).json({ error: 'Check-out date must be after Check-in date.' });
  }

  // BR2, BR6 & BR7: Transactional creation with immediate room availability check & deduction
  try {
    await runAsync('BEGIN IMMEDIATE TRANSACTION');

    const room = await getAsync('SELECT * FROM Resources WHERE id = ?', [roomId]);
    if (!room) {
      await runAsync('ROLLBACK');
      return res.status(404).json({ error: 'Selected room does not exist.' });
    }

    if (room.availability < qtyNum) {
      await runAsync('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient availability. Only ${room.availability} room(s) available for ${room.name}.` 
      });
    }

    // BR4: Fare Calculation
    const rateSnapshot = room.rate;
    const baseTotal = rateSnapshot * qtyNum;
    const bookingCharge = baseTotal < 1000 ? 50 : 0;
    const grandTotal = baseTotal + bookingCharge;

    // BR3: Insert CONFIRMED Reservation
    const resResult = await runAsync(
      `INSERT INTO Reservations (user_id, customer_name, phone, base_total, booking_charge, grand_total, status, check_in_date, check_out_date, hotel_name, location)
       VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)`,
      [user.id, customerName.trim(), phone.trim(), baseTotal, bookingCharge, grandTotal, checkInDate, checkOutDate, room.hotel_name, room.location]
    );

    const reservationId = resResult.lastID;

    await runAsync(
      `INSERT INTO ReservationItems (reservation_id, room_id, room_name, quantity, rate_snapshot, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [reservationId, room.id, room.name, qtyNum, rateSnapshot, baseTotal]
    );

    await runAsync(
      `UPDATE Resources SET availability = availability - ? WHERE id = ?`,
      [qtyNum, room.id]
    );

    await runAsync(
      `INSERT INTO StatusHistory (reservation_id, previous_status, new_status, actor_id)
       VALUES (?, NULL, 'CONFIRMED', ?)`,
      [reservationId, user.id]
    );

    await runAsync('COMMIT');

    const newReservation = await getAsync('SELECT * FROM Reservations WHERE id = ?', [reservationId]);
    const items = await allAsync('SELECT * FROM ReservationItems WHERE reservation_id = ?', [reservationId]);

    res.status(201).json({
      message: 'Reservation created successfully',
      reservation: { ...newReservation, items }
    });

  } catch (err) {
    try { await runAsync('ROLLBACK'); } catch (_) {}
    console.error('Booking transaction error:', err);
    res.status(500).json({ error: 'Failed to process reservation due to a database error.' });
  }
});

// 4. Get User Reservations (BR10)
app.get('/api/reservations/my', authMiddleware, async (req, res) => {
  try {
    const reservations = await allAsync(
      `SELECT r.*, ri.room_id, ri.room_name, ri.quantity, ri.rate_snapshot
       FROM Reservations r
       JOIN ReservationItems ri ON r.id = ri.reservation_id
       WHERE r.user_id = ?
       ORDER BY r.id DESC`,
      [req.user.id]
    );
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user reservations' });
  }
});

// 5. Cancel Reservation (BR9 & BR10)
app.post('/api/reservations/:id/cancel', authMiddleware, async (req, res) => {
  const reservationId = req.params.id;
  const user = req.user;

  try {
    await runAsync('BEGIN IMMEDIATE TRANSACTION');

    const reservation = await getAsync('SELECT * FROM Reservations WHERE id = ?', [reservationId]);
    if (!reservation) {
      await runAsync('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found' });
    }

    if (reservation.user_id !== user.id && user.role !== 'admin') {
      await runAsync('ROLLBACK');
      return res.status(403).json({ error: 'Forbidden: You cannot cancel another user\'s booking.' });
    }

    if (reservation.status !== 'CONFIRMED') {
      await runAsync('ROLLBACK');
      return res.status(400).json({ error: `Cannot cancel a reservation that is in '${reservation.status}' status.` });
    }

    if (reservation.capacity_restored === 1) {
      await runAsync('ROLLBACK');
      return res.status(400).json({ error: 'Reservation inventory has already been restored.' });
    }

    const item = await getAsync('SELECT * FROM ReservationItems WHERE reservation_id = ?', [reservationId]);

    await runAsync(
      `UPDATE Reservations SET status = 'CANCELLED', capacity_restored = 1 WHERE id = ?`,
      [reservationId]
    );

    if (item) {
      await runAsync(
        `UPDATE Resources SET availability = availability + ? WHERE id = ?`,
        [item.quantity, item.room_id]
      );
    }

    await runAsync(
      `INSERT INTO StatusHistory (reservation_id, previous_status, new_status, actor_id)
       VALUES (?, ?, 'CANCELLED', ?)`,
      [reservationId, reservation.status, user.id]
    );

    await runAsync('COMMIT');

    res.json({ message: 'Reservation cancelled and inventory restored successfully.' });
  } catch (err) {
    try { await runAsync('ROLLBACK'); } catch (_) {}
    console.error('Cancellation error:', err);
    res.status(500).json({ error: 'Failed to cancel reservation.' });
  }
});

// 6. Admin Get All Reservations (BR8, BR10)
app.get('/api/admin/reservations', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }

  try {
    const reservations = await allAsync(
      `SELECT r.*, ri.room_id, ri.room_name, ri.quantity, ri.rate_snapshot
       FROM Reservations r
       JOIN ReservationItems ri ON r.id = ri.reservation_id
       ORDER BY r.id DESC`
    );

    const history = await allAsync(
      `SELECT * FROM StatusHistory ORDER BY changed_at ASC`
    );

    res.json({ reservations, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin reservations' });
  }
});

// 7. Admin Advance Status (BR8)
app.post('/api/admin/reservations/:id/advance', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }

  const reservationId = req.params.id;

  try {
    await runAsync('BEGIN IMMEDIATE TRANSACTION');

    const reservation = await getAsync('SELECT * FROM Reservations WHERE id = ?', [reservationId]);
    if (!reservation) {
      await runAsync('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found' });
    }

    let nextStatus = null;
    if (reservation.status === 'CONFIRMED') {
      nextStatus = 'CHECKED_IN';
    } else if (reservation.status === 'CHECKED_IN') {
      nextStatus = 'COMPLETED';
    } else {
      await runAsync('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot advance status from '${reservation.status}'. Only sequential transitions (CONFIRMED -> CHECKED_IN -> COMPLETED) are permitted.` 
      });
    }

    await runAsync(
      `UPDATE Reservations SET status = ? WHERE id = ?`,
      [nextStatus, reservationId]
    );

    await runAsync(
      `INSERT INTO StatusHistory (reservation_id, previous_status, new_status, actor_id)
       VALUES (?, ?, ?, ?)`,
      [reservationId, reservation.status, nextStatus, req.user.id]
    );

    await runAsync('COMMIT');

    res.json({ message: `Status advanced successfully to ${nextStatus}` });
  } catch (err) {
    try { await runAsync('ROLLBACK'); } catch (_) {}
    console.error('Advance status error:', err);
    res.status(500).json({ error: 'Failed to advance status' });
  }
});

// Initialize DB and start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`InnControl Server listening on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
