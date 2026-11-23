-- Run this once in the D1 console if your database was created before these features were added:
-- terms tick-box, waitlist, vendor applications, vendor info pack, vendor line-up, WhatsApp shopper list.
-- Run the statements one at a time. If one says "duplicate column name", that part is already done: carry on with the next.

ALTER TABLE events ADD COLUMN apply INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN pack TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN pack_token TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN show_public INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN terms_at TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN terms_ver TEXT DEFAULT '';
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
-- Also needed if you haven't yet added the Site content tab:
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
