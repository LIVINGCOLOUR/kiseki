import { json, summarizeUserAgent } from "../../_utils.js";

const ALLOWED_EVENTS = new Set(["page_view", "video_play", "video_ended", "profile_click"]);

export async function onRequestPost(context) {
  let body = {};
  try {
    body = await context.request.json();
  } catch (error) {
    return json({ ok: true, ignored: true });
  }

  const eventName = String(body.eventName || "");
  if (!ALLOWED_EVENTS.has(eventName)) return json({ ok: true, ignored: true });
  const id = crypto.randomUUID();
  const headers = context.request.headers;
  const url = new URL(context.request.url);

  try {
    await context.env.DB.prepare(
      `INSERT INTO analytics_events
        (id, event_name, record_id, farmer_id, session_id, page_path, user_agent_summary, referrer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        eventName,
        String(body.recordId || ""),
        String(body.farmerId || ""),
        String(body.sessionId || ""),
        String(body.pagePath || url.pathname),
        summarizeUserAgent(headers.get("user-agent")),
        String(body.referrer || headers.get("referer") || "").slice(0, 240),
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    return json({ ok: true, stored: false });
  }

  return json({ ok: true, stored: true });
}

