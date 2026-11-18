import { chromium } from "playwright";

const BASE = process.env.POC06_URL ?? "http://127.0.0.1:3000/poc-chat";
const mode = process.argv[2] ?? "probes";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const status = async () =>
  (await page.getByTestId("status").textContent())?.replace("status=", "") ?? "";
const len = async () =>
  Number(await page.getByTestId("assistant-len").textContent());
const messagesText = async () =>
  (await page.getByTestId("messages").textContent()) ?? "";

async function send(text) {
  await page.getByTestId("input").fill(text);
  await page.getByTestId("send").click();
}

async function waitStatus(value, timeout = 25_000) {
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('[data-testid="status"]');
      return el?.textContent === `status=${expected}`;
    },
    value,
    { timeout },
  );
}

async function switchSession(name) {
  await page.getByTestId("session").fill(name);
  await page.getByTestId("switch").click();
  await page.waitForTimeout(800);
}

const results = {};

if (mode === "probes") {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // B1：流式中停止
  await send("stop-test");
  await page.waitForTimeout(1200);
  const before = await len();
  await page.getByTestId("stop").click();
  await page.waitForTimeout(2500);
  const after = await len();
  results.B1_stop = { before, after, stopped: after - before <= 40 };

  // B7：流式中刷新，检查是否续上
  await switchSession("resume");
  await send("resume-test");
  await page.waitForTimeout(1000);
  const beforeReload = await len();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const afterReload = await len();
  const hasUser = (await messagesText()).includes("resume-test");
  let finished = false;
  try {
    await waitStatus("ready", 20_000);
    finished = true;
  } catch {
    finished = false;
  }
  const finalText = await messagesText();
  results.B7_resume = {
    beforeReload,
    afterReload,
    hasUser,
    finished,
    gotLastChunk: finalText.includes("chunk-40"),
  };

  // B5：多会话隔离
  await switchSession("s2");
  const s2Before = await messagesText();
  await send("session-two");
  await waitStatus("ready", 25_000);
  const s2Text = await messagesText();
  await switchSession("s1");
  await page.waitForTimeout(1200);
  const s1Text = await messagesText();
  await switchSession("s2");
  await page.waitForTimeout(1200);
  const s2Again = await messagesText();

  results.B5_sessions = {
    s2InitiallyEmpty: !s2Before.includes("stop-test"),
    s2HasOwn: s2Text.includes("session-two"),
    s2LeakedS1: s2Text.includes("stop-test"),
    s1StillHasOwn: s1Text.includes("stop-test"),
    s2Persisted: s2Again.includes("session-two"),
  };
}

if (mode === "seed") {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await switchSession("persist");
  await send("persist-me");
  await waitStatus("ready", 30_000);
  results.seed = {
    len: await len(),
    hasText: (await messagesText()).includes("persist-me"),
    gotLastChunk: (await messagesText()).includes("chunk-40"),
  };
}

if (mode === "verify") {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await switchSession("persist");
  await page.waitForTimeout(2500);
  const text = await messagesText();
  results.verify = {
    hasUser: text.includes("persist-me"),
    gotLastChunk: text.includes("chunk-40"),
    chars: text.length,
  };
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
