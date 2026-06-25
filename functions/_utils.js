const SESSION_COOKIE = "ynh_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const FARM_IDS = new Set(["id-01", "id-02", "id-03", "id-04", "id-05"]);

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function errorJson(message, status = 400) { return json({ ok: false, error: message }, status); }

export function getFarmKeys(env) {
  try { const parsed = JSON.parse(env.FARM_ADMIN_KEYS_JSON || "{}"); return parsed && typeof parsed === "object" ? parsed : {}; }
  catch (error) { return {}; }
}

export function isAllowedFarmId(farmId) { return FARM_IDS.has(String(farmId || "")); }

export async function createSessionCookie(env, farmId) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${farmId}.${exp}`;
  const sig = await sign(payload, env.SESSION_SECRET || "");
  const value = `${payload}.${sig}`;
  const secure = env.ENVIRONMENT === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function clearSessionCookie() { return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`; }

export async function requireFarm(context) {
  const session = await getSession(context.request, context.env);
  if (!session?.farmId) return { response: errorJson("ログインが必要です。", 401) };
  return { farmId: session.farmId };
}

export async function getSession(request, env) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [farmId, expText, sig] = parts;
  if (!isAllowedFarmId(farmId)) return null;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = await sign(`${farmId}.${expText}`, env.SESSION_SECRET || "");
  if (!timingSafeEqual(sig, expected)) return null;
  return { farmId, exp };
}

export async function ensureFarmerRow(env, farmId) {
  if (!env.DB || !isAllowedFarmId(farmId)) return;
  await env.DB.prepare("INSERT OR IGNORE INTO farmers (id, name, description, is_public) VALUES (?, ?, ?, 1)")
    .bind(farmId, defaultFarmName(farmId), "運用実証用の作り手アカウントです。")
    .run();
}

export function defaultFarmName(farmId) {
  const n = String(farmId || "").replace("id-", "");
  return `作り手 ${Number(n) || 1}`;
}

export function sanitizeSegment(value, fallback = "item") {
  const sanitized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || fallback;
}

export function createRecordId(farmerId, productName, date) {
  const productSlug = sanitizeSegment(productName, "");
  return productSlug ? `${sanitizeSegment(farmerId, "id")}-${productSlug}-${date}` : `${sanitizeSegment(farmerId, "id")}-${date}`;
}

export function isUploadedFile(value) { return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.stream === "function"; }

export function pickExtension(file, fallback) {
  const fromName = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  if (fromName) return fromName[1].replace("jpeg", "jpg");
  const fromType = String(file.type || "").toLowerCase().match(/\/([a-z0-9.+-]+)$/);
  if (fromType) return fromType[1].replace("quicktime", "mov").replace("jpeg", "jpg");
  return fallback;
}

export function summarizeUserAgent(ua) { return String(ua || "").slice(0, 240); }

function parseCookies(cookieHeader) {
  const out = {};
  cookieHeader.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

async function sign(message, secret) {
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url(signature);
}

function base64url(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}