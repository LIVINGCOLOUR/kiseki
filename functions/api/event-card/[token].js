import { errorJson, json } from "../../_utils.js";

export async function onRequestGet(context) {
  const token = String(context.params.token || "");
  const row = await context.env.DB.prepare(
    `SELECT c.card_code, c.status, c.handoff_video_url, c.final_video_url,
            e.name, e.event_date, e.title, e.overlay_text, e.thumbnail_url, e.common_video_url, e.expires_at,
            f.name AS farmer_name, f.id AS farmer_id
       FROM kiseki_event_cards c
       JOIN kiseki_events e ON e.id = c.event_id
       JOIN farmers f ON f.id = e.farmer_id
      WHERE c.token = ?`
  ).bind(token).first();
  if (!row) return errorJson("このQRコードは見つかりません。", 404);
  if (row.expires_at && Date.now() > Date.parse(row.expires_at) + 24 * 60 * 60 * 1000) return errorJson("このQRコードの公開期間は終了しました。", 410);
  return json({ ok: true, card: { cardCode: row.card_code, status: row.status, commonVideoUrl: row.common_video_url, handoffVideoUrl: row.handoff_video_url, finalVideoUrl: row.final_video_url, eventName: row.name, eventDate: row.event_date, title: row.title, overlayText: row.overlay_text || "", thumbnailUrl: row.thumbnail_url || "", farmerName: row.farmer_name, farmerId: row.farmer_id } });
}
