CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  capability_hash TEXT NOT NULL,
  organizer_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('hokkaido','tohoku','kanto','chubu','kansai','chugoku','shikoku','kyushu')),
  prefecture TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('festival','flea','handmade','marche','other')),
  vendor_types TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('both','indoor','outdoor')),
  fee_type TEXT NOT NULL CHECK (fee_type IN ('free','paid','unknown')),
  fee_min INTEGER NOT NULL,
  fee_max INTEGER NOT NULL,
  selection_type TEXT NOT NULL CHECK (selection_type IN ('first','lottery','screening','unknown')),
  application_method TEXT NOT NULL CHECK (application_method IN ('email','form','other')),
  source_url TEXT NOT NULL,
  source_url_hash TEXT NOT NULL UNIQUE,
  deadline TEXT NOT NULL,
  event_start TEXT NOT NULL,
  event_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','hidden')),
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX opportunities_directory ON opportunities(status, deadline, event_start, updated_at);
CREATE INDEX opportunities_filters ON opportunities(region, event_type, environment, fee_type, selection_type);

CREATE TABLE opportunity_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('closed','harmful','impersonation','other')),
  created_at INTEGER NOT NULL,
  is_qa INTEGER NOT NULL DEFAULT 0 CHECK (is_qa IN (0,1)),
  UNIQUE(opportunity_id, session_id),
  UNIQUE(opportunity_id, reporter_hash)
);

CREATE TABLE product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name IN ('visited','directory_searched','opportunity_created','opportunity_opened','source_opened','opportunity_updated','opportunity_closed','opportunity_deleted','opportunity_reported','returned')),
  session_id TEXT NOT NULL,
  opportunity_id TEXT,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_qa INTEGER NOT NULL DEFAULT 0 CHECK (is_qa IN (0,1))
);

CREATE INDEX product_events_metrics ON product_events(is_qa, name, day, session_id);
CREATE INDEX product_events_retention ON product_events(created_at);
