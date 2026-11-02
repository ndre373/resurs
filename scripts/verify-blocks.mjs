// verify-blocks.mjs — checks the features from the «внедри все блоки» batch:
// breath patterns (hold phase), fading prompter logic hooks, the «Кросс» game,
// progress screen, session game/duration pickers.
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join } from "path";

const DIST = new URL("../dist/public", import.meta.url).pathname;
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".js.map": "application/json",
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const data = await readFile(join(DIST, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("nf");
  }
});
await new Promise((r) => server.listen(4599, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--use-gl=swiftshader",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

await page.goto("http://localhost:4599/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 20000 });

// ---- hub: 8 games + progress card --------------------------------------
await page.getByText("Выбрать игру").click();
await page.getByText("Кросс", { exact: true }).waitFor({ timeout: 5000 });
console.log("OK: hub shows the «Кросс» card");

// ---- breath patterns: 4-7-8 shows the hold phase ------------------------
await page.getByText("Дыхание", { exact: true }).click();
await page.getByRole("button", { name: "4-7-8", exact: true }).click();
await page.waitForTimeout(1000);
const label = await page.locator(".breath-cycles").innerText();
// 19 s per cycle → 60 s ≈ 3 cycles
if (!label.includes("из 3")) fail(`1 мин of 4-7-8 should be 3 cycles, got «${label}»`);
else console.log("OK: 4-7-8 pattern → cycles per minute correct (3)");
// wait for the hold phase (after 4s inhale)
await page.waitForTimeout(4200);
const phase = await page.locator(".breath-phase").innerText();
if (phase !== "Задержка") fail(`expected «Задержка» hold phase, got «${phase}»`);
else console.log("OK: hold phase renders");
await page.keyboard.press("Escape");

// ---- cross game: starts, pads react --------------------------------------
await page.getByText("Кросс", { exact: true }).click();
await page.getByRole("button", { name: "Начать", exact: true }).click();
await page.waitForTimeout(600);
const targets = page.locator(".cross-pad.target");
if ((await targets.count()) !== 2) fail(`expected 2 target pads, got ${await targets.count()}`);
else {
  // tap both targets nearly simultaneously
  const boxes = await Promise.all([targets.nth(0).boundingBox(), targets.nth(1).boundingBox()]);
  await page.mouse.click(boxes[0].x + 10, boxes[0].y + 10);
  await page.mouse.click(boxes[1].x + 10, boxes[1].y + 10);
  await page.waitForTimeout(900);
  const meta = await page.locator(".cross-meta").innerText();
  if (!/верно 1/.test(meta)) fail(`cross tap did not score: «${meta}»`);
  else console.log("OK: cross game scores a simultaneous diagonal pair");
}
await page.keyboard.press("Escape");

// ---- progress screen ------------------------------------------------------
await page.getByText("Прогресс", { exact: true }).click();
await page.getByText("Рекорды по играм").waitFor({ timeout: 5000 });
console.log("OK: progress screen renders (streak + records)");
await page.getByRole("button", { name: "Назад" }).click();

// ---- session: game + duration pickers ------------------------------------
await page.goto("http://localhost:4599/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 20000 });
await page.getByText("Начать сеанс").click();
await page.getByRole("button", { name: "Случайная", exact: true }).waitFor({ timeout: 5000 });
await page.getByRole("button", { name: "Длинный · ~10 мин", exact: true }).click();
await page.getByRole("button", { name: "Ритм", exact: true }).click();
await page.getByRole("button", { name: /^Начать/ }).click();
await page.waitForTimeout(1500);
const breathLabel = await page.locator(".breath-cycles").innerText();
if (!breathLabel.includes("из 10")) fail(`long session breath should be 10 cycles, got «${breathLabel}»`);
else console.log("OK: long session → 10 breath cycles");
await page.keyboard.press("Escape");

await browser.close();
server.close();
console.log(process.exitCode ? "SOME CHECKS FAILED" : "ALL BLOCK CHECKS PASSED");
