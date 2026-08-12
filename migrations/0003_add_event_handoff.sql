CREATE TABLE IF NOT EXISTS kiseki_events (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  title TEXT DEFAULT '',
  common_video_url TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  expires_at TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_id) REFERENCES farmers(id)
);

CREATE TABLE IF NOT EXISTS kiseki_event_cards (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  card_code TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'unused',
  handoff_video_url TEXT DEFAULT '',
  final_video_url TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES kiseki_events(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_cards_code ON kiseki_event_cards (event_id, card_code);
CREATE INDEX IF NOT EXISTS idx_event_cards_event ON kiseki_event_cards (event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_farmer_date ON kiseki_events (farmer_id, event_date DESC);
