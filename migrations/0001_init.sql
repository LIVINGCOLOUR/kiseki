CREATE TABLE IF NOT EXISTS farmers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  links_json TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS harvest_records (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL,
  date TEXT NOT NULL,
  product_name TEXT DEFAULT '',
  title TEXT DEFAULT '',
  note TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  video_thumbnail_url TEXT DEFAULT '',
  photo_urls_json TEXT DEFAULT '[]',
  profile_url TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_id) REFERENCES farmers(id)
);

CREATE INDEX IF NOT EXISTS idx_harvest_records_farmer_date
  ON harvest_records (farmer_id, date DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  record_id TEXT DEFAULT '',
  farmer_id TEXT DEFAULT '',
  session_id TEXT DEFAULT '',
  page_path TEXT DEFAULT '',
  user_agent_summary TEXT DEFAULT '',
  referrer TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_record_event
  ON analytics_events (record_id, event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_farmer_created
  ON analytics_events (farmer_id, created_at DESC);

INSERT OR IGNORE INTO farmers (id, name, area, description, is_public) VALUES
  ('farm-01', '〇〇農園 1', '', '運用実証用の農園アカウントです。', 1),
  ('farm-02', '〇〇農園 2', '', '運用実証用の農園アカウントです。', 1),
  ('farm-03', '〇〇農園 3', '', '運用実証用の農園アカウントです。', 1),
  ('farm-04', '〇〇農園 4', '', '運用実証用の農園アカウントです。', 1),
  ('farm-05', '〇〇農園 5', '', '運用実証用の農園アカウントです。', 1);

INSERT OR IGNORE INTO harvest_records (
  id,
  farmer_id,
  date,
  product_name,
  title,
  note,
  video_url,
  video_thumbnail_url,
  photo_urls_json,
  profile_url
) VALUES (
  'farm-01-demo-2026-06-21',
  'farm-01',
  '2026-06-21',
  'デモ野菜',
  'デモ野菜｜今日の畑の様子',
  '運用実証用のサンプル記録です。動画を保存すると、このページに30秒動画が表示されます。',
  '',
  '',
  '[]',
  '/farmer.html?id=farm-01'
);
