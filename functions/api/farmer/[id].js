import { defaultFarmName, ensureFarmerRow, errorJson, isAllowedFarmId, json } from "../../_utils.js";

export async function onRequestGet(context) {
  const farmId = String(context.params.id || "");
  if (!isAllowedFarmId(farmId)) return errorJson("農園が見つかりません。", 404);
  await ensureFarmerRow(context.env, farmId);

  const row = context.env.DB
    ? await context.env.DB.prepare("SELECT * FROM farmers WHERE id = ?").bind(farmId).first()
    : null;

  return json({ ok: true, farmer: normalizeFarmer(row, farmId) });
}

function normalizeFarmer(row, farmId) {
  return {
    id: row?.id || farmId,
    name: row?.name || defaultFarmName(farmId),
    area: row?.area || "",
    description: row?.description || "",
    imageUrl: row?.image_url || "",
    links: safeJson(row?.links_json, []),
    isPublic: row?.is_public !== 0,
    updatedAt: row?.updated_at || "",
  };
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

