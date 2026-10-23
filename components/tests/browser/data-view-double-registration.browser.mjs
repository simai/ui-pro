#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/smart /absolute/path/to/distr
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[3]) throw new Error('Smart output root and distr root are required');
const root = resolve(process.argv[2]);
// The bundles are built against the shared Smart runtime (2026-10-13), which
// they wait for before they define their elements.
const runtime = join(resolve(process.argv[3]), 'core', 'js', 'smart-base.js');
const browser = await chromium.launch();
try {
  for (const order of [
    ['data-view', 'table', 'pagination'],
    ['table', 'pagination', 'data-view'],
  ]) {
    const page = await browser.newPage();
    const warnings = [];
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text().split('\n')[0]);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('about:blank');
    await page.addScriptTag({path: runtime});
    for (const name of order) {
      await page.addScriptTag({path: join(root, name, 'js', `${name}.js`)});
    }
    await page.evaluate((names) => Promise.race([
      Promise.all(names.map((tag) => customElements.whenDefined(tag))),
      new Promise((settle) => setTimeout(settle, 5000)),
    ]), ['sf-data-view', 'sf-table', 'sf-pagination']);
    const registered = await page.evaluate(() =>
      ['sf-data-view', 'sf-table', 'sf-pagination'].map((tag) => Boolean(customElements.get(tag))));
    await page.close();
    if (registered.some((value) => !value) || warnings.length || errors.length) {
      throw new Error(JSON.stringify({order, registered, warnings, errors}));
    }
  }
  process.stdout.write('Data View double registration: PASS in both load orders\n');
} finally {
  await browser.close();
}
