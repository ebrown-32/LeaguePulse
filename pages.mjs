import { chromium } from '/Users/eliasbrown/.npm/_npx/5e2e484947874241/node_modules/playwright/index.mjs';
const b = await chromium.launch();
for (const path of ['/', '/standings', '/next-gen', '/history', '/report', '/media']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  const r = await p.goto('http://localhost:3000' + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const h1 = (await p.locator('h1').first().textContent().catch(() => '')) || '';
  console.log(path.padEnd(12), r.status(), '| h1:', h1.trim().slice(0, 40), '| errs:', errs.length, errs[0] || '');
  await p.close();
}
await b.close();
