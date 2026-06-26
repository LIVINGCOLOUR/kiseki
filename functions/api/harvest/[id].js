import { errorJson, json, requireFarm } from "../../_utils.js";

export async function onRequestGet(context) {
  const id = String(context.params.id || "");
  const row = await context.env.DB.prepare("SELECT * FROM harvest_records WHERE id = ?").bind(id).first();
  if (!row) return errorJson("記録が見つかりません。", 404);

  const farmer = await context.env.DB.prepare("SELECT * FROM farmers WHERE id = ?").bind(row.farmer_id).first();
  return json({ ok: true, record: normalizeRecord(row), farmer: normalizeFarmer(farmer) });
}

export async function onRequestDelete(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;

  const id = String(context.params.id || "");
  const row = await context.env.DB.prepare("SELECT * FROM harvest_records WHERE id = ?").bind(id).first();
  if (!row) return errorJson("record not found", 404);
  if (row.farmer_id !== auth.farmId) return errorJson("forbidden", 403);

  await deleteRecordMedia(context.env, row);
  await context.env.DB.prepare("DELETE FROM harvest_records WHERE id = ? AND farmer_id = ?").bind(id, auth.farmId).run();
  return json({ ok: true, deletedId: id });
}

async function deleteRecordMedia(env, row) {
  if (!env.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.delete !== "function") return;
  const urls = [row.video_url, row.video_thumbnail_url, ...safeJson(row.photo_urls_json, [])];
  const keys = Array.from(new Set(urls.map(mediaKeyFromUrl).filter(Boolean)));
  await Promise.all(keys.map(async (key) => {
    try { await env.MEDIA_BUCKET.delete(key); }
    catch (error) { console.error("R2 media delete failed", { key, message: error?.message || String(error) }); }
  }));
}

function mediaKeyFromUrl(url) {
  const value = String(url || "");
  const marker = "/api/media/";
  const index = value.indexOf(marker);
  if (index < 0) return "";
  try { return decodeURIComponent(value.slice(index + marker.length)); }
  catch (error) { return value.slice(index + marker.length); }
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
  return row ? {
    id: row.id,
    name: row.name,
    area: row.area || "",
    description: row.description || "",
    imageUrl: row.image_url || "",
    links: safeJson(row.links_json, []),
  } : null;
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch (error) { return fallback; }
}