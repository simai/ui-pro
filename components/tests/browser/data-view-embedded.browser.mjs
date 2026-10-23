#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The three things an embedded list needs, measured on the built bytes: the parts
// a consumer can leave out, the row cap and the show-all it puts under a capped
// list, and the host-port request a composed component raises instead of waiting
// to be handed a port. Each of these is the kind of input that can be declared
// and do nothing, so each is measured where it shows rather than where it is set.
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
     <script>
       // Installed before the modules define the elements, because the request is
       // raised at connection: a listener added afterwards would see nothing and
       // the measurement would read as «the component never asks».
       window.__portAsks = [];
       document.addEventListener('sf-host-port-request', (event) => {
         window.__portAsks.push({id: event.target.id, context: event.detail.context});
       });
     </script>
     <div id="host" style="width:900px">
       <sf-data-view id="page-list">
         <sf-table slot="content" id="page-table" toolbar="false"></sf-table>
         <sf-pagination slot="pagination" id="page-pages" total="100" page-size="10" current="1"></sf-pagination>
       </sf-data-view>
       <sf-data-view id="embedded" chrome="" row-cap="3" port-owner="property-view" port-record="record-7" port-group="related">
         <sf-table slot="content" id="embedded-table" toolbar="false"></sf-table>
         <sf-pagination slot="pagination" id="embedded-pages"></sf-pagination>
       </sf-data-view>
     </div>
   </body></html>`,
);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(900);

try {
  // An undefined element has no behaviour, so every measurement of it is false in
  // the same direction: it reads as the feature being broken.
  const unupgraded = await page.evaluate(() => ['sf-data-view', 'sf-table', 'sf-pagination']
    .filter((tag) => !customElements.get(tag)));
  if (unupgraded.length) throw new Error(`not defined on the page: ${unupgraded.join(', ')}`);

  const measured = await page.evaluate(async () => {
    // The host-port request is the first thing to measure, and it has to be
    // measured on a listener that was already there: the elements connected
    // before this script ran, so a request raised at connection has already
    // happened. The page listens from the start instead.
    const asked = window.__portAsks ?? [];
    const rows = (count) => Array.from({length: count}, (_, index) => ({
      id: String(index), name: `N${index}`, revision: 'r1', actions: [],
    }));
    const answer = (records, total, countKnown) => ({
      answer: 'applied',
      data: {
        records, total,
        columns: [{key: 'name', label: 'Name', role: 'title', width: 200}],
        echo: {search: '', filters: {}, sort: [], page: 1, per_page: 10},
        ...(countKnown ? {} : {has_next: true}),
      },
    });

    const embedded = document.getElementById('embedded');
    const raised = [];
    embedded.setHostPort({
      version: '1.6.0', capabilities: [],
      async raise(intent, payload) {
        raised.push({intent, payload: JSON.parse(JSON.stringify(payload ?? {}))});
        if (intent !== 'query.change') return {answer: 'applied'};
        return {...answer(rows(8), 8, true), sequence: payload.sequence};
      },
    });
    await new Promise((done) => setTimeout(done, 700));

    const shadow = embedded.shadowRoot;
    // In the light DOM now, as an sf-button: the Framework's stylesheets do not
    // cross a shadow boundary, and a consumer reported the previous version as a
    // native grey button beside «5 of 61».
    const showAll = embedded.querySelector(':scope > [slot="show-all"]');
    const before = raised.length;
    showAll?.querySelector('[data-show-all]')?.click();
    await new Promise((done) => setTimeout(done, 300));
    const listOpen = raised.slice(before).find((entry) => entry.intent === 'list.open') ?? null;

    const pageList = document.getElementById('page-list');
    pageList.setHostPort({
      version: '1.6.0', capabilities: [],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {...answer(rows(8), 8, true), sequence: payload.sequence};
      },
    });
    await new Promise((done) => setTimeout(done, 700));
    const pageShadow = pageList.shadowRoot;

    return {
      // Which component asked, and with what context. A page list asks about
      // nothing but itself, so its context is empty rather than invented.
      asked: asked.map((entry) => ({id: entry.id, context: entry.context})),
      // The cap is what reaches the rows, not what the host was asked for: the
      // query is the host's and a cap is what this element shows of it.
      cappedRows: document.querySelectorAll('#embedded-table tbody tr').length,
      uncappedRows: document.querySelectorAll('#page-table tbody tr').length,
      queryPerPage: raised.find((entry) => entry.intent === 'query.change')?.payload?.query?.per_page ?? null,
      showAllVisible: Boolean(showAll),
      // The band holds an sf-button. The `[data-show-all]` attribute is not on it:
      // sf-button forwards a data attribute to the native button it renders, which
      // is why the click handler still sees it and why asserting the tag of the
      // element carrying that attribute measured the inner button instead.
      showAllIsFrameworkButton: showAll ? Boolean(showAll.querySelector('sf-button')) : null,
      showAllText: showAll?.querySelector('sf-button')?.getAttribute('text') ?? null,
      showAllCount: showAll?.querySelector('[data-show-count]')?.textContent?.trim() ?? null,
      listOpenReason: listOpen?.payload?.reason ?? null,
      listOpenCarriesQuery: listOpen ? 'query' in listOpen.payload : null,
      // chrome="" leaves out the two parts that draw themselves, and leaves the
      // status line, which is the one a broken load speaks through.
      embeddedToolbarHidden: shadow.querySelector('[part="toolbar"]')?.hidden ?? null,
      // Hidden on the screen, not only in the attribute: the toolbar's own
      // display beat it, and the bare search showed (Larena, 2026-10-14).
      embeddedToolbarDrawn: (() => {
        const bar = shadow.querySelector('[part="toolbar"]');
        return bar ? getComputedStyle(bar).display !== 'none' : null;
      })(),
      embeddedPagesHidden: shadow.querySelector('slot[name="pagination"]')?.hidden ?? null,
      embeddedStatusPresent: Boolean(shadow.querySelector('[part="status"]')),
      pageToolbarHidden: pageShadow.querySelector('[part="toolbar"]')?.hidden ?? null,
      pagePagesHidden: pageShadow.querySelector('slot[name="pagination"]')?.hidden ?? null,
      pageShowAllVisible: Boolean(pageList.querySelector(':scope > [slot="show-all"]')),
    };
  });

  const m = measured;
  if (m.embeddedToolbarDrawn !== false) {
    note({case: 'chrome="" draws no toolbar', got: m.embeddedToolbarDrawn, expected: 'the hidden toolbar takes no room on the screen'});
  }
  if (m.asked.length !== 2) {
    note({case: 'every list with no port asks for one, once', got: m.asked,
      expected: 'two requests, one per element, raised at connection before any port was set'});
  }
  const embeddedAsk = m.asked.find((entry) => entry.id === 'embedded');
  if (embeddedAsk?.context?.owner !== 'property-view' || embeddedAsk?.context?.group !== 'related'
    || embeddedAsk?.context?.record !== 'record-7') {
    note({case: 'an embedded list says which composite is asking and about what',
      got: embeddedAsk?.context,
      expected: {owner: 'property-view', record: 'record-7', group: 'related'}});
  }
  const pageAsk = m.asked.find((entry) => entry.id === 'page-list');
  if (pageAsk?.context?.owner !== null || pageAsk?.context?.group !== null) {
    note({case: 'a page list asks about nothing but itself', got: pageAsk?.context,
      expected: 'owner and group null rather than invented'});
  }
  if (m.cappedRows !== 3 || m.uncappedRows !== 8) {
    note({case: 'the cap is what reaches the rows, and no cap means all of them',
      got: {capped: m.cappedRows, uncapped: m.uncappedRows}, expected: {capped: 3, uncapped: 8}});
  }
  if (m.queryPerPage === 3) {
    note({case: 'a cap does not become the page size the host is asked for',
      got: m.queryPerPage,
      expected: "the host's own per_page -- a cap is what this element shows of a page it already has"});
  }
  if (m.showAllIsFrameworkButton !== true) {
    note({case: 'show all is a Framework button in the light DOM, not a native one in a shadow tree',
      got: m.showAllIsFrameworkButton,
      expected: "an sf-button -- the Framework's stylesheets do not cross a shadow boundary"});
  }
  if (m.showAllVisible !== true || !m.showAllText) {
    note({case: 'a capped list hiding rows offers to show all of them',
      got: {visible: m.showAllVisible, text: m.showAllText}, expected: 'visible, with a word on it'});
  }
  if (m.showAllCount !== '3 of 8') {
    note({case: 'the count says how much of how many, once the host has said how many',
      got: m.showAllCount, expected: '3 of 8'});
  }
  if (m.listOpenReason !== 'row-cap' || m.listOpenCarriesQuery !== true) {
    note({case: 'show all asks the host to open the whole list, carrying the query',
      got: {reason: m.listOpenReason, query: m.listOpenCarriesQuery},
      expected: "reason row-cap and the query -- the component builds no address"});
  }
  if (m.embeddedToolbarHidden !== true || m.embeddedPagesHidden !== true) {
    note({case: 'chrome="" leaves out the parts that draw themselves',
      got: {toolbar: m.embeddedToolbarHidden, pagination: m.embeddedPagesHidden}, expected: 'both out'});
  }
  if (m.embeddedStatusPresent !== true) {
    note({case: 'the status line is not something chrome can remove',
      got: m.embeddedStatusPresent,
      expected: 'present -- a list that could not say a load failed would look empty when it is broken'});
  }
  if (m.pageToolbarHidden !== false || m.pagePagesHidden !== false || m.pageShowAllVisible !== false) {
    note({case: 'a list that asks for nothing is what it was before',
      got: {toolbar: m.pageToolbarHidden, pagination: m.pagePagesHidden, showAll: m.pageShowAllVisible},
      expected: 'both parts drawn and no show-all row'});
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('DATA_VIEW_EMBEDDED_OK');
