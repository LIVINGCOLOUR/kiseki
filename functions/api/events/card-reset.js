import { errorJson, json, requireFarm, sanitizeSegment } from "../../_utils.js";

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;

  let body;
  try { body = await context.request.json(); }
  catch { return errorJson("入力を読み取れませんでした。", 400); }

  const eventId = String(body.eventId || "").trim();
  const cardId = String(body.cardId || "").trim();
  if (!eventId || !cardId) return errorJson("イベントまたはカードが指定されていません。", 400);

  const card = await context.env.DB.prepare(
    `SELECT c.id
       FROM kiseki_event_cards c
       JOIN kiseki_events e ON e.id = c.event_id
      WHERE c.id = ? AND c.event_id = ? AND e.farmer_id = ?`
  ).bind(cardId, eventId, auth.farmId).first();
  if (!card) return errorJson("カードが見つかりません。", 404);

  const prefix = `events/${sanitizeSegment(auth.farmId)}/${sanitizeSegment(eventId)}/${sanitizeSegment(cardId)}/`;
  if (context.env.MEDIA_BUCKET?.list && context.env.MEDIA_BUCKET?.delete) {
    const listed = await context.env.MEDIA_BUCKET.list({ prefix, limit: 100 });
    const keys = (listed.objects || []).map((object) => object.key);
    if (keys.length) await context.env.MEDIA_BUCKET.delete(keys);
  }

  await context.env.DB.prepare(
    "UPDATE kiseki_event_cards SET handoff_video_url = '', final_video_url = '', status = 'unused', updated_at = ? WHERE id = ? AND event_id = ?"
  ).bind(new Date().toISOString(), cardId, eventId).run();

  return json({ ok: true, cardId });
}
