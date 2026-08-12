import { errorJson, json, requireFarm, sanitizeSegment } from "../../_utils.js";

function randomToken(bytes = 18) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  let body;
  try { body = await context.request.json(); } catch { return errorJson("入力を読み取れませんでした。", 400); }
  const name = String(body.name || "").trim().slice(0, 80);
  const eventDate = String(body.eventDate || "").trim();
  const title = String(body.title || "").trim().slice(0, 120);
  const overlayText = String(body.overlayText || "").trim().slice(0, 40);
  const count = Math.max(1, Math.min(100, Number(body.count) || 20));
  if (!name) return errorJson("イベント名を入力してください。", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return errorJson("開催日は YYYY-MM-DD 形式で指定してください。", 400);

  const eventId = `event-${randomToken(10)}`;
  const now = new Date().toISOString();
  const expiresAt = `${eventDate}T23:59:59.000Z`;
  await context.env.DB.prepare(
    `INSERT INTO kiseki_events (id, farmer_id, name, event_date, title, overlay_text, expires_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
  ).bind(eventId, auth.farmId, name, eventDate, title, overlayText, expiresAt, now, now).run();

  const cards = [];
  for (let index = 1; index <= count; index += 1) {
    const cardCode = `A${String(index).padStart(2, "0")}`;
    const cardId = `card-${randomToken(10)}`;
    const token = randomToken(18);
    await context.env.DB.prepare(
      `INSERT INTO kiseki_event_cards (id, event_id, card_code, token, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'unused', ?, ?)`
    ).bind(cardId, eventId, cardCode, token, now, now).run();
    cards.push({ id: cardId, cardCode, token });
  }
  return json({ ok: true, event: { id: eventId, name, eventDate, title, overlayText, expiresAt, cards } });
}
