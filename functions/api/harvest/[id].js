import { errorJson, json } from "../../_utils.js";

export async function onRequestGet(context) {
  const id = String(context.params.id || "");
  const row = await context.env.DB.prepare("SELECT * FROM harvest_records WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return errorJson("収穫記録が見つかりません。", 404);

  const farmer = await context.env.DB.prepare("SELECT * FROM farmers WHERE id = ?")
    .bind(row.farmer_id)
    .first();

  return json({ ok: true, record: normalizeRecord(row), farmer: normalizeFarmer(farmer) });
}

function normalizeRecord(row) {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    date: row.date,
    productName: row.product_name || "",
    title: row.title || "",
    note: row.note || "",
    videoUrl: row.video_url || "",
    videoThumbnailUrl: row.video_thumbnail_url || "",
    photoUrls: safeJson(row.photo_urls_json, []),
    profileUrl: row.profile_url || "",
  };
}

function normalizeFarmer(row) {
  return row
    ? {
        id: row.id,
        name: row.name,
        area: row.area || "",
        description: row.description || "",
        imageUrl: row.image_url || "",
      }
    : null;
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

