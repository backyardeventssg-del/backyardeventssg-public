-- If you already ran an older version of this file, run these two lines first
-- to start fresh (this deletes existing events and bookings):
-- DROP TABLE IF EXISTS bookings;
-- DROP TABLE IF EXISTS events;
-- Or, to keep existing data and only add the new Instagram/Facebook column:
-- ALTER TABLE bookings ADD COLUMN social TEXT DEFAULT '';
-- ALTER TABLE bookings ADD COLUMN pay_id TEXT DEFAULT '';
-- ALTER TABLE bookings ADD COLUMN pay_url TEXT DEFAULT '';
-- ALTER TABLE bookings ADD COLUMN category TEXT DEFAULT '';
-- (the contacts table below is new: run its CREATE TABLE statement on its own)
-- Already have a live database from before the vendor line-up, terms, waitlist and shopper list were added?
-- Run upgrade.sql instead of anything above.

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT DEFAULT 'Craft fair',
  theme TEXT DEFAULT '',        -- Sustainability / Handmade / Festive: Chinese New Year / Festive: Christmas
  start_date TEXT NOT NULL,     -- YYYY-MM-DD
  end_date TEXT NOT NULL,
  venue TEXT DEFAULT '',
  slots INTEGER DEFAULT 0,      -- total booths available, 0 = don't show a count
  description TEXT DEFAULT '',
  booths TEXT DEFAULT '[]',     -- JSON: [{name, size, weekend, week}] prices in S$, 0 = not offered
  includes TEXT DEFAULT '',     -- what's provided, one item per line
  images TEXT DEFAULT '[]',     -- JSON: [{key, kind: "space" | "layout"}]
  apply INTEGER DEFAULT 0,      -- 1 = vendors apply first and you approve them (curated market)
  pack TEXT DEFAULT '',         -- vendor info pack text (load-in, parking...), shown only through a private link
  pack_token TEXT DEFAULT '',   -- the secret in that link
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  booth_type TEXT DEFAULT '',
  duration TEXT DEFAULT '',      -- Weekend / Full week
  total INTEGER DEFAULT 0,       -- price x booths, worked out by the server
  name TEXT NOT NULL,
  business TEXT DEFAULT '',
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  social TEXT DEFAULT '',        -- optional Instagram / Facebook link
  category TEXT DEFAULT '',      -- brand category chosen by the vendor (Food & beverage, Jewellery & accessories...)
  pay_id TEXT DEFAULT '',        -- HitPay payment request id
  pay_url TEXT DEFAULT '',       -- HitPay payment link sent to the vendor
  qty INTEGER DEFAULT 1,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'New',    -- New / Applied / Waitlist / Approved / Contacted / Paid / Declined / Cancelled
  show_public INTEGER DEFAULT 0, -- 1 = list this vendor on the event page line-up
  terms_at TEXT DEFAULT '',      -- when the vendor accepted the terms
  terms_ver TEXT DEFAULT '',     -- which version of the terms they accepted
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  business TEXT DEFAULT '',
  category TEXT DEFAULT 'Other', -- brand category, same list as the booking form
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  social TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Site content edited from the admin "Site content" tab (one row, key = 'site').
-- For an existing database, run just this one statement in the D1 console.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Shoppers who joined the WhatsApp list.
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,   -- digits only, with country code
  created_at TEXT DEFAULT (datetime('now'))
);
