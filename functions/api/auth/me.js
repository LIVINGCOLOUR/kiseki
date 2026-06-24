import { defaultFarmName, ensureFarmerRow, getSession, json } from "../../_utils.js";

export async function onRequestGet(context) {
  const session = await getSession(context.request, context.env);
  if (!session?.farmId) {
    return json({ ok: true, authenticated: false });
  }
  await ensureFarmerRow(context.env, session.farmId);
  let farmer = null;
  if (context.env.DB) {
    farmer = await context.env.DB.prepare("SELECT * FROM farmers WHERE id = ?")
      .bind(session.farmId)
      .first();
  }
  return json({
    ok: true,
    authenticated: true,
    farmId: session.farmId,
    farmer: farmer || { id: session.farmId, name: defaultFarmName(session.farmId) },
  });
}

