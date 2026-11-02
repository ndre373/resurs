// Extended check: PWA assets, service worker, duration switching, voice toggles.
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join } from "path";

const root = new URL("../dist/public", import.meta.url).pathname;
const types = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
  const p = join(root, req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
  try {
    const data = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const fail = (msg) => { console.error("FAIL:", msg); process.exit(1); };

// 1) PWA assets serve correctly
for (const f of ["/manifest.webmanifest", "/sw.js", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/favicon-64.png"]) {
  const r = await fetch(`${base}${f}`);
  if (r.status !== 200) fail(`${f} → HTTP ${r.status}`);
}
const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
if (manifest.display !== "standalone" || manifest.icons?.length !== 3) fail("manifest content wrong");
console.log("OK: PWA assets + manifest");

// 2) Browser: SW registration, toggles, duration switching
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 30000 }).catch(() => fail("no __GAME_READY__"));
await page.waitForTimeout(2500);

// service worker registered?
const swState = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? "registered" : "missing";
});
console.log("service worker:", swState);

// 3) TopBar toggles: mic + quote switch active state
await page.getByText("Выбрать игру").click();
await page.waitForTimeout(600);
const micBtn = page.locator(".topbar-right .icon-btn").nth(0);
const wasActive = await micBtn.evaluate((el) => el.classList.contains("active"));
await micBtn.click();
await page.waitForTimeout(200);
const nowActive = await micBtn.evaluate((el) => el.classList.contains("active"));
if (wasActive === nowActive) fail("mic toggle does not switch state");
await micBtn.click(); // restore
console.log("OK: voice toggles switch state");

// 4) Flow: switch duration mid-game 1 мин → 5 мин, timer must reset to ~300
await page.getByText("Поток", { exact: true }).click();
await page.waitForTimeout(2500);
const t1 = Number(await page.locator(".flow-value").nth(2).textContent());
if (!(t1 > 0 && t1 <= 60)) fail(`flow 1-min timer wrong: ${t1}`);
await page.getByRole("button", { name: "5 мин", exact: true }).click();
await page.waitForTimeout(1500);
const t2 = Number(await page.locator(".flow-value").nth(2).textContent());
if (!(t2 > 240 && t2 <= 300)) fail(`flow 5-min timer wrong after switch: ${t2}`);
console.log(`OK: flow duration switch 60→300 (${t1} → ${t2})`);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 5) Breath: switch to 5 мин → "из 30" cycles
await page.getByText("Дыхание", { exact: true }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "5 мин", exact: true }).click();
await page.waitForTimeout(1500);
const cycles = await page.locator(".breath-cycles").textContent();
if (!/из 30/.test(cycles ?? "")) fail(`breath 5-min cycles wrong: ${cycles}`);
console.log(`OK: breath duration switch (${cycles.trim()})`);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 6) Session flow still works with new breath (fixed cycles=5, no chips)
await page.getByText("Сеанс «Ресурс»").click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Начать" }).click();
await page.waitForTimeout(1500);
const chipsInSession = await page.locator(".duration-bar").count();
if (chipsInSession !== 0) fail("duration chips visible in session breath (must be hidden)");
const sessCycles = await page.locator(".breath-cycles").textContent();
if (!/из 5/.test(sessCycles ?? "")) fail(`session breath cycles wrong: ${sessCycles}`);
console.log("OK: session breath fixed at 5 cycles, chips hidden");

await browser.close();
server.close();

// ignore benign headless-audio warnings; fail on real errors
const real = errors.filter((e) => !/AudioContext|speechSynthesis|WebGL.*lost|swiftshader/i.test(e));
if (real.length) fail(`console errors:\n${real.join("\n")}`);
console.log("ALL EXTENDED CHECKS PASSED");
