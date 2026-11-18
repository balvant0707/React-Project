// Header layout at several widths: nothing may wrap onto a second row or overflow (dev server of the app must run).
//   HEADER_TEST_URL=http://localhost:5273 node tools/browser/header-test.mjs
import { launch, findChromium } from "./cdp.mjs";

const URL_ = process.env.HEADER_TEST_URL ?? "http://localhost:5273";
const USER = process.env.GATE_TEST_USER ?? "anna.weber@example.com";
const PASSWORD = process.env.GATE_TEST_PASSWORD ?? "TestPass123!";
if (!findChromium()) throw new Error("no headless Chromium (CLAUDE.md > Browser tests)");
const b = await launch({ port: 9334 });
let failures = 0;
try {
  const { ev, send, sleep, goto, type } = b;
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await goto(`${URL_}/`, 15000);
  await type("#username", USER);
  await type("#password", PASSWORD);
  await ev(`document.querySelector('button[type=submit]').click()`);
  await sleep(10000);
  await goto(`${URL_}/people`, 10000);
  for (const width of [1920, 1600, 1440, 1280, 1100, 1024, 992, 900, 820, 769]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    const m = await ev(`(() => {
      const h = document.getElementById('app-header'); if (!h) return null;
      const tops = [...h.querySelectorAll('button, input, .ant-switch, .ant-typography, .ant-segmented, [class*=language]')].map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)).filter((t) => t > 0);
      return { height: h.offsetHeight, rows: tops.length ? Math.max(...tops) - Math.min(...tops) : 0, overflow: h.scrollWidth > h.clientWidth, name: h.innerText.replace(/\\s+/g, ' ') };
    })()`);
    const bad = !m || m.height > 64 || m.rows > 20 || m.overflow;
    if (bad) failures++;
    console.log(bad ? "FAIL" : "ok  ", width, JSON.stringify(m));
  }
} finally { b.close(); }
process.exit(failures ? 1 : 0);
