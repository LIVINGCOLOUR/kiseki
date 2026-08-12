import { errorJson, json, requireFarm } from "../../_utils.js";

export async function onRequestGet(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  const result = await context.env.DB.prepare(
    `SELECT id, name, event_date, title, overlay_text, common_video_url, status, expires_at, created_at
       FROM kiseki_events WHERE farmer_id = ? ORDER BY event_date DESC, created_at DESC LIMIT 100`
  ).bind(auth.farmId).all();
  return json({ ok: true, events: (result.results || []).map((row) => ({ id: row.id, name: row.name, eventDate: row.event_date, title: row.title, overlayText: row.overlay_text || "", commonVideoUrl: row.common_video_url, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at })) });
}
