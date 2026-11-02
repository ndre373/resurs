/**
 * verify-game.mjs — Playwright smoke self-check for «Ресурс»:
 * serve dist → canvas actually renders → click through the hub and several
 * games (DOM + 3D scenes) → screenshots of every key state → zero console errors.
 *
 * Usage: npm run build && node scripts/verify-game.mjs
 * Screenshots land in verification-shots/ (review them, then delete the dir).
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = existsSync(join(ROOT, "dist/public/index.html"))
  ? join(ROOT, "dist/public")
  : join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) {
  console.error(`VERIFY FAIL: no build output at ${DIST} — run \`npm run build\` first`);
  process.exit(1);
}
const SHOTS = join(ROOT, "verification-shots");
mkdirSync(SHOTS, { recursive: true });

const CANVAS_ID = "game-canvas";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm" };

const server = createServer(async (req, res) => {
  try {
    const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    let path;
    try { path = decodeURIComponent(raw); } catch { path = raw; }
    const file = resolve(DIST, "." + path);
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});

const fail = (msg) => { console.error("VERIFY FAIL:", msg); server.close(); process.exit(1); };

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/opt/gchrome/opt/google/chrome/chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);
let browser;
for (const exe of [null, ...CANDIDATES]) {
  try {
    browser = await chromium.launch(exe
      ? { executablePath: exe, args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-gl=swiftshader", "--autoplay-policy=no-user-gesture-required"] }
      : { args: ["--autoplay-policy=no-user-gesture-required"] });
    break;
  } catch { /* try next */ }
}
if (!browser) fail("no usable browser found");
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page
  .waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 })
  .catch(() => console.warn("WARN: __GAME_READY__ never turned true"));
await page.waitForTimeout(1200);

// 1) WebGL canvas must render actual content. The design is a near-black starfield:
// individual points can legitimately miss the small particles, so sample a 24×14
// grid over the buffer and require a minimum count of lit pixels. Retries cover
// the one-off context loss SwiftShader shows at startup (the page recovers).
let shot = null;
for (let attempt = 0; attempt < 4; attempt++) {
  shot = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { kind: "no-canvas" };
    const gl = el.getContext("webgl2") || el.getContext("webgl");
    if (!gl) return { kind: "no-context" };
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!w || !h) return { kind: "empty-buffer" };
    const px = new Uint8Array(4);
    let lit = 0;
    let total = 0;
    for (let gx = 0; gx < 24; gx++) {
      for (let gy = 0; gy < 14; gy++) {
        total++;
        gl.readPixels(
          ((w * (gx + 0.5)) / 24) | 0,
          ((h * (gy + 0.5)) / 14) | 0,
          1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px,
        );
        if (px[3] > 0 && px[0] + px[1] + px[2] > 8) lit++;
      }
    }
    return { kind: "lit", lit, total };
  }, CANVAS_ID);
  if (shot.kind === "lit" && shot.lit >= 12) break;
  await page.waitForTimeout(800);
}
if (!shot || shot.kind !== "lit" || shot.lit < 12) fail(`canvas is not rendering: ${JSON.stringify(shot)}`);
await page.screenshot({ path: join(SHOTS, "01-title.png") });

// 2) Title → hub
await page.getByText("Выбрать игру").click();
await page.waitForTimeout(700);
await page.screenshot({ path: join(SHOTS, "02-hub.png") });

// 3) DOM game: Алфавит — open, answer with a key, screenshot
await page.getByText("Алфавит", { exact: true }).click();
await page.waitForTimeout(700);
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(500);
await page.screenshot({ path: join(SHOTS, "03-alphabet.png") });

// 4) Ритм — open, start listening, wait for input phase, tap pads
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.getByText("Ритм", { exact: true }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Слушать ритм" }).click();
await page.waitForTimeout(4200); // 4 steps at 84 BPM + lead-in
await page.screenshot({ path: join(SHOTS, "04-rhythm.png") });

// 5) 3D scene: Эхо
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.getByText("Эхо", { exact: true }).click();
await page.waitForTimeout(2600); // sequence starts playing
await page.mouse.click(640, 300);
await page.waitForTimeout(400);
await page.screenshot({ path: join(SHOTS, "05-echo.png") });

// 6) 3D scene: Поток — drag the spark, rings approach
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.getByText("Поток", { exact: true }).click();
await page.waitForTimeout(800);
await page.mouse.move(640, 360);
await page.mouse.down();
await page.mouse.move(760, 300, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(4500); // let rings reach the player
await page.screenshot({ path: join(SHOTS, "06-flow.png") });

// 7) 3D scene: Дыхание
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.getByText("Дыхание", { exact: true }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: join(SHOTS, "07-breath.png") });

// 7b) Струп: answer one swatch
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.getByText("Радуга", { exact: true }).click();
await page.waitForTimeout(600);
await page.locator(".stroop-btn").first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(SHOTS, "07b-stroop.png") });

// 7c) Зеркало: draw a stroke, finish, result modal
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.getByText("Зеркало", { exact: true }).click();
await page.waitForTimeout(600);
await page.mouse.move(500, 300);
await page.mouse.down();
await page.mouse.move(700, 420, { steps: 15 });
await page.mouse.up();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Завершить" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: join(SHOTS, "07c-mirror-result.png") });
await page.getByRole("button", { name: "К играм" }).click();
await page.waitForTimeout(400);

// 7d) mobile viewport pass: title + hub + alphabet
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
mob.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
mob.on("pageerror", (e) => consoleErrors.push(String(e)));
await mob.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await mob.waitForTimeout(1800);
await mob.screenshot({ path: join(SHOTS, "07d-mobile-title.png") });
await mob.getByText("Выбрать игру").click();
await mob.waitForTimeout(600);
await mob.screenshot({ path: join(SHOTS, "07e-mobile-hub.png") });
await mob.getByText("Алфавит", { exact: true }).click();
await mob.waitForTimeout(700);
await mob.screenshot({ path: join(SHOTS, "07f-mobile-alphabet.png") });
await mob.close();

// 8) Session flow: intention → breathing step starts
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator(".session-card:not(.progress-entry):not(.settings-entry)").click();
await page.waitForTimeout(500);
await page.locator(".chip").first().click();
await page.getByRole("button", { name: "Начать" }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: join(SHOTS, "08-session-breath.png") });


// 8b) Pause: toggle pause in the session breath step, veil appears, resume works
const pauseBtn = page.locator('button[aria-label*="ауз"], button[aria-label*="ause"]').first();
if (await pauseBtn.count()) {
  await pauseBtn.click();
  await page.waitForTimeout(400);
  const veil = page.locator(".pause-veil");
  if (!(await veil.count())) fail("pause veil did not appear");
  await page.screenshot({ path: join(SHOTS, "08b-paused.png") });
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.waitForTimeout(400);
  if (await page.locator(".pause-veil").count()) fail("pause veil did not disappear");
  console.log("pause toggle OK");
} else {
  fail("pause button not found in topbar");
}

// 9) Zero console errors
if (consoleErrors.length) fail(`${consoleErrors.length} console error(s): ${consoleErrors[0]}`);

await browser.close();
server.close();
console.log("VERIFY OK: render/title/hub/alphabet/rhythm/echo/flow/breath/session all passed; screenshots in verification-shots/");
