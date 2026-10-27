#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// A data column stops shrinking before it stops being readable, and the table
// scrolls instead.
//
// A fixed-layout table divides whatever room it has and will divide it to
// nothing: in 620px with five columns they came out 61px each, which shreds
// «Код решения» over three lines and cannot hold a date. The consumer asked for
// a floor and for the horizontal scroll to take over (Larena, 2026-10-06), and
// the admin reference showed it happening (owner, 2026-10-09).
//
// Since 2026-10-13 a column is as wide as its content on one line (owner): the
// measure is no longer a fixed floor but that nothing in a data column wraps --
// its heading and its values each stay on one line -- and that the table
// scrolls when the columns do not fit.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = ['core/core/css/core.css', 'core/core/css/utility.full.css',
  'smart/smart/tag/css/tag.css', 'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css'].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/tag/js/tag.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

const failures = [];
const browser = await chromium.launch();

try {
  // Narrow on purpose: five columns in 420px is where the squeezing was.
  const page = await browser.newPage({viewport: {width: 420, height: 700}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<div id="box" style="inline-size:420px"><sf-table id="t" toolbar="false" aria-label="Проба"></sf-table></div>'
    + '</body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-table')));

  await page.evaluate(() => {
    const table = document.getElementById('t');
    table.setColumns([
      {key: 'title', label: 'Название'},
      {key: 'code', label: 'Код решения'},
      {key: 'section', label: 'Раздел'},
      {key: 'status', label: 'Статус'},
      {key: 'updated', label: 'Обновлено'},
      {key: 'summary', label: 'Описание', propertyType: 'text'},
      {key: 'record', label: 'Раздел', propertyType: 'record'},
      {key: 'tags', label: 'Теги', propertyType: 'choices', width: '9rem', options: [
        {value: 'a', label: 'Портал'}, {value: 'b', label: 'Интеграции'}, {value: 'c', label: 'Платежи'}, {value: 'd', label: 'Отчёты'}]},
    ]);
    table.setRows([{id: '1', title: 'Раз', code: 'simai.one', section: 'Первый', status: 'В работе', updated: '2026-12-25',
      summary: 'Модуль закрывает весь путь обращения: приём, распределение, ответ и оценку, с отчётами по каждому шагу',
      tags: ['a', 'b', 'c', 'd'], record: {label: 'Платежи и биллинг', href: '#billing'}}]);
  });
  await page.waitForFunction(() => document.querySelectorAll('#t tbody tr').length === 1, null, {timeout: 8000});
  // The record link's module arrives after the table has drawn and measured,
  // as the Loader brings it on a page: the column was measured empty and kept
  // a few pixels wide (Larena, 2026-10-13).
  await page.waitForTimeout(300);
  await page.addScriptTag({path: join(out, 'smart/smart/reference-link/js/reference-link.js'), type: 'module'});
  await page.waitForTimeout(800);

  const measured = await page.evaluate(() => {
    const table = document.querySelector('#t table');
    const floor = Number.parseFloat(getComputedStyle(table).getPropertyValue('--sf-table--column-min-inline-size'))
      * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    // The data columns by name. Taking the last five once counted the actions
    // column among them, which passed only while that column was held at the
    // floor too -- it is as wide as its buttons now.
    const data = new Set(['title', 'code', 'section', 'status', 'updated', 'summary', 'record']);
    const widths = [...table.querySelectorAll('thead th')]
      .filter((th) => data.has(th.dataset.key))
      .map((th) => Math.round(th.getBoundingClientRect().width));
    // The most lines any one text in a cell takes: a text's boxes at distinct
    // heights. Element boxes are left out -- a button around a heading is
    // taller than its text without the text wrapping.
    const lines = (cell) => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      let most = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rows = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        most = Math.max(most, rows.size);
      }
      return most;
    };
    const wrapped = [...table.querySelectorAll('thead th, tbody td')]
      .filter((cell) => data.has(cell.dataset.key))
      .filter((cell) => lines(cell) > 1)
      .map((cell) => `${cell.tagName.toLowerCase()}:${cell.dataset.key}`);
    let node = table.parentElement;
    let scroller = null;
    while (node && node !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowX)) { scroller = node; break; }
      node = node.parentElement;
    }
    return {
      floor: Math.round(floor),
      dataWidths: widths,
      wrapped,
      // Several tags in a narrow column: one line, the rest folded into «+N».
      tags: (() => {
        const box = table.querySelector('tbody td[data-key="tags"] .sf-table-cell-values');
        if (!box) return null;
        const more = box.querySelector('.sf-table-cell-more');
        // Each value's drawn box: sf-tag is display: contents, its child is the box.
        const drawn = [...box.children].map((child) => (getComputedStyle(child).display === 'contents' ? child.firstElementChild : child))
          .filter((one) => one && !one.classList.contains('sf-table-cell-folded') && one.getBoundingClientRect().width > 1);
        const tops = new Set(drawn.map((one) => Math.round(one.getBoundingClientRect().top)));
        return {lines: tops.size, more: more && !more.hidden ? more.textContent : null, title: more?.title ?? '',
          fits: box.scrollWidth <= box.clientWidth + 1, read: box.textContent.includes('Отчёты')};
      })(),
      // A long text is cut to one line at the column's cap, its whole in the title.
      summary: (() => {
        const cell = table.querySelector('tbody td[data-key="summary"] .sf-table-cell-clip');
        return cell ? {clipped: cell.scrollWidth > cell.clientWidth, title: cell.title.length,
          width: Math.round(cell.closest('td').getBoundingClientRect().width)} : null;
      })(),
      scrollBy: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    };
  });

  // A build with no floor at all answers NaN here, and every comparison below
  // would quietly be false -- which is how the first version of this probe
  // passed on the very bytes it was written against.
  if (!Number.isFinite(measured.floor) || measured.floor <= 0) {
    failures.push({said: 'the table declares no column floor', floor: measured.floor});
  }

  if (!measured.summary?.clipped || measured.summary.title < 50) {
    failures.push({said: 'a long text is not cut to one line with its whole in the title', summary: measured.summary});
  }
  if (!measured.tags || measured.tags.lines !== 1 || !/^\+\d+$/u.test(measured.tags.more ?? '')
      || !measured.tags.title || !measured.tags.fits || !measured.tags.read) {
    failures.push({said: 'several tags do not stay on one line with the rest in «+N»', tags: measured.tags});
  }
  if (measured.wrapped.length) {
    failures.push({said: 'a data column wraps its heading or its value', wrapped: measured.wrapped, widths: measured.dataWidths});
  }
  // The point of the floor is that the table scrolls rather than squeezing: in
  // 420px five columns at the floor cannot fit, so it has to.
  if (measured.scrollBy <= 0) {
    failures.push({said: 'the columns do not fit and the table does not scroll', measured});
  }

  console.log(JSON.stringify({
    probe: 'column-readable-floor',
    measured,
    result: failures.length ? 'COLUMN_FLOOR_FAIL' : 'COLUMN_FLOOR_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
