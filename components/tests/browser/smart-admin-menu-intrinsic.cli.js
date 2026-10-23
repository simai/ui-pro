async page => {
  const base = 'http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const dependencies = ['buttons', 'context-menu', 'admin-menu', 'icons', 'icon-buttons', 'inputs', 'badges'];
  const errors = [], failures = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => {
    if (event.type() === 'error') errors.push(event.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));

  const prepare = async (example, {width, theme, dir}) => {
    await page.setViewportSize({width, height: 900});
    await page.emulateMedia({forcedColors: 'none', reducedMotion: 'reduce'});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    for (const name of dependencies) await page.addStyleTag({url: `${base}/component/${name}/css/${name}.css`});
    for (const name of dependencies) await page.addScriptTag({url: `${base}/smart/${name}/js/${name}.js`});
    await page.evaluate(async ({base, example, width, theme, dir}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      document.documentElement.style.fontSize = width === 390 ? '20px' : '16px';
      document.querySelector('main').innerHTML = `<div class="grid">${await (await fetch(`${base}/examples/${example}/index.html`)).text()}</div>`;
    }, {base, example, width, theme, dir});
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.querySelector('.sf-admin-menu-main'));
    await page.waitForTimeout(250);
  };

  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await prepare('smart-admin-menu-natural', {width, theme, dir});
    const row = await page.evaluate(() => {
      const host = document.querySelector('sf-admin-menu');
      const main = host.querySelector('.sf-admin-menu-main');
      const items = [...main.querySelectorAll(':scope > ul > .sf-admin-menu-item-wrap:not(.more)')];
      const more = main.querySelector('.more');
      return {
        sourceCount: items.length,
        visibleCount: items.filter(item => item.getClientRects().length && !item.classList.contains('hidden')).length,
        noDisclosure: !more?.getClientRects().length,
        currentNative: Boolean(main.querySelector('a[aria-current="page"]')),
        disabledSemantic: Boolean(main.querySelector('[aria-disabled="true"]:not(a):not(button)')),
        naturalFits: main.scrollHeight <= main.clientHeight + 1,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });
    const verdict = {width, theme, dir, allVisible: row.sourceCount === 4 && row.visibleCount === 4, ...row};
    if (width === 390 && theme === 'light' && dir === 'ltr') await page.screenshot({path: 'output/playwright/smart-admin-menu-natural-mobile.png', fullPage: true});
    if (Object.entries(verdict).some(([key, value]) => !['width', 'theme', 'dir', 'sourceCount', 'visibleCount'].includes(key) && !value)) failures.push(verdict);
    results.push(verdict);
  }

  for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await prepare('smart-admin-menu-overflow', {width: 390, theme, dir});
    await page.waitForFunction(() => document.querySelector('.sf-admin-menu-main .more')?.getClientRects().length > 0);
    const before = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.sf-admin-menu-main > ul > .sf-admin-menu-item-wrap:not(.more)')];
      return {visible: items.filter(item => item.getClientRects().length).length, hidden: items.filter(item => !item.getClientRects().length).length};
    });
    const disclosure = page.getByRole('button', {name: /Развернуть/});
    await disclosure.focus();
    const focusVisible = await disclosure.evaluate(element => element.matches(':focus-visible'));
    await page.keyboard.press('Enter');
    const expanded = await page.evaluate(() => {
      const main = document.querySelector('.sf-admin-menu-main');
      const items = [...main.querySelectorAll(':scope > ul > .sf-admin-menu-item-wrap:not(.more)')];
      return {
        allVisible: items.every(item => item.getClientRects().length > 0),
        scrollable: main.scrollHeight > main.clientHeight,
        collapseNamed: main.querySelector('.more button')?.textContent.includes('Свернуть') || false,
      };
    });
    if (theme === 'dark' && dir === 'rtl') await page.screenshot({path: 'output/playwright/smart-admin-menu-overflow-dark-rtl.png', fullPage: true});
    await page.getByRole('button', {name: /Свернуть/}).focus();
    await page.keyboard.press('Enter');
    const collapsed = await page.evaluate(() => ({
      hidden: [...document.querySelectorAll('.sf-admin-menu-main > ul > .sf-admin-menu-item-wrap:not(.more)')].some(item => !item.getClientRects().length),
      expandNamed: document.querySelector('.sf-admin-menu-main .more button')?.textContent.includes('Развернуть') || false,
    }));
    const verdict = {theme, dir, hasVisible: before.visible > 0, hasHidden: before.hidden > 0, focusVisible, expandedAllVisible: expanded.allVisible, expandedScrollable: expanded.scrollable, collapseNamed: expanded.collapseNamed, collapsedHidden: collapsed.hidden, expandNamed: collapsed.expandNamed};
    if (Object.entries(verdict).some(([key, value]) => !['theme', 'dir'].includes(key) && !value)) failures.push(verdict);
    results.push(verdict);
  }

  return {status: failures.length || errors.length ? 'failed' : 'passed', cases: results.length, failures, errors, results};
}
