/** verify-settings.mjs — open the Settings screen, toggle things, set the
 *  default duration to 10 min, then confirm Breath starts on 10 мин. */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
const ROOT = new URL("../dist/public", import.meta.url).pathname;
const SHOTS = new URL("../verification-shots", import.meta.url).pathname;
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".svg":"image/svg+xml", ".json":"application/json", ".webmanifest":"application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    let p = new URL(req.url, "http://x").pathname;
    if (p === "/") p = "/index.html";
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const failures = [];
const fail = (m) => { failures.push(m); console.error("FAIL:", m); };
const ok = (m) => console.log("ok:", m);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=swiftshader", "--disable-gpu-sandbox", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on("pageerror", (e) => fail("pageerror: " + e));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 30000 });
await page.waitForTimeout(1200);

// open settings from the title gear
await page.locator(".title-settings").click();
await page.waitForTimeout(500);
if (!(await page.locator(".settings-view").count())) fail("экран настроек не открылся");
else ok("настройки открываются с титула (шестерёнка)");
await page.screenshot({ path: join(SHOTS, "11-settings-top.png") });

// all six duration chips exist incl. 10 and ∞
const chips = await page.$$eval(".settings-duration .chip", (cs) => cs.map((c) => c.textContent.trim()));
for (const want of ["1 мин", "5 мин", "10 мин", "15 мин", "20 мин", "∞"])
  if (!chips.includes(want)) fail(`нет чипа длительности «${want}» (есть: ${chips.join(", ")})`);
ok("чипы длительности: " + chips.join(", "));

// set default 10 min
await page.getByRole("button", { name: "10 мин" }).click();
await page.waitForTimeout(200);
const stored = await page.evaluate(() => localStorage.getItem("resurs.durationMin"));
if (stored !== "10") fail(`длительность не сохранилась (${stored})`);
else ok("длительность 10 мин сохранена");

// toggle haptics off
await page.getByRole("switch", { name: /Виброотклик/ }).click();
await page.waitForTimeout(150);
const hap = await page.evaluate(() => localStorage.getItem("resurs.haptics"));
if (hap !== "0") fail(`виброотклик не выключился (${hap})`);
else ok("виброотклик переключается");

// sliders react
await page.locator('input[aria-label="Музыка"]').fill("30");
const mv = await page.evaluate(() => window.__game.audio.musicVolume);
if (Math.abs(mv - 0.3) > 0.01) fail(`слайдер музыки не работает (${mv})`);
else ok("слайдер громкости музыки работает");

// scroll down shot
await page.locator(".hub-scroll").evaluate((el) => el.scrollTo(0, 9999));
await page.waitForTimeout(300);
await page.screenshot({ path: join(SHOTS, "11-settings-bottom.png") });

// back → hub has a settings card
await page.locator('button[aria-label="Назад"]').click(); // settings → hub
await page.waitForTimeout(400);
if (!(await page.locator(".session-card.settings-entry").count())) fail("в хабе нет карточки настроек");
else ok("карточка «Настройки» есть в хабе");

// Breath opens with 10 мин selected
await page.getByText("Дыхание", { exact: true }).click();
await page.waitForTimeout(900);
const activeChip = await page.$eval(".duration-bar .chip.on", (c) => c.textContent.trim()).catch(() => null);
if (activeChip !== "10 мин") fail(`Дыхание стартует не с 10 мин (выбрано: ${activeChip})`);
else ok("Дыхание открывается с 10 мин по умолчанию");

await browser.close();
server.close();
if (failures.length) { console.error(`\nSETTINGS FAILURES (${failures.length})`); process.exit(1); }
console.log("\nSETTINGS OK");
