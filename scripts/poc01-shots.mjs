import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.resolve("docs/poc/assets");
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "390", width: 390, height: 844 },
];

const PAGES = [
  { path: "/", name: "workspace", fullPage: false },
  { path: "/design", name: "design", fullPage: true },
];

const browser = await chromium.launch();
const report = [];

for (const pageDef of PAGES) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text().slice(0, 200));
    });
    page.on("pageerror", (err) => errors.push(String(err).slice(0, 200)));

    await page.goto(BASE + pageDef.path, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2500);

    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });

    const file = path.join(OUT, `${pageDef.name}-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: pageDef.fullPage });

    report.push({
      page: pageDef.path,
      viewport: vp.name,
      overflowPx: overflow,
      consoleErrors: errors.length,
      errors: errors.slice(0, 3),
      file: path.relative(process.cwd(), file),
    });

    await context.close();
  }
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
