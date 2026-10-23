#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/smart /absolute/path/to/distr
// The asset graph of the data view loads the icon and icon button bundles
// beside the standalone files. Whatever the order, every tag is registered
// once and the page stays quiet, because the base define() recognises the
// same component arriving twice.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[3]) throw new Error('Smart output root and distr root are required');
const root = resolve(process.argv[2]);
// The bundles are built against the shared Smart runtime (2026-10-13), which
// they wait for before they define their elements.
const runtime = join(resolve(process.argv[3]), 'core', 'js', 'smart-base.js');
const tags = ['sf-icon', 'sf-icon-button', 'sf-table', 'sf-pagination', 'sf-data-view'];
const browser = await chromium.launch();
try {
  for (const order of [
    ['icons', 'icon-buttons', 'table', 'pagination', 'data-view'],
    ['data-view', 'table', 'pagination', 'icons', 'icon-buttons'],
    ['data-view', 'icons', 'table', 'icon-buttons', 'pagination'],
  ]) {
    const page = await browser.newPage();
    const warnings = [];
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text().split('\n')[0]);
      if (message.type() === 'error') errors.push(message.text().split('\n')[0]);
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
    ]), tags);
    const registered = await page.evaluate(
      (names) => names.map((tag) => Boolean(customElements.get(tag))),
      tags,
    );
    await page.close();
    if (registered.some((value) => !value) || warnings.length || errors.length) {
      throw new Error(JSON.stringify({order, registered, warnings, errors}));
    }
  }
  process.stdout.write('Icon and icon button double registration: PASS in every load order\n');
} finally {
  await browser.close();
}
