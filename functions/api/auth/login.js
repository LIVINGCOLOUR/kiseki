import { createSessionCookie, ensureFarmerRow, errorJson, getFarmKeys, isAllowedFarmId, json } from "../../_utils.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return errorJson("ログイン情報を読み取れませんでした。", 400);
  }

  const farmId = String(body.farmId || "").trim();
  const adminKey = String(body.adminKey || "").trim();
  const keys = getFarmKeys(env);

  if (!isAllowedFarmId(farmId)) {
    return errorJson("農園IDが正しくありません。", 401);
  }
  if (!keys[farmId] || keys[farmId] !== adminKey) {
    return errorJson("農園IDまたは管理キーが違います。", 401);
  }
  if (!env.SESSION_SECRET) {
    return errorJson("SESSION_SECRET が未設定です。", 500);
  }

  await ensureFarmerRow(env, farmId);
  const cookie = await createSessionCookie(env, farmId);
  return json({ ok: true, farmId }, 200, { "set-cookie": cookie });
}

