import { chromium } from "playwright";

const BASE = process.env.POC08_URL ?? "http://127.0.0.1:3000/poc-chat?s=tools";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const results = {};

const text = async () => (await page.getByTestId("messages").textContent()) ?? "";

async function send(value) {
  await page.getByTestId("input").fill(value);
  await page.getByTestId("send").click();
}

async function waitToolState(tool, state, timeout = 90_000) {
  await page.waitForFunction(
    ({ tool, state }) => {
      const nodes = [...document.querySelectorAll('[data-testid="tool"]')];
      return nodes.some(
        (n) =>
          n.getAttribute("data-tool") === tool &&
          n.getAttribute("data-state") === state,
      );
    },
    { tool, state },
    { timeout },
  );
}

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(1200);

// 1. 成功工具：slow_tool
await send("slow please");
await waitToolState("tool-slow_tool", "output-available");
await page.waitForTimeout(800);
results.slow = {
  state: "output-available",
  hasDone: (await text()).includes("done"),
};

// 2. 失败工具：fail_tool
await send("fail please");
await waitToolState("tool-fail_tool", "output-error");
results.fail = {
  state: "output-error",
  hasError: (await text()).includes("模拟失败") || (await text()).includes("boom"),
};

// 3. 审批：risky_tool
await send("risky please");
await waitToolState("tool-risky_tool", "approval-requested");
const approveVisible = await page.getByTestId("approve").isVisible();
await page.getByTestId("approve").click();
await waitToolState("tool-risky_tool", "output-available");
results.approve = { approveVisible, state: "output-available" };

// 4. 拒绝：再来一次
await send("risky again");
await waitToolState("tool-risky_tool", "approval-requested");
const count = await page.locator('[data-testid="deny"]').count();
await page.locator('[data-testid="deny"]').last().click();
await page.waitForTimeout(1500);
const states = await page
  .locator('[data-testid="tool"][data-tool="tool-risky_tool"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
results.deny = { count, states };

console.log(JSON.stringify(results, null, 2));
await browser.close();
