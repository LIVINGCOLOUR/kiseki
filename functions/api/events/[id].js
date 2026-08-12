import { errorJson, json, requireFarm } from "../../_utils.js";

export async function onRequestGet(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  const id = String(context.params.id || "");
  const event = await context.env.DB.prepare("SELECT * FROM kiseki_events WHERE id = ? AND farmer_id = ?").bind(id, auth.farmId).first();
  if (!event) return errorJson("イベントが見つかりません。", 404);
  const result = await context.env.DB.prepare("SELECT id, card_code, token, status, handoff_video_url, final_video_url FROM kiseki_event_cards WHERE event_id = ? ORDER BY card_code").bind(id).all();
  return json({ ok: true, event: { id: event.id, name: event.name, eventDate: event.event_date, title: event.title, overlayText: event.overlay_text || "", commonVideoUrl: event.common_video_url, status: event.status, expiresAt: event.expires_at }, cards: (result.results || []).map((row) => ({ id: row.id, cardCode: row.card_code, token: row.token, status: row.status, handoffVideoUrl: row.handoff_video_url, finalVideoUrl: row.final_video_url })) });
}

export async function onRequestPatch(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  const id = String(context.params.id || "");
  const event = await context.env.DB.prepare("SELECT * FROM kiseki_events WHERE id = ? AND farmer_id = ?").bind(id, auth.farmId).first();
  if (!event) return errorJson("イベントが見つかりません。", 404);
  let body;
  try { body = await context.request.json(); } catch { return errorJson("入力を読み取れませんでした。", 400); }
  const name = String(body.name ?? event.name).trim().slice(0, 80);
  const eventDate = String(body.eventDate ?? event.event_date).trim();
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return errorJson("イベント名または開催日が正しくありません。", 400);
  const commonVideoUrl = String(body.commonVideoUrl ?? event.common_video_url ?? "").trim();
  const status = String(body.status || event.status).trim().slice(0, 20);
  const title = String(body.title ?? event.title).trim().slice(0, 120);
  const overlayText = String(body.overlayText ?? event.overlay_text ?? "").trim().slice(0, 40);
  await context.env.DB.prepare("UPDATE kiseki_events SET name = ?, event_date = ?, common_video_url = ?, status = ?, title = ?, overlay_text = ?, updated_at = ? WHERE id = ? AND farmer_id = ?")
    .bind(name, eventDate, commonVideoUrl, status, title, overlayText, new Date().toISOString(), id, auth.farmId).run();
  return json({ ok: true, name, eventDate, commonVideoUrl, status, title, overlayText });
}

export async function onRequestDelete(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  const id = String(context.params.id || "");
  const event = await context.env.DB.prepare("SELECT id FROM kiseki_events WHERE id = ? AND farmer_id = ?").bind(id, auth.farmId).first();
  if (!event) return errorJson("イベントが見つかりません。", 404);
  const cards = await context.env.DB.prepare("SELECT id FROM kiseki_event_cards WHERE event_id = ?").bind(id).all();
  await context.env.DB.prepare("DELETE FROM kiseki_event_cards WHERE event_id = ?").bind(id).run();
  await context.env.DB.prepare("DELETE FROM kiseki_events WHERE id = ? AND farmer_id = ?").bind(id, auth.farmId).run();
  if (context.env.MEDIA_BUCKET?.list && context.env.MEDIA_BUCKET?.delete) {
    const listed = await context.env.MEDIA_BUCKET.list({ prefix: `events/${auth.farmId}/${id}/`, limit: 1000 });
    const keys = (listed.objects || []).map((object) => object.key);
    if (keys.length) await context.env.MEDIA_BUCKET.delete(keys);
  }
  return json({ ok: true, deletedCards: cards.results?.length || 0 });
}
