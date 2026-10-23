#!/usr/bin/env node
// Browser acceptance for SF.Position on the admin menu flyout: an explicit side
// flips at the edge without toggling back and forth. Split from ui-source
// tests/browser/position-surfaces.browser.mjs when the package components left it;
// the lab is tests/fixtures/admin-menu-position-lab.html and the Smart root must
// hold the free output with the package output laid into it.
// Usage: PLAYWRIGHT_MODULE=… node admin-menu-position.browser.mjs <lab> <distr> <smart-root> <output-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [labUrl, assetsUrl, smartUrl, outputDir] = process.argv.slice(2);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync(outputDir, { recursive: true });
const failures = []; const errors = []; const observations = [];
const check = (value, name, details = null) => { if (!value) failures.push({ name, details }); };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const warnings = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon|flag/i.test(message.text())) errors.push(message.text());
  if (message.type() === 'warning') warnings.push(message.text());
});

async function load({ width, dir, scenario, only }) {
  await page.setViewportSize({ width, height: 700 });
  await page.goto(`${labUrl}?${new URLSearchParams({ assets: assetsUrl, smart: smartUrl, dir })}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.evaluate(({ scenario, only }) => {
    const stage = document.getElementById('stage');
    for (const child of stage.children) child.style.display = child.id === only ? '' : 'none';
    stage.style.top = scenario === 'bottom' ? `${innerHeight - 70}px` : scenario === 'top' ? '4px' : '200px';
    if (scenario === 'edge') stage.style.justifyContent = 'flex-end';
  }, { scenario, only });
}
const rect = (selector) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null; }, selector);
const inside = (r, width) => r && r.left >= -1 && r.right <= width + 1 && r.top >= -1 && r.bottom <= 701;

for (const width of [1280, 390]) {
  for (const dir of ['ltr', 'rtl']) {
    // Admin Menu flyout: an explicit side flips at the edge without toggling back and forth.
    for (const [scenario, position] of [['edge', 'left-bottom'], ['middle', null]]) {
      await load({ width, dir, scenario, only: 'admin' });
      warnings.length = 0;
      await page.evaluate((position) => {
        const opener = document.getElementById('admin-opener');
        const menu = document.querySelector('sf-admin-menu');
        window.__positionChanges = 0;
        new MutationObserver((records) => { window.__positionChanges += records.filter((r) => r.attributeName === 'position').length; })
          .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['position'] });
        menu.openContextMenu({ currentTarget: opener, target: opener, preventDefault() {}, stopPropagation() {} }, position ? { position } : {});
      }, position);
      await page.waitForTimeout(1200);
      const state = await page.evaluate(() => {
        const surface = document.querySelector('.sf-context-menu'); const opener = document.getElementById('admin-opener').getBoundingClientRect();
        if (!surface) return null;
        const m = surface.getBoundingClientRect();
        return { menu: { left: m.left, right: m.right, top: m.top, bottom: m.bottom }, opener: { left: opener.left, right: opener.right }, changes: window.__positionChanges, position: surface.closest('sf-context-menu')?.getAttribute('position') };
      });
      const label = `admin ${scenario} ${dir} ${width}`; observations.push({ label, state, warnings: warnings.slice() });
      check(state && inside(state.menu, width), `${label}: flyout stays inside the viewport`, state);
      if (!state) continue;
      check(state.menu.left >= state.opener.right - 1 || state.menu.right <= state.opener.left + 1, `${label}: flyout opens beside its opener`, state);
      check(state.changes <= 2 && !warnings.some((text) => /update|loop/i.test(text)), `${label}: side attribute settles without a render loop`, { changes: state.changes, warnings });
    }
  }
}

await browser.close();
const result = { status: failures.length || errors.length ? 'failed' : 'passed', failures, errors, cases: observations.length };
writeFileSync(resolve(outputDir, 'admin-menu-position-browser.json'), `${JSON.stringify({ ...result, observations }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: result.status, failureCount: failures.length, failures: failures.slice(0, 6), errors: errors.slice(0, 5) })}\n`);
if (result.status !== 'passed') process.exitCode = 1;
