import { errorJson, json, requireFarm } from "../../_utils.js";

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await context.request.json();
  } catch (error) {
    return errorJson("プロフィールを読み取れませんでした。", 400);
  }

  const links = Array.isArray(body.links) ? body.links.map(normalizeLink).filter((item) => item.url).slice(0, 10) : [];
  const now = new Date().toISOString();
  const values = [
    auth.farmId,
    String(body.name || "").trim() || auth.farmId,
    String(body.area || "").trim(),
    String(body.description || "").trim(),
    String(body.imageUrl || "").trim(),
    JSON.stringify(links),
    body.isPublic === false ? 0 : 1,
    now,
  ];

  await context.env.DB.prepare(
    `INSERT INTO farmers (id, name, area, description, image_url, links_json, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       area = excluded.area,
       description = excluded.description,
       image_url = excluded.image_url,
       links_json = excluded.links_json,
       is_public = excluded.is_public,
       updated_at = excluded.updated_at`
  )
    .bind(...values, now)
    .run();

  return json({ ok: true, farmId: auth.farmId });
}


function normalizeLink(item) {
  if (typeof item === "string") {
    const url = item.trim();
    return { label: url, url };
  }
  const url = String(item?.url || "").trim();
  const label = String(item?.label || item?.name || "").trim() || url;
  return { label, url };
}
