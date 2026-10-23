async page => {
  const base = 'http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const dependencies = ['buttons', 'context-menu', 'admin-menu', 'icons', 'icon-buttons', 'inputs', 'badges'];
  const errors = [], failures = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));

  const prepare = async ({width, theme, dir}) => {
    await page.setViewportSize({width, height: 900});
    await page.emulateMedia({forcedColors: 'none', reducedMotion: 'reduce'});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    for (const name of dependencies) await page.addStyleTag({url: `${base}/component/${name}/css/${name}.css`});
    for (const name of dependencies) await page.addScriptTag({url: `${base}/smart/${name}/js/${name}.js`});
    await page.evaluate(async ({base, width, theme, dir}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      document.documentElement.style.fontSize = width === 390 ? '20px' : '16px';
      document.querySelector('main').innerHTML = await (await fetch(`${base}/examples/smart-admin-menu-search/index.html`)).text();
    }, {base, width, theme, dir});
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.querySelector('.sf-admin-menu-main'));
    await page.waitForTimeout(200);
  };

  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await prepare({width, theme, dir});
    const host = page.locator('sf-admin-menu');
    const closed = await host.evaluate(element => ({
      allInactive: [...element.querySelectorAll('[data-panel]')].every(panel => panel.inert && panel.getAttribute('aria-hidden') === 'true'),
      noInactiveFocus: !element.querySelector('[data-panel]')?.contains(document.activeElement),
    }));

    await host.evaluate(element => element.setAttribute('compact', ''));
    const searchToggle = host.locator('.sf-admin-menu-search > button');
    const localizedSearch = await searchToggle.getAttribute('aria-label');
    await searchToggle.focus();
    await page.keyboard.press('Enter');
    const input = host.locator('sf-input[name="sf_admin_search_input"] input');
    await page.waitForFunction(() => document.activeElement?.matches('sf-admin-menu sf-input input'));
    await input.fill('Про');
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.state?.searchQuery === 'Про');
    await page.waitForTimeout(250);

    const searchState = await host.evaluate(element => {
      const main = element.querySelector(':scope > .sf-admin-menu > .sf-admin-menu-panel');
      const search = element.querySelector('[data-panel="search_panel"]');
      const mainRect = main.getBoundingClientRect();
      const searchRect = search.getBoundingClientRect();
      const labels = element.state.searchResults.map(item => item.label);
      const mobile = innerWidth <= 520;
      const searchCenter = {
        x: searchRect.left + searchRect.width / 2,
        y: searchRect.top + searchRect.height / 2,
      };
      const placed = mobile
        ? Math.abs(searchRect.left - mainRect.left) < 1
        : document.documentElement.dir === 'rtl'
          ? Math.abs(searchRect.right - mainRect.left) < 1
          : Math.abs(searchRect.left - mainRect.right) < 1;
      return {
        labels,
        placed,
        searchTopmost: search.contains(document.elementFromPoint(searchCenter.x, searchCenter.y)),
        disabledExcluded: !labels.includes('Архив проектов'),
        hiddenExcluded: !labels.includes('Скрытые проекты'),
        prefixFirst: labels.slice(0, 2).every(label => ['Продукты', 'Проекты'].includes(label)),
        inputFocused: document.activeElement === element.getSearchInput(),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });

    const workspaceResult = host.locator('.sf-admin-menu-search-results > li > button').filter({hasText: 'Рабочее пространство'}).first();
    await workspaceResult.focus();
    await page.keyboard.press('Enter');
    const workspace = host.locator('[data-panel="workspace"]');
    const workspaceBack = workspace.getByRole('button', {name: 'Назад', exact: true});
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Назад');
    const forwardState = await host.evaluate(element => {
      const panel = element.querySelector('[data-panel="workspace"]');
      const main = element.querySelector(':scope > .sf-admin-menu > .sf-admin-menu-panel');
      const forwardIcon = element.getPanelTrigger('workspace')?.querySelector('.sf-admin-menu-direction-icon');
      const backIcon = panel.querySelector('.sf-admin-menu-back-button .sf-icon');
      return {
        panelInteractive: !panel.inert && !panel.hasAttribute('aria-hidden'),
        mainInactive: main.inert && main.getAttribute('aria-hidden') === 'true',
        searchInactive: element.querySelector('[data-panel="search_panel"]').inert,
        backFocused: document.activeElement === element.getPanelBackButton('workspace'),
        forwardTransform: getComputedStyle(forwardIcon).transform,
        backTransform: getComputedStyle(backIcon).transform,
      };
    });

    const settingsButton = workspace.getByRole('button', {name: /Настройки/});
    await settingsButton.focus();
    await page.keyboard.press('Enter');
    const settings = host.locator('[data-panel="settings"]');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Назад' && document.activeElement?.closest('[data-panel]')?.dataset.panel === 'settings');
    const deepState = await host.evaluate(element => ({
      parentInactive: element.querySelector('[data-panel="workspace"]').inert,
      childInteractive: !element.querySelector('[data-panel="settings"]').inert,
      childBackFocused: document.activeElement === element.getPanelBackButton('settings'),
    }));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const element = document.querySelector('sf-admin-menu');
      return document.activeElement === element?.getPanelTrigger('settings');
    });
    const childReturn = await settingsButton.evaluate(element => document.activeElement === element);
    await workspaceBack.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const element = document.querySelector('sf-admin-menu');
      return document.activeElement === element?.getPanelTrigger('workspace');
    });
    const parentReturn = await host.evaluate(element => document.activeElement === element.getPanelTrigger('workspace'));

    await input.focus();
    await input.fill('');
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.state?.searchQuery === '');
    const emptyState = await host.evaluate(element => ({
      resultsEmpty: element.state.searchResults.length === 0,
      searchClosed: !element.state.panels.search_panel.open && element.querySelector('[data-panel="search_panel"]').inert,
      inputFocused: document.activeElement === element.getSearchInput(),
    }));

    await input.fill('Продукты');
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.state?.searchQuery === 'Продукты');
    const leaf = host.locator('.sf-admin-menu-search-results a').filter({hasText: 'Продукты'});
    const nativeLeaf = await leaf.evaluate(element => element.tagName === 'A' && element.getAttribute('href') === '#products');
    await page.waitForTimeout(250);
    await page.evaluate(async () => {
      await document.fonts.load('24px "Material Symbols Outlined"');
      document.querySelectorAll('.sf-icon').forEach(icon => icon.classList.add('sf-icon-loaded'));
    });

    if (width === 390 && theme === 'light' && dir === 'ltr') await page.screenshot({path: 'output/playwright/smart-admin-menu-navigation-mobile.png', fullPage: true});
    if (width === 1280 && theme === 'dark' && dir === 'rtl') await page.screenshot({path: 'output/playwright/smart-admin-menu-navigation-dark-rtl.png', fullPage: true});
    await leaf.evaluate(element => element.click());
    const leafNavigated = await page.evaluate(() => location.hash === '#products');

    const iconsMirrored = dir === 'rtl'
      ? forwardState.forwardTransform !== 'none' && forwardState.backTransform !== 'none'
      : forwardState.forwardTransform === 'none' && forwardState.backTransform === 'none';
    const row = {width, theme, dir, localizedSearch: localizedSearch === 'Поиск по разделам', ...closed, ...searchState, ...forwardState, ...deepState, childReturn, parentReturn, ...emptyState, nativeLeaf, leafNavigated, iconsMirrored};
    const ignored = new Set(['width', 'theme', 'dir', 'labels', 'forwardTransform', 'backTransform']);
    if (Object.entries(row).some(([key, value]) => !ignored.has(key) && value !== true)) failures.push(row);
    results.push(row);
  }

  return {status: failures.length || errors.length ? 'failed' : 'passed', cases: results.length, failures, errors, results};
}
