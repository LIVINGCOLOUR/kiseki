import { errorJson, isUploadedFile, json, requireFarm, sanitizeSegment } from "../../_utils.js";

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
function safeExt(file) {
  const name = String(file?.name || "").toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/);
  return (match?.[1] || "mp4").replace("quicktime", "mov");
}

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  if (!context.env.MEDIA_BUCKET) return errorJson("MEDIA_BUCKET が未設定です。", 500);
  let form;
  try { form = await context.request.formData(); } catch { return errorJson("アップロードを読み取れませんでした。", 400); }
  const eventId = sanitizeSegment(form.get("eventId"), "event");
  const cardId = String(form.get("cardId") || "").trim();
  const kind = String(form.get("kind") || "common").trim();
  const isThumbnail = kind === "thumbnail";
  const video = form.get(isThumbnail ? "image" : "video");
  if (!isUploadedFile(video) || video.size > MAX_VIDEO_BYTES) return errorJson("動画ファイルが大きすぎるか、選択されていません。", 413);
  const event = await context.env.DB.prepare("SELECT id FROM kiseki_events WHERE id = ? AND farmer_id = ?").bind(eventId, auth.farmId).first();
  if (!event) return errorJson("イベントが見つかりません。", 404);
  if (!context.env.MEDIA_BUCKET || typeof context.env.MEDIA_BUCKET.put !== "function") return errorJson("メディア保存先が利用できません。", 500);
  let key;
  if (isThumbnail) key = `events/${sanitizeSegment(auth.farmId)}/${eventId}/thumbnail.${safeExt(video)}`;
  else if (kind === "common") key = `events/${sanitizeSegment(auth.farmId)}/${eventId}/common.${safeExt(video)}`;
  else {
    const card = await context.env.DB.prepare("SELECT id FROM kiseki_event_cards WHERE id = ? AND event_id = ?").bind(cardId, eventId).first();
    if (!card) return errorJson("QRカードが見つかりません。", 404);
    key = `events/${sanitizeSegment(auth.farmId)}/${eventId}/${sanitizeSegment(cardId)}/${kind === "handoff" ? "handoff" : "video"}.${safeExt(video)}`;
  }
  await context.env.MEDIA_BUCKET.put(key, await video.arrayBuffer(), { httpMetadata: { contentType: video.type || "video/mp4" } });
  const url = `/api/media/${key}?v=${Date.now()}`;
  const now = new Date().toISOString();
  if (isThumbnail) await context.env.DB.prepare("UPDATE kiseki_events SET thumbnail_url = ?, updated_at = ? WHERE id = ? AND farmer_id = ?").bind(url, now, eventId, auth.farmId).run();
  else if (kind === "common") await context.env.DB.prepare("UPDATE kiseki_events SET common_video_url = ?, status = 'ready', updated_at = ? WHERE id = ? AND farmer_id = ?").bind(url, now, eventId, auth.farmId).run();
  else if (kind === "handoff") await context.env.DB.prepare("UPDATE kiseki_event_cards SET handoff_video_url = ?, status = 'ready', updated_at = ? WHERE id = ? AND event_id = ?").bind(url, now, cardId, eventId).run();
  else await context.env.DB.prepare("UPDATE kiseki_event_cards SET final_video_url = ?, status = 'ready', updated_at = ? WHERE id = ? AND event_id = ?").bind(url, now, cardId, eventId).run();
  return json({ ok: true, url, kind });
}
