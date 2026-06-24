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

  const countMap = new Map();
  (counts.results || []).forEach((row) => {
    countMap.set(`${row.record_id}:${row.event_name}`, Number(row.count || 0));
  });

  const rows = (records.results || []).map((record) => {
    const pageViews = countMap.get(`${record.id}:page_view`) || 0;
    const videoPlays = countMap.get(`${record.id}:video_play`) || 0;
    const videoEnded = countMap.get(`${record.id}:video_ended`) || 0;
    const profileClicks = countMap.get(`${record.id}:profile_click`) || 0;
    return {
      id: record.id,
      productName: record.product_name || "",
      date: record.date,
      title: record.title || "",
      pageViews,
      videoPlays,
      videoEnded,
      profileClicks,
      playRate: pageViews ? videoPlays / pageViews : 0,
      completionRate: videoPlays ? videoEnded / videoPlays : 0,
      profileClickRate: pageViews ? profileClicks / pageViews : 0,
    };
  });

  return json({ ok: true, rows });
}

