// End-to-end smoke test in a real browser (WebGL via SwiftShader).
// Usage: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs [url] [screenshotDir]
// Needs the `playwright` package and a Chromium it can launch (not a project dependency).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright is not installed; install it globally or run `npx playwright install chromium`.');
  process.exit(2);
}

const url = process.argv[2] ?? 'http://localhost:4173/periodic_table/';
const shots = process.argv[3] ?? 'e2e-artifacts';
mkdirSync(shots, { recursive: true });

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__pc?.scene);
await page.evaluate(() => window.__pc.store.set({ autoRotate: false }));
await page.waitForTimeout(500);

const state = () => page.evaluate(() => {
  const s = window.__pc.store.get();
  return { hover: s.hover, pinned: s.pinned, layers: s.layers, convention: s.convention, view: { ...window.__pc.scene.stage.view } };
});
const inspectorText = () => page.locator('#inspector').innerText();

check(await page.locator('.tile').count() === 118, '118 element tiles');
check(await page.locator('.col-head').count() === 32, '32 column headers');
check(await page.locator('.row-label').count() === 7, '7 period labels');

// Hover an element tile (facing the camera).
const na = page.locator('.tile[data-z="11"]');
await na.hover();
await page.waitForTimeout(250);
let s = await state();
check(s.hover?.kind === 'element' && s.hover.z === 11, 'hovering Na sets an element target');
check(/Sodium/.test(await inspectorText()), 'inspector shows Sodium');

// Hover a column header.
await page.locator('.col-head[data-col="31"]').hover();
await page.waitForTimeout(250);
s = await state();
check(s.hover?.kind === 'column' && s.hover.column === 31, 'hovering header 17 sets a column target');
check(/Group 17/.test(await inspectorText()), 'inspector shows Group 17');

// Hover a period label.
await page.locator('.row-label[data-period="4"]').hover();
await page.waitForTimeout(250);
s = await state();
check(s.hover?.kind === 'period' && s.hover.period === 4, 'hovering period label 4 sets a period target');
check(/Period 4/.test(await inspectorText()), 'inspector shows Period 4');
await page.screenshot({ path: `${shots}/period.png` });

// Drag beside the cylinder rotates it.
const box = await page.locator('#stage').boundingBox();
const before = (await state()).view.azimuth;
await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 330, box.y + box.height / 2, { steps: 15 });
await page.mouse.up();
await page.waitForTimeout(400);
const after = (await state()).view.azimuth;
check(after < before - 0.3, `dragging left from beside the cylinder rotates it (Δφ = ${(after - before).toFixed(2)})`);

// Search jumps to and pins an element.
await page.locator('#search input').fill('iron');
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
s = await state();
check(s.pinned?.kind === 'element' && s.pinned.z === 26, 'search "iron" + Enter pins Fe');
check(/Iron/.test(await inspectorText()), 'inspector shows Iron');
await page.keyboard.press('Escape');

// Toggle every relation layer from the filter panel; each must draw something.
const layerIds = await page.evaluate(() => window.__pc.scene.getModel().layers.map((l) => l.id));
for (const id of layerIds) {
  await page.evaluate((lid) => {
    const st = window.__pc.store.get();
    const layers = Object.fromEntries(Object.keys(st.layers).map((k) => [k, { ...st.layers[k], on: k === lid }]));
    window.__pc.store.set({ layers });
  }, id);
  await page.waitForTimeout(120);
  const drawn = await page.evaluate(() => window.__pc.scene.drawnLayerCount());
  check(drawn === 1, `layer "${id}" draws`);
}
await page.screenshot({ path: `${shots}/layers.png` });

// A filter-panel checkbox toggles a layer.
const firstBox = page.locator('#filters input[type="checkbox"]').first();
if (await firstBox.count()) {
  const was = await firstBox.isChecked();
  await firstBox.click();
  await page.waitForTimeout(150);
  check((await firstBox.isChecked()) !== was, 'filter checkbox toggles');
}

// Switch the group-3 convention.
await page.evaluate(() => window.__pc.store.set({ convention: 'La' }));
await page.waitForTimeout(1200);
const laGroup = await page.evaluate(() => window.__pc.scene.getModel().layout.cells.get(57).group);
check(laGroup === 3, 'La-convention puts lanthanum in group 3');
await page.screenshot({ path: `${shots}/convention-la.png` });

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
