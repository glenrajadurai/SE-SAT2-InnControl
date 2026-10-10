const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'staypulse.db');
const db = new sqlite3.Database(dbPath);

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  db.serialize();

  await runAsync('PRAGMA foreign_keys = ON');

  // 1. Users Table with passwords
  await runAsync(`
    CREATE TABLE IF NOT EXISTS Users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT 'user123',
      role TEXT NOT NULL CHECK(role IN ('user', 'admin'))
    );
  `);

  try { await runAsync(`ALTER TABLE Users ADD COLUMN password TEXT NOT NULL DEFAULT 'user123'`); } catch (e) {}

  // Update existing seeded records or insert if missing
  await runAsync(`INSERT OR IGNORE INTO Users (id, name, password, role) VALUES ('user1', 'User One', 'user123', 'user')`);
  await runAsync(`INSERT OR IGNORE INTO Users (id, name, password, role) VALUES ('user2', 'User Two', 'user123', 'user')`);
  await runAsync(`INSERT OR IGNORE INTO Users (id, name, password, role) VALUES ('admin1', 'Admin One', 'admin123', 'admin')`);

  await runAsync(`UPDATE Users SET password = 'user123' WHERE id IN ('user1', 'user2')`);
  await runAsync(`UPDATE Users SET password = 'admin123' WHERE id = 'admin1'`);

  // 2. Resources Table (Rooms)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS Resources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rate INTEGER NOT NULL,
      availability INTEGER NOT NULL CHECK(availability >= 0),
      hotel_name TEXT DEFAULT 'InnControl Grand Hotel',
      location TEXT DEFAULT 'City Center, Bengaluru'
    );
  `);

  try { await runAsync(`ALTER TABLE Resources ADD COLUMN hotel_name TEXT DEFAULT 'InnControl Grand Hotel'`); } catch (e) {}
  try { await runAsync(`ALTER TABLE Resources ADD COLUMN location TEXT DEFAULT 'City Center, Bengaluru'`); } catch (e) {}

  const seedRooms = [
    { id: 'R101', name: 'Room A', rate: 499, availability: 10, hotel_name: 'InnControl Grand Hotel', location: 'MG Road, Bengaluru' },
    { id: 'R102', name: 'Room B', rate: 799, availability: 5, hotel_name: 'InnControl Luxury Suites', location: 'Indiranagar, Bengaluru' },
    { id: 'R103', name: 'Room C', rate: 199, availability: 20, hotel_name: 'InnControl Express Stay', location: 'Koramangala, Bengaluru' },
    { id: 'R104', name: 'Room D', rate: 1299, availability: 0, hotel_name: 'InnControl Royal Palace', location: 'UB City, Bengaluru' },
    { id: 'R105', name: 'Room E', rate: 1000, availability: 3, hotel_name: 'InnControl Business Resort', location: 'Whitefield, Bengaluru' }
  ];

  for (const room of seedRooms) {
    await runAsync(
      `INSERT OR IGNORE INTO Resources (id, name, rate, availability, hotel_name, location) VALUES (?, ?, ?, ?, ?, ?)`,
      [room.id, room.name, room.rate, room.availability, room.hotel_name, room.location]
    );
  }

  // 3. Reservations Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS Reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      base_total INTEGER NOT NULL,
      booking_charge INTEGER NOT NULL,
      grand_total INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED')),
      capacity_restored INTEGER NOT NULL DEFAULT 0,
      check_in_date TEXT,
      check_out_date TEXT,
      hotel_name TEXT,
      location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id)
    );
  `);

  try { await runAsync(`ALTER TABLE Reservations ADD COLUMN check_in_date TEXT`); } catch (e) {}
  try { await runAsync(`ALTER TABLE Reservations ADD COLUMN check_out_date TEXT`); } catch (e) {}
  try { await runAsync(`ALTER TABLE Reservations ADD COLUMN hotel_name TEXT`); } catch (e) {}
  try { await runAsync(`ALTER TABLE Reservations ADD COLUMN location TEXT`); } catch (e) {}

  // 4. ReservationItems Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS ReservationItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL,
      room_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      rate_snapshot INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      FOREIGN KEY (reservation_id) REFERENCES Reservations(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES Resources(id)
    );
  `);

  // 5. StatusHistory Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS StatusHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES Reservations(id) ON DELETE CASCADE
    );
  `);

  console.log('Database initialized successfully with user credentials, schema, and seed data.');
}

module.exports = {
  db,
  initDb,
  runAsync,
  getAsync,
  allAsync
};
