import { json, requireFarm } from "../../_utils.js";

export async function onRequestGet(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;

  const records = await context.env.DB.prepare(
    `SELECT id, product_name, date, title
     FROM harvest_records
     WHERE farmer_id = ?
     ORDER BY date DESC, created_at DESC
     LIMIT 100`
  )
    .bind(auth.farmId)
    .all();

  const counts = await context.env.DB.prepare(
    `SELECT record_id, event_name, COUNT(*) AS count
     FROM analytics_events
     WHERE farmer_id = ?
     GROUP BY record_id, event_name`
  )
    .bind(auth.farmId)
    .all();

  const videoSessions = await context.env.DB.prepare(
    `SELECT record_id, session_id,
            MAX(CASE WHEN event_name = 'video_play' THEN 1 ELSE 0 END) AS played,
            MAX(CASE WHEN event_name = 'video_ended' THEN 1 ELSE 0 END) AS ended
     FROM analytics_events
     WHERE farmer_id = ?
       AND event_name IN ('video_play', 'video_ended')
       AND session_id IS NOT NULL
       AND session_id != ''
     GROUP BY record_id, session_id`
  )
    .bind(auth.farmId)
    .all();

  const countMap = new Map();
  (counts.results || []).forEach((row) => {
    countMap.set(`${row.record_id}:${row.event_name}`, Number(row.count || 0));
  });

  const videoMap = new Map();
  (videoSessions.results || []).forEach((row) => {
    const current = videoMap.get(row.record_id) || { plays: 0, ended: 0 };
    const played = Number(row.played || 0) > 0;
    const ended = Number(row.ended || 0) > 0;
    if (played) current.plays += 1;
    if (played && ended) current.ended += 1;
    videoMap.set(row.record_id, current);
  });

  const rows = (records.results || []).map((record) => {
    const pageViews = countMap.get(`${record.id}:page_view`) || 0;
    const video = videoMap.get(record.id) || { plays: 0, ended: 0 };
    const videoPlays = video.plays;
    const videoEnded = Math.min(video.ended, videoPlays);
    const profileClicks = countMap.get(`${record.id}:profile_click`) || 0;
    const likeClicks = countMap.get(`${record.id}:like_click`) || 0;
    return {
      id: record.id,
      productName: record.product_name || "",
      date: record.date,
      title: record.title || "",
      pageViews,
      videoPlays,
      videoEnded,
      profileClicks,
      likeClicks,
      playRate: pageViews ? videoPlays / pageViews : 0,
      completionRate: videoPlays ? videoEnded / videoPlays : 0,
      profileClickRate: pageViews ? profileClicks / pageViews : 0,
    };
  });

  return json({ ok: true, rows });
}
