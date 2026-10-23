async page => {
  const base = 'http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const errors = [], failures = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => {
    if (event.type() === 'error') errors.push(event.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));

  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await page.setViewportSize({width, height: 900});
    await page.emulateMedia({forcedColors: 'none', reducedMotion: 'reduce'});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    await page.addStyleTag({url: `${base}/component/admin-menu/css/admin-menu.css`});
    await page.addScriptTag({url: `${base}/component/admin-menu/js/admin-menu.js`});
    await page.evaluate(async ({base, theme, dir, width}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      document.documentElement.style.fontSize = width === 390 ? '20px' : '16px';
      document.querySelector('main').innerHTML = await (await fetch(`${base}/examples/admin-menu-overview/index.html`)).text();
    }, {base, theme, dir, width});
    await page.waitForFunction(() => document.querySelector('.sf-admin-menu')?.dataset.sfAdminMenuBound === '1');
    await page.waitForTimeout(50);

    const natural = await page.evaluate(() => {
      const menu = document.querySelector('.sf-admin-menu');
      const main = menu.querySelector('.sf-admin-menu-main');
      const sourceItems = [...main.querySelectorAll(':scope > ul > .sf-admin-menu-item-wrap:not(.more)')];
      const more = main.querySelector(':scope > ul > .sf-admin-menu-item-wrap.more');
      const current = main.querySelector('[aria-current="page"]');
      const disabled = main.querySelector('[disabled]');
      return {
        sourceCount: sourceItems.length,
        visibleCount: sourceItems.filter(item => item.getClientRects().length > 0 && !item.classList.contains('hidden')).length,
        moreVisible: Boolean(more && more.getClientRects().length),
        mainClientHeight: main.clientHeight,
        mainScrollHeight: main.scrollHeight,
        currentNative: Boolean(current && current.matches('a')),
        disabledNative: disabled ? disabled.matches('button:disabled') : true,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    const row = {
      width, theme, dir,
      naturalAllVisible: natural.sourceCount === 3 && natural.visibleCount === 3,
      naturalNoDisclosure: natural.moreVisible === false,
      naturalFitsContent: natural.mainClientHeight >= natural.mainScrollHeight,
      currentNative: natural.currentNative,
      disabledNative: natural.disabledNative,
      noHorizontalOverflow: natural.horizontalOverflow === false,
      natural,
    };
    if ((width === 390 && theme === 'light' && dir === 'ltr') || (width === 1280 && theme === 'dark' && dir === 'rtl')) {
      await page.screenshot({path: `output/playwright/admin-menu-natural-${width}-${theme}-${dir}.png`, fullPage: true});
    }
    if (Object.entries(row).some(([key, value]) => !['width', 'theme', 'dir', 'natural'].includes(key) && !value)) failures.push(row);
    results.push(row);
  }

  for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await page.setViewportSize({width: 390, height: 900});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    await page.addStyleTag({url: `${base}/component/admin-menu/css/admin-menu.css`});
    await page.addScriptTag({url: `${base}/component/admin-menu/js/admin-menu.js`});
    await page.evaluate(async ({base, theme, dir}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      document.querySelector('main').innerHTML = await (await fetch(`${base}/examples/admin-menu-overflow/index.html`)).text();
    }, {base, theme, dir});
    await page.waitForFunction(() => document.querySelector('.sf-admin-menu')?.dataset.sfAdminMenuBound === '1');
    await page.waitForFunction(() => document.querySelector('.sf-admin-menu-item-wrap.more')?.getClientRects().length > 0);

    const before = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.sf-admin-menu-main > ul > .sf-admin-menu-item-wrap:not(.more)')];
      return {visible: items.filter(item => item.getClientRects().length).length, hidden: items.filter(item => !item.getClientRects().length).length};
    });
    if (theme === 'light' && dir === 'ltr') await page.screenshot({path: 'output/playwright/admin-menu-overflow-collapsed-light.png', fullPage: true});
    const disclosure = page.getByRole('button', {name: /Развернуть/});
    await disclosure.focus();
    const focusVisible = await disclosure.evaluate(element => element.matches(':focus-visible'));
    await page.keyboard.press('Enter');
    const expanded = await page.evaluate(() => {
      const main = document.querySelector('.sf-admin-menu-main');
      const items = [...main.querySelectorAll(':scope > ul > .sf-admin-menu-item-wrap:not(.more)')];
      return {allVisible: items.every(item => item.getClientRects().length > 0), scrollable: main.scrollHeight > main.clientHeight, label: main.querySelector('.more button')?.textContent.trim() || ''};
    });
    if (theme === 'dark' && dir === 'rtl') await page.screenshot({path: 'output/playwright/admin-menu-overflow-expanded-dark-rtl.png', fullPage: true});
    await page.getByRole('button', {name: /Свернуть/}).focus();
    await page.keyboard.press('Enter');
    const collapsed = await page.evaluate(() => ({label: document.querySelector('.more button')?.textContent.trim() || '', hidden: [...document.querySelectorAll('.sf-admin-menu-main > ul > .sf-admin-menu-item-wrap:not(.more)')].some(item => !item.getClientRects().length)}));
    const row = {theme, dir, constrainedHasVisibleItems: before.visible > 0, constrainedHasHiddenItems: before.hidden > 0, focusVisible, expandedAllVisible: expanded.allVisible, expandedScrollable: expanded.scrollable, expandedLabel: expanded.label.includes('Свернуть'), collapsedHidden: collapsed.hidden, collapsedLabel: collapsed.label.includes('Развернуть')};
    if (Object.entries(row).some(([key, value]) => !['theme', 'dir'].includes(key) && !value)) failures.push(row);
    results.push(row);
  }

  for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await page.setViewportSize({width: 390, height: 900});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    await page.addStyleTag({url: `${base}/component/admin-menu/css/admin-menu.css`});
    await page.evaluate(async ({base, theme, dir}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      document.querySelector('main').innerHTML = await (await fetch(`${base}/examples/admin-menu-submenu/index.html`)).text();
    }, {base, theme, dir});
    const back = page.getByRole('button', {name: 'Все разделы'});
    await back.focus();
    const beforeTab = await back.evaluate(element => element.matches(':focus-visible'));
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => ({
      currentLink: Boolean(document.querySelector('a[aria-current="page"]')),
      disabledButton: Boolean(document.querySelector('button:disabled')),
      tabReachedCurrent: document.activeElement?.matches('a[aria-current="page"]') || false,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    const row = {theme, dir, backFocusVisible: beforeTab, currentLink: state.currentLink, disabledButton: state.disabledButton, tabReachedCurrent: state.tabReachedCurrent, noHorizontalOverflow: !state.horizontalOverflow};
    if (Object.entries(row).some(([key, value]) => !['theme', 'dir'].includes(key) && !value)) failures.push(row);
    results.push(row);
  }

  return {status: failures.length || errors.length ? 'failed' : 'passed', cases: results.length, failures, errors, results};
}
