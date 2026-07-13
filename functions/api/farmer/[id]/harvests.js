import { errorJson, isAllowedFarmId, json } from "../../../_utils.js";

export async function onRequestGet(context) {
  const farmId = String(context.params.id || "");
  if (!isAllowedFarmId(farmId)) return errorJson("プロフィールが見つかりません。", 404);
  const result = await context.env.DB.prepare("SELECT * FROM harvest_records WHERE farmer_id = ? ORDER BY date DESC, created_at DESC LIMIT 30")
    .bind(farmId)
    .all();
  return json({ ok: true, records: (result.results || []).map(normalizeRecord) });
}

function normalizeRecord(row) {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    date: row.date,
    productName: row.product_name || "",
    title: row.title || "",
    overlayText: row.overlay_text || "",
    note: row.note || "",
    videoUrl: row.video_url || "",
    videoThumbnailUrl: row.video_thumbnail_url || "",
    photoUrls: safeJson(row.photo_urls_json, []),
    profileUrl: row.profile_url || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch (error) { return fallback; }
}
