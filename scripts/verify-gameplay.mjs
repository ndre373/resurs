/**
 * verify-gameplay.mjs — actually PLAY Echo, Rhythm and Flow end-to-end:
 * real pointer events on the canvas/buttons, game state read through the
 * window.__game debug hook. Fails if a game does not react as designed.
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";

const ROOT = new URL("../dist/public", import.meta.url).pathname;
const SHOTS = new URL("../verification-shots", import.meta.url).pathname;
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg",
};
const server = createServer(async (req, res) => {
  try {
    let p = new URL(req.url, "http://x").pathname;
    if (p === "/") p = "/index.html";
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("nf");
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const failures = [];
const fail = (msg) => { failures.push(msg); console.error("FAIL:", msg); };
const ok = (msg) => console.log("ok:", msg);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--use-gl=swiftshader", "--disable-gpu-sandbox", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 30000 });
await page.waitForTimeout(1200);

async function openGame(name) {
  await page.getByText("Выбрать игру").click();
  await page.waitForTimeout(500);
  await page.getByText(name, { exact: true }).click();
  await page.waitForTimeout(900);
}
async function backToTitle() {
  await page.keyboard.press("Escape"); // game → hub
  await page.waitForTimeout(400);
  const back = page.locator('button[aria-label="Назад"]');
  if (await back.count()) await back.first().click(); // hub → title
  await page.waitForTimeout(400);
}

// ---------- RHYTHM: real play through two levels ----------
await openGame("Ритм");
await page.getByRole("button", { name: "Слушать ритм" }).click();
// wait for input phase
const inputPhase = await page
  .waitForFunction(() => document.querySelector(".rhythm-phase")?.textContent?.includes("Ваш ход"), null, { timeout: 12000 })
  .catch(() => null);
if (!inputPhase) {
  fail("Ритм: фаза «Ваш ход» не наступила после прослушивания");
} else {
  ok("Ритм: ритм проигран, наступила фаза ввода");
  // read the pattern from the dots (dot-l / dot-r)
  const pattern = await page.$$eval(".rhythm-dot", (dots) =>
    dots.map((d) => (d.className.includes("dot-l") ? "L" : "R")),
  );
  for (const hand of pattern) {
    await page.locator(hand === "L" ? ".rhythm-pad.pad-l" : ".rhythm-pad.pad-r").click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  const after = await page.locator(".rhythm-phase").textContent();
  if (!/Точно/.test(after ?? "")) fail(`Ритм: после верного повтора нет «Точно», фаза: «${after}»`);
  else ok("Ритм: верный повтор засчитан, уровень растёт");
  // wrong tap → strike
  await page.waitForFunction(() => document.querySelector(".rhythm-phase")?.textContent?.includes("Ваш ход"), null, { timeout: 15000 }).catch(() => null);
  const pattern2 = await page.$$eval(".rhythm-dot", (dots) =>
    dots.map((d) => (d.className.includes("dot-l") ? "L" : "R")),
  );
  if (pattern2.length > 0) {
    const wrong = pattern2[0] === "L" ? "R" : "L";
    await page.locator(wrong === "L" ? ".rhythm-pad.pad-l" : ".rhythm-pad.pad-r").click();
    await page.waitForTimeout(300);
    const meta = await page.locator(".rhythm-meta").textContent();
    if (!/ошибки 1\//.test(meta ?? "")) fail(`Ритм: ошибочный тап не засчитан, мета: «${meta}»`);
    else ok("Ритм: ошибка засчитывается");
  }
}
await page.screenshot({ path: join(SHOTS, "10-play-rhythm.png") });
await backToTitle();

// ---------- ECHO: watch the sequence, tap the right orbs on the canvas ----------
await openGame("Эхо");
// wait until repeat phase
const rep = await page
  .waitForFunction(() => window.__game && window.__game["active"] && window.__game["active"].phase === "repeat", null, { timeout: 20000 })
  .catch(() => null);
if (!rep) {
  fail("Эхо: фаза «повторите» не наступила (сцена не играет последовательность)");
} else {
  ok("Эхо: последовательность показана, фаза повтора");
  for (let round = 0; round < 2; round++) {
    const seq = await page.evaluate(() => window.__game["active"].sequence.slice());
    for (const orbIndex of seq) {
      const pt = await page.evaluate((i) => {
        const g = window.__game;
        const scene = g["active"];
        const orb = scene["orbs"][i].mesh;
        const cam = g["camera"];
        const v = orb.position.clone().project(cam);
        return {
          x: ((v.x + 1) / 2) * window.innerWidth,
          y: ((1 - v.y) / 2) * window.innerHeight,
        };
      }, orbIndex);
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(300);
    const phase = await page.evaluate(() => window.__game["active"].phase);
    if (phase !== "success") { fail(`Эхо: верный повтор не засчитан, фаза: ${phase}`); break; }
    if (round === 0) ok("Эхо: тапы по сферам через canvas засчитываются");
    // wait for the next repeat phase
    const again = await page
      .waitForFunction(() => window.__game["active"].phase === "repeat", null, { timeout: 20000 })
      .catch(() => null);
    if (!again && round === 0) { fail("Эхо: следующий уровень не начался"); break; }
  }
  // wrong orb → strike
  const st = await page.evaluate(() => window.__game["active"].phase);
  if (st === "repeat") {
    const seq = await page.evaluate(() => window.__game["active"].sequence.slice());
    const wrongIdx = (seq[0] + 1) % 5;
    const pt = await page.evaluate((i) => {
      const g = window.__game;
      const orb = g["active"]["orbs"][i].mesh;
      const v = orb.position.clone().project(g["camera"]);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    }, wrongIdx);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(300);
    const strikes = await page.evaluate(() => window.__game["active"]["strikes"]);
    if (strikes !== 1) fail(`Эхо: ошибочная сфера не дала страйк (strikes=${strikes})`);
    else ok("Эхо: ошибка засчитывается");
  }
}
await page.screenshot({ path: join(SHOTS, "10-play-echo.png") });
await backToTitle();

// ---------- FLOW: steer the spark through rings with real pointer drags ----------
await openGame("Поток");
await page.waitForTimeout(500);
// drag toward each upcoming ring's center; 12 seconds of honest play
const t0 = Date.now();
let lastDrag = null;
while (Date.now() - t0 < 12000) {
  const target = await page.evaluate(() => {
    const g = window.__game;
    const s = g["active"];
    if (!s || !s["rings"]) return null;
    const ring = s["rings"].filter((r) => !r.judged).sort((a, b) => b.mesh.position.z - a.mesh.position.z)[0];
    if (!ring) return null;
    // world → screen
    const v = ring.mesh.position.clone().project(g["camera"]);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  });
  if (target) {
    if (!lastDrag) await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 4 });
    lastDrag = target;
  }
  await page.waitForTimeout(120);
}
await page.mouse.up().catch(() => {});
const flow = await page.evaluate(() => {
  const s = window.__game["active"];
  return s ? { hits: s["hits"], rings: s["rings"].length, elapsed: s["elapsed"] } : null;
});
if (!flow) fail("Поток: сцена не активна");
else {
  if (flow.rings === 0 && flow.hits === 0) fail("Поток: кольца не появляются");
  else ok(`Поток: кольца летят (hits=${flow.hits}, rings=${flow.rings})`);
  if (flow.hits < 1) fail(`Поток: за 12 с управляемого полёта ни одного попадания (hits=${flow.hits})`);
  else ok(`Поток: попадания засчитываются (hits=${flow.hits})`);
}
// hover-steer: mouse move WITHOUT holding the button must steer the spark
const beforeX = await page.evaluate(() => window.__game["active"]["orb"].position.x);
await page.mouse.move(1200, 400, { steps: 6 });
await page.waitForTimeout(700);
const afterX = await page.evaluate(() => window.__game["active"]["orb"].position.x);
if (!(afterX > beforeX + 0.5)) fail(`Поток: искра не следует за мышью без зажатия (x ${beforeX.toFixed(2)} → ${afterX.toFixed(2)})`);
else ok(`Поток: искра следует за указателем (x ${beforeX.toFixed(2)} → ${afterX.toFixed(2)})`);
await page.screenshot({ path: join(SHOTS, "10-play-flow.png") });
await backToTitle();

// ---------- touch pass (mobile emulation): Rhythm pads + Echo orb tap ----------
const ctxMob = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  serviceWorkers: "block",
});
const mob = await ctxMob.newPage();
mob.on("pageerror", (e) => consoleErrors.push("mob: " + String(e)));
await mob.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await mob.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 30000 });
await mob.waitForTimeout(1200);
await mob.getByText("Выбрать игру").tap();
await mob.waitForTimeout(500);
await mob.getByText("Ритм", { exact: true }).tap();
await mob.waitForTimeout(700);
await mob.getByRole("button", { name: "Слушать ритм" }).tap();
const mobInput = await mob
  .waitForFunction(() => document.querySelector(".rhythm-phase")?.textContent?.includes("Ваш ход"), null, { timeout: 12000 })
  .catch(() => null);
const audioState = await mob.evaluate(() => window.__game.audio["ctx"]?.state ?? "none");
if (audioState !== "running") fail(`Ритм (touch): AudioContext не запущен (${audioState})`);
else ok("Ритм (touch): AudioContext running после касания");
if (!mobInput) fail("Ритм (touch): фаза ввода не наступила");
else {
  const pat = await mob.$$eval(".rhythm-dot", (dots) => dots.map((d) => (d.className.includes("dot-l") ? "L" : "R")));
  for (const hand of pat) {
    await mob.locator(hand === "L" ? ".rhythm-pad.pad-l" : ".rhythm-pad.pad-r").tap();
    await mob.waitForTimeout(120);
  }
  await mob.waitForTimeout(400);
  const ph = await mob.locator(".rhythm-phase").textContent();
  if (!/Точно/.test(ph ?? "")) fail(`Ритм (touch): верный повтор не засчитан, фаза «${ph}»`);
  else ok("Ритм (touch): тапы по панелям работают");
}
// Echo on touch: tap the first correct orb
await mob.keyboard.press("Escape");
await mob.waitForTimeout(400);
const mobBack = mob.locator('button[aria-label="Назад"]');
if (await mobBack.count()) await mobBack.first().tap();
await mob.waitForTimeout(400);
await mob.getByText("Выбрать игру").tap();
await mob.waitForTimeout(500);
await mob.getByText("Эхо", { exact: true }).tap();
const mobRep = await mob
  .waitForFunction(() => window.__game && window.__game["active"] && window.__game["active"].phase === "repeat", null, { timeout: 20000 })
  .catch(() => null);
if (!mobRep) fail("Эхо (touch): фаза повтора не наступила");
else {
  const first = await mob.evaluate(() => window.__game["active"].sequence[0]);
  const pt = await mob.evaluate((i) => {
    const g = window.__game;
    const orb = g["active"]["orbs"][i].mesh;
    const v = orb.position.clone().project(g["camera"]);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }, first);
  await mob.touchscreen.tap(pt.x, pt.y);
  await mob.waitForTimeout(400);
  const pos = await mob.evaluate(() => window.__game["active"]["inputPos"]);
  if (pos !== 1) fail(`Эхо (touch): тап по сфере не засчитан (inputPos=${pos})`);
  else ok("Эхо (touch): тап по 3D-сфере засчитан");
}
// Flow on real touch: CDP touch drag must steer the spark and must NOT reload the page
await mob.keyboard.press("Escape");
await mob.waitForTimeout(400);
{
  const mb = mob.locator('button[aria-label="Назад"]');
  if (await mb.count()) await mb.first().tap();
  await mob.waitForTimeout(400);
}
await mob.getByText("Выбрать игру").tap();
await mob.waitForTimeout(400);
await mob.getByText("Поток", { exact: true }).tap();
await mob.waitForTimeout(1500);
await mob.evaluate(() => { window.__mark = 7; });
const cdp = await ctxMob.newCDPSession(mob);
const flowBefore = await mob.evaluate(() => window.__game["active"]["target"].x);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 80, y: 500, id: 1 }] });
for (let i = 1; i <= 10; i++) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 80 + i * 26, y: 500, id: 1 }] });
  await mob.waitForTimeout(40);
}
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await mob.waitForTimeout(700);
const flowAfter = await mob.evaluate(() => ({
  x: window.__game?.["active"] ? window.__game["active"]["target"].x : null,
  mark: window.__mark ?? null,
}));
if (flowAfter.mark !== 7) fail("Поток (touch): страница перезагрузилась во время жеста");
else if (flowAfter.x === null || flowAfter.x <= flowBefore + 0.5)
  fail(`Поток (touch): искра не следует за пальцем (x ${flowBefore} → ${flowAfter.x})`);
else ok(`Поток (touch): свайп ведёт искру (x ${flowBefore} → ${flowAfter.x?.toFixed(2)}), страница не перезагрузилась`);
await ctxMob.close();

if (consoleErrors.length) fail(`console errors: ${consoleErrors[0]}`);

await browser.close();
server.close();
if (failures.length) {
  console.error(`\nGAMEPLAY FAILURES (${failures.length}):`);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("\nGAMEPLAY OK: Ритм, Эхо, Поток играются как задумано (desktop + touch)");
