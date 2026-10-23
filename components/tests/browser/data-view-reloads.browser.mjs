#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// What the view asks the host for, measured on the built bytes with a stub host:
// settings and a row click ask nothing, Show more answers in its own button, and
// a real re-query keeps the rows with one spinner over them.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js',
  'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/inputs/js/inputs.js',
  'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/tags/js/tags.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<!doctype html><html class="theme-light"><body style="margin:0">
     <div style="width:900px">
       <sf-data-view id="v">
         <sf-table slot="content" id="t" toolbar="false"></sf-table>
         <sf-pagination slot="pagination" id="p" total="100" page-size="10" current="1"></sf-pagination>
       </sf-data-view>
     </div>
   </body></html>`,
);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(900);

try {
  const ready = await page.evaluate(async () => {
    const view = document.getElementById('v');
    window.raised = [];
    const rows = (from) => Array.from({length: 10}, (_, index) => ({
      id: String(from + index), name: `N${from + index}`, city: `C${from + index}`,
      revision: 'r1', actions: ['view'],
    }));
    view.setHostPort({
      version: '1.4.0',
      capabilities: ['row-actions', 'saved-views', 'shared-column-settings', 'bulk-under-filter'],
      // A real host answers later, which is the only state worth measuring here:
      // what the view shows while it waits.
      async raise(intent, payload) {
        window.raised.push({intent, reason: payload?.reason ?? null});
        await new Promise((done) => setTimeout(done, 120));
        if (intent !== 'query.change') return {answer: 'applied'};
        const page = payload?.query?.page ?? 1;
        return {
          answer: 'applied',
          sequence: payload.sequence,
          data: {
            records: rows((page - 1) * 10),
            total: 100,
            columns: [
              {key: 'name', label: 'Name', role: 'title', width: 200},
              {key: 'city', label: 'City', width: 200},
            ],
            echo: {search: payload.query.search ?? '', filters: {}, sort: [], page, per_page: 10},
            // The person's own layer, so a settings write has a revision to go
            // against — without one the view refuses the write, as the port says.
            column_settings: {target: 'personal', layers: {personal: {revision: 's1', columns: {}}}},
          },
        };
      },
    });
    await new Promise((done) => setTimeout(done, 600));
    return {
      queries: window.raised.filter((entry) => entry.intent === 'query.change').length,
      rows: document.querySelectorAll('#t tbody tr').length,
    };
  });
  if (!ready.rows) note({case: 'setup', got: ready, expected: 'the stub host answered and the rows rendered'});

  const countQueries = () => page.evaluate(() => window.raised.filter((entry) => entry.intent === 'query.change').length);
  const before = await countQueries();

  // 1. A row click asks the host nothing at all.
  await page.click('#t tbody tr:nth-child(2) td[data-key="city"]');
  await page.waitForTimeout(200);
  if ((await countQueries()) !== before) {
    note({case: 'row click', expected: 'no query from making a row current'});
  }

  // 2. Saving column settings asks for no rows and shows no loader.
  const settings = await page.evaluate(async () => {
    const table = document.getElementById('t');
    const view = document.getElementById('v');
    table.patchColumnSettings('city', {width: 260}, 'column-resize');
    await new Promise((done) => setTimeout(done, 400));
    return {
      queries: window.raised.filter((entry) => entry.intent === 'query.change').length,
      writes: window.raised.filter((entry) => entry.intent.startsWith('settings.')).length,
      state: view.getAttribute('data-state'),
      busy: Boolean(document.querySelector('#t tbody[data-busy]')),
    };
  });
  if (settings.writes !== 1) {
    note({case: 'settings', got: settings, expected: 'one settings write'});
  }
  if (settings.queries !== before) {
    note({case: 'settings', got: settings.queries, expected: `no re-query (still ${before})`});
  }
  if (settings.state === 'loading' || settings.busy) {
    note({case: 'settings', got: settings, expected: 'no loader over the table'});
  }

  // 3. Show more answers inside its own button, and the rows stay put.
  const more = await page.evaluate(async () => {
    const pagination = document.getElementById('p');
    const seen = [];
    const observer = new MutationObserver(() => seen.push({
      busy: pagination.hasAttribute('show-more-busy'),
      tableBusy: Boolean(document.querySelector('#t tbody[data-busy]')),
      state: document.getElementById('v').getAttribute('data-state'),
    }));
    observer.observe(pagination, {attributes: true});
    observer.observe(document.getElementById('v'), {attributes: true});
    pagination.showMore();
    await new Promise((done) => setTimeout(done, 500));
    observer.disconnect();
    return {
      seen,
      rows: document.querySelectorAll('#t tbody tr').length,
      queries: window.raised.filter((entry) => entry.intent === 'query.change').length,
    };
  });
  if (!more.seen.some((entry) => entry.busy)) {
    note({case: 'show more', got: more.seen, expected: 'the button says it is working'});
  }
  if (more.seen.some((entry) => entry.state === 'loading' || entry.tableBusy)) {
    note({case: 'show more', got: more.seen, expected: 'no loader and no dimming over the table'});
  }
  if (more.rows !== 20) {
    note({case: 'show more', got: more.rows, expected: 'the next portion appended to the rows already there'});
  }

  // 4. A real re-query keeps the rows, dims them, and shows one spinner over the
  // middle of the visible table.
  const requery = await page.evaluate(async () => {
    const view = document.getElementById('v');
    const seen = [];
    const take = () => {
      const area = document.querySelector('#t .sf-table-scroll');
      const spinner = area?.querySelector('.sf-table-busy');
      seen.push({
        rows: document.querySelectorAll('#t tbody tr').length,
        dimmed: Boolean(document.querySelector('#t tbody[data-busy]')),
        spinner: Boolean(spinner),
        centred: spinner ? getComputedStyle(spinner).position : null,
      });
    };
    const ticker = setInterval(take, 20);
    view.changeQuery({search: 'ann'}, 'search');
    await new Promise((done) => setTimeout(done, 400));
    clearInterval(ticker);
    return seen;
  });
  const busyFrames = requery.filter((frame) => frame.dimmed);
  if (!busyFrames.length) {
    note({case: 're-query', expected: 'the rows dimmed while the answer is on its way'});
  } else {
    if (busyFrames.some((frame) => frame.rows === 0)) {
      note({case: 're-query', expected: 'the rows stay on screen'});
    }
    if (!busyFrames.every((frame) => frame.spinner && frame.centred === 'sticky')) {
      note({case: 're-query', got: busyFrames[0], expected: 'one spinner held in the middle of the visible table'});
    }
  }
  // 5. The band of bulk controls is the card's last strip: only it sticks, and
  // the page row with Show more stays in flow. The consumer found the whole row
  // holding the bottom of the window over its own last rows.
  const band = await page.evaluate(async () => {
    const view = document.getElementById('v');
    const table = document.getElementById('t');
    const pagination = document.getElementById('p');
    pagination.setAttribute('actions', 'archive:В архив|delete:Удалить');
    pagination.setAttribute('show-action-for-all', 'true');
    const data = table.getTableData().rows;
    if (data[0]?.select?.component?.props) data[0].select.component.props.checked = true;
    table.setRows(data.map((record) => ({...record})));
    table.syncSelectionPort();
    await new Promise((done) => setTimeout(done, 350));
    const strip = view.querySelector(':scope > [slot="bulk"]');
    if (!strip) return null;
    const style = getComputedStyle(strip);
    const row = document.querySelector('.sf-pagination');
    return {
      inLightDom: strip.parentElement === view,
      position: style.position,
      bottom: style.insetBlockEnd,
      background: style.backgroundColor,
      shadow: style.boxShadow !== 'none',
      text: strip.textContent.replace(/\s+/gu, ' ').trim().slice(0, 40),
      rowPosition: getComputedStyle(row).position,
      pageRowBand: Boolean(row.querySelector('.sf-pagination-actions')),
      apply: strip.querySelector('[data-sf-bulk="apply"]')?.hasAttribute('disabled'),
    };
  });
  if (!band) {
    note({case: 'bulk band', expected: 'a strip in the card once a row is marked'});
  } else {
    if (!band.inLightDom) note({case: 'bulk band', expected: 'the strip lives where the Framework styles reach it'});
    if (band.position !== 'sticky' || band.bottom !== '0px') {
      note({case: 'bulk band', got: band, expected: 'sticky at the bottom of the card'});
    }
    if (band.rowPosition === 'sticky') {
      note({case: 'bulk band', expected: 'the page row stays in flow'});
    }
    if (band.pageRowBand) {
      note({case: 'bulk band', expected: 'the page row draws no band of its own inside a view'});
    }
    if (!/Selected: 1/u.test(band.text)) {
      note({case: 'bulk band', got: band.text, expected: 'it says how many are marked'});
    }
    if (band.apply !== true) {
      note({case: 'bulk band', expected: 'apply out of reach until an action is chosen'});
    }
    if (/rgba\(0, 0, 0, 0\)/u.test(band.background)) {
      note({case: 'bulk band', got: band.background, expected: 'an opaque surface, not the rows showing through'});
    }
    if (!band.shadow) note({case: 'bulk band', expected: 'a shadow over the rows'});
  }
  // 6. A search typed in the table costs one render before its answer: the
  // value and the dimmed rows together (rules of the road, rule 1). The table
  // said «search changed» only after its own render, so the view's loading
  // mark was a second one.
  const searched = await page.evaluate(async () => {
    const table = document.getElementById('t');
    const Table = customElements.get('sf-table');
    let renders = 0;
    const own = Table.prototype.template;
    Table.prototype.template = function (...args) { if (this === table) renders += 1; return own.apply(this, args); };
    table.updateSearchState({value: 'bo'});
    await new Promise((done) => setTimeout(done, 80));
    const beforeAnswer = {renders, dimmed: Boolean(document.querySelector('#t tbody[data-busy]'))};
    await new Promise((done) => setTimeout(done, 300));
    Table.prototype.template = own;
    return {beforeAnswer, total: renders};
  });
  if (searched.beforeAnswer.renders !== 1 || !searched.beforeAnswer.dimmed || searched.total !== 2) {
    note({case: 'a search: one render before the answer, one with it', got: searched});
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('DATA_VIEW_RELOADS_OK');
