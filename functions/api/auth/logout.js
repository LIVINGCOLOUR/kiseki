import { clearSessionCookie, json } from "../../_utils.js";

export async function onRequestPost() {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

