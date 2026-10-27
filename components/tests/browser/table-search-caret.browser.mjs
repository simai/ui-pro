#!/usr/bin/env node
// Usage: PLAYWRIGHT_MODULE=… node this-file <lab> <distr> <smart-root> <output-dir>
// Text can arrive without keystrokes: a keyboard-layout switcher, dictation or
// an on-screen keyboard insert it whole. While a width transition runs under
// the focused field, Chrome leaves the caret uncommitted and every insertion
// lands at position 0, so the word comes out reversed. The search field must
// therefore not animate its width while it holds focus.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [labUrl, assetsUrl, smartUrl, outputDir] = process.argv.slice(2);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync(outputDir, { recursive: true });
const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.setViewportSize({ width: 1100, height: 760 });
await page.goto(`${labUrl}?${new URLSearchParams({ assets: assetsUrl, smart: smartUrl, dir: 'ltr', theme: 'light' })}`);
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');

const search = 'sf-table#table sf-input[name=sf_table_search] input';
await page.waitForSelector(search);

// The rule that closes the race: nothing animates while the field has focus.
await page.click(search);
const focused = await page.evaluate((selector) => {
  const input = document.querySelector(selector);
  const root = input.closest('.sf-search-input');
  return {
    transitionProperty: getComputedStyle(root).transitionProperty,
    hasLayoutUtility: root.classList.contains('transition-layout'),
  };
}, search);
if (focused.transitionProperty !== 'none') {
  failures.push({ focusedTransition: focused.transitionProperty, expected: 'none while focused' });
}
if (focused.hasLayoutUtility) {
  failures.push({ transitionLayout: 'the focused search field still carries the layout transition utility' });
}

// Typing without keystrokes, the way a layout switcher does it. Cyrillic goes
// through insertText in Chromium, latin through real key events.
for (const word of ['Вторая', 'Second']) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      input.value = '';
      input.blur();
    }, search);
    await page.click(search);
    await page.keyboard.type(word, { delay: 0 });
    const typed = await page.evaluate((selector) => document.querySelector(selector).value, search);
    if (typed !== word) failures.push({ word, attempt, typed, expected: word });
  }
}

const observed = { ...focused, errors };
writeFileSync(resolve(outputDir, 'table-search-caret.json'), `${JSON.stringify(observed, null, 2)}\n`);
await page.screenshot({ path: resolve(outputDir, 'table-search-caret.png') });
await browser.close();

if (errors.length) failures.push({ pageErrors: errors });
if (failures.length) throw new Error(JSON.stringify(failures, null, 2));
process.stdout.write('Table search caret: PASS — no animation under focus, nothing reversed\n');
