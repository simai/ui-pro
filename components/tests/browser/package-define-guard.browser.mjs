#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/smart /absolute/path/to/distr
// The shared guard in the base define(), with the package bundles among the free
// ones: a component that arrives twice is quiet, a foreign class on the same tag
// still warns. Split from ui-source tests/browser/base-define-guard.browser.mjs;
// it wants a Smart root that holds both (the free output with the package output
// laid into it).
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[3]) throw new Error('Smart output root and distr root are required');
const smartRoot = resolve(process.argv[2]);
const distrRoot = resolve(process.argv[3]);
const bundles = ['icons', 'icon-buttons', 'table', 'pagination', 'data-view', 'buttons', 'modal', 'context-menu'];
const tags = ['sf-icon', 'sf-icon-button', 'sf-table', 'sf-pagination', 'sf-data-view', 'sf-button', 'sf-modal', 'sf-context-menu'];
const browser = await chromium.launch();
const failures = [];
try {
  for (const order of [bundles, [...bundles].reverse()]) {
    const page = await browser.newPage();
    const noise = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') noise.push(message.text().split('\n')[0]);
    });
    page.on('pageerror', (error) => noise.push(error.message));
    await page.goto('about:blank');
    await page.addScriptTag({path: join(distrRoot, 'core', 'js', 'smart-base.js')});
    for (const name of order) await page.addScriptTag({path: join(smartRoot, name, 'js', `${name}.js`)});
    const registered = await page.evaluate(
      (names) => names.map((tag) => Boolean(customElements.get(tag))),
      tags,
    );
    if (registered.some((value) => !value) || noise.length) {
      failures.push({order: order[0], registered, noise});
    }
    await page.close();
  }

  // A genuine conflict still speaks up: a class that is not a SIMAI element
  // takes a tag the component wants.
  const page = await browser.newPage();
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text().split('\n')[0]);
  });
  await page.goto('about:blank');
  await page.addScriptTag({path: join(distrRoot, 'core', 'js', 'smart-base.js')});
  await page.evaluate(() => {
    class Foreign extends HTMLElement {}
    customElements.define('sf-icon', Foreign);
  });
  await page.addScriptTag({path: join(smartRoot, 'icons', 'js', 'icons.js')});
  await page.close();
  if (!warnings.some((text) => text.includes('already defined'))) {
    failures.push({conflict: 'a foreign class on sf-icon did not warn', warnings});
  }
} finally {
  await browser.close();
}
if (failures.length) throw new Error(JSON.stringify(failures));
process.stdout.write('Package define guard: PASS — quiet on duplicates, loud on a real conflict\n');
