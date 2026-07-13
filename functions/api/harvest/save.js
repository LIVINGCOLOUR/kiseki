import { createRecordId, errorJson, json, requireFarm } from "../../_utils.js";

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;

  let body;
  try { body = await context.request.json(); }
  catch (error) { return errorJson("記録を読み取れませんでした。", 400); }

  const date = String(body.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorJson("投稿日は YYYY-MM-DD 形式で指定してください。", 400);

  const productName = String(body.productName || "").trim();
  const recordId = createRecordId(auth.farmId, productName, date);
  const title = String(body.title || "").trim() || "今日の軌跡";
  const overlayText = String(body.overlayText || "").trim().slice(0, 40);
  const note = String(body.note || "").trim().slice(0, 1200);
  const videoUrl = String(body.videoUrl || "").trim();
  const videoThumbnailUrl = String(body.videoThumbnailUrl || "").trim();
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls : [];
  const profileUrl = `/farmer.html?id=${encodeURIComponent(auth.farmId)}`;
  const now = new Date().toISOString();

  await context.env.DB.prepare(
    `INSERT INTO harvest_records
      (id, farmer_id, date, product_name, title, overlay_text, note, video_url, video_thumbnail_url, photo_urls_json, profile_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       product_name = excluded.product_name,
       title = excluded.title,
       overlay_text = excluded.overlay_text,
       note = excluded.note,
       video_url = excluded.video_url,
       video_thumbnail_url = excluded.video_thumbnail_url,
       photo_urls_json = excluded.photo_urls_json,
       profile_url = excluded.profile_url,
       updated_at = excluded.updated_at`
  ).bind(recordId, auth.farmId, date, productName, title, overlayText, note, videoUrl, videoThumbnailUrl, JSON.stringify(photoUrls), profileUrl, now, now).run();

  return json({ ok: true, record: { id: recordId, farmerId: auth.farmId, date, productName, title, overlayText, note, videoUrl, videoThumbnailUrl, photoUrls, profileUrl } });
}
