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

CREATE INDEX IF NOT EXISTS idx_harvest_records_farmer_date ON harvest_records (farmer_id, date DESC);

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

CREATE INDEX IF NOT EXISTS idx_analytics_record_event ON analytics_events (record_id, event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_farmer_created ON analytics_events (farmer_id, created_at DESC);

INSERT OR IGNORE INTO farmers (id, name, area, description, image_url, links_json, is_public) VALUES
  ('id-01', 'やまだ農園', '茨城県石岡市八郷', 'やまだ農園は、茨城県石岡市八郷の里山で、季節の野菜を育てています。自然のリズムに寄り添い、落ち葉や草、緑肥、敷きわらなど、身近な植物の力を生かした土づくりを大切にしています。農業は、ただ作物を育てるだけのものではなく、自然や地域、人とのつながりの中にあるもの。八郷のかや屋根の家や地域の人たちとの関わりも大切にしながら、野菜と一緒に、里山の時間を届けています。', 'https://c9705a53.shizenha-yasai-map.pages.dev/assets/images/yamada/yamada01.jpg', '[{"label":"公式サイト","url":"https://yasatoyamadanouen.amebaownd.com/"},{"label":"Instagram","url":"https://www.instagram.com/yamadanouen/"}]', 1),
  ('id-02', '作り手 2', '', '運用実証用の作り手アカウントです。', '', '[]', 1),
  ('id-03', '作り手 3', '', '運用実証用の作り手アカウントです。', '', '[]', 1),
  ('id-04', '作り手 4', '', '運用実証用の作り手アカウントです。', '', '[]', 1),
  ('id-05', '作り手 5', '', '運用実証用の作り手アカウントです。', '', '[]', 1);

INSERT OR IGNORE INTO harvest_records (id, farmer_id, date, product_name, title, note, video_url, video_thumbnail_url, photo_urls_json, profile_url) VALUES (
  'id-01-demo-2026-06-21',
  'id-01',
  '2026-06-21',
  '',
  '今日の軌跡',
  '運用実証用のサンプル記録です。動画や写真を保存すると、このページに今日の背景が表示されます。',
  '',
  '',
  '[]',
  '/farmer.html?id=id-01'
);