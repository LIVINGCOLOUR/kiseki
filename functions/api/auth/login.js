import { ensureFarmerRow, errorJson, getFarmKeys, isAllowedFarmId, json, createSessionCookie } from "../../_utils.js";

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); }
  catch (error) { return errorJson("ログイン情報を読み取れませんでした。", 400); }

  const farmId = String(body.farmId || "").trim();
  const adminKey = String(body.adminKey || "");
  if (!isAllowedFarmId(farmId)) return errorJson("作り手IDが見つかりません。", 401);
  const keys = getFarmKeys(context.env);
  if (!keys[farmId] || keys[farmId] !== adminKey) return errorJson("管理キーが違います。", 401);

  await ensureFarmerRow(context.env, farmId);
  const cookie = await createSessionCookie(context.env, farmId);
  return json({ ok: true, farmId }, 200, { "set-cookie": cookie });
}