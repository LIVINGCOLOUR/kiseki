import fs from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.CDP_PORT || 9333);
const adminKey = process.env.CAPTURE_ADMIN_KEY;
const outDir = path.resolve(process.argv[2] || "assets/promo/operation-guide/screenshots");
if (!adminKey) throw new Error("CAPTURE_ADMIN_KEY is required");
await fs.mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let targets;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(250);
}
if (!targets?.length) throw new Error("CDP target not found");

const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "evaluation failed");
  return result.result?.value;
}
async function navigate(url, waitMs = 2200) {
  await send("Page.navigate", { url }); await sleep(waitMs);
}
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(path.join(outDir, name), Buffer.from(result.data, "base64"));
}
async function scrollTo(selector, offset = -80) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY + ${offset})); return true; })()`);
  await sleep(700);
}
async function waitForSelector(selector, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(250);
  }
  throw new Error(`Selector not found: ${selector}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: true, screenWidth: 1080, screenHeight: 1920 });

const base = "https://yasai-no-haikei.pages.dev";
await navigate(`${base}/login?next=%2Fdashboard`);
await waitForSelector("[data-login-form]");
await evaluate(`(() => { document.querySelector('#farmId').value = 'id-01'; document.querySelector('#adminKey').value = ${JSON.stringify(adminKey)}; document.querySelector('[data-login-form]').requestSubmit(); return true; })()`);
await sleep(2600);
await navigate(`${base}/dashboard`);
await screenshot("01-dashboard.png");

await navigate(`${base}/harvest-admin`);
await screenshot("02-mode-choice.png");

await navigate(`${base}/event-admin`, 2800);
await screenshot("03-event-setup.png");
await scrollTo("[data-event-history]");
await screenshot("04-event-history.png");

const eventData = await evaluate(`(async () => {
  const list = await (await fetch('/api/events')).json();
  for (const item of (list.events || [])) {
    const detail = await (await fetch('/api/events/' + encodeURIComponent(item.id))).json();
    if ((detail.cards || []).some(card => card.finalVideoUrl || card.handoffVideoUrl)) return { event: detail.event, cards: detail.cards };
  }
  if (list.events?.[0]) return await (await fetch('/api/events/' + encodeURIComponent(list.events[0].id))).json();
  return null;
})()`);
if (!eventData?.event?.id) throw new Error("No event data available for capture");
const eventId = eventData.event.id;
const publicCard = (eventData.cards || []).find((card) => card.finalVideoUrl) || (eventData.cards || []).find((card) => card.handoffVideoUrl) || eventData.cards?.[0];

await navigate(`${base}/event-admin?id=${encodeURIComponent(eventId)}`, 3000);
await screenshot("05-event-qr.png");

await navigate(`${base}/event-handoff?event=${encodeURIComponent(eventId)}`, 3000);
await screenshot("06-handoff-record.png");
await scrollTo("[data-event-job-list]", -180);
await screenshot("07-handoff-status.png");

if (publicCard?.token) {
  await navigate(`${base}/event?token=${encodeURIComponent(publicCard.token)}`, 3500);
  await screenshot("08-consumer-play.png");
  await evaluate(`(() => { const video = document.querySelector('[data-event-public-video]'); if (!video) return false; video.muted = true; video.play().catch(() => {}); return true; })()`);
  await sleep(2400);
  await screenshot("09-consumer-playing.png");
}

await fs.writeFile(path.join(outDir, "capture.json"), JSON.stringify({ eventId, cardCode: publicCard?.cardCode || "", files: (await fs.readdir(outDir)).filter((name) => name.endsWith('.png')) }, null, 2));
ws.close();
