async page => {
  const url = 'http://127.0.0.1:8766/ui-source/tests/fixtures/table-loader-lab.html';
  const errors = [];
  const failures = [];
  const results = [];

  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => {
    if (event.type() === 'error') errors.push(event.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^https?:/.test(requestUrl) && !requestUrl.startsWith('http://127.0.0.1:8766/')) {
      errors.push(`external request: ${requestUrl}`);
    }
  });
  await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));

  const load = async ({theme = 'light', dir = 'ltr', width = 390, height = 844} = {}) => {
    await page.setViewportSize({width, height});
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('sf-table .sf-table').length === 2);
    await page.evaluate(({theme, dir}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      const table = document.querySelector('sf-table');
      table.setColumns([
        {key: 'name', label: 'Имя', resizable: true, colWidth: '180px'},
        {key: 'role', label: 'Роль', resizable: true, colWidth: '160px'},
      ]);
      table.setRows([{id: 1, name: 'Анна', role: 'Редактор'}]);
    }, {theme, dir});
    await page.waitForFunction(() => document.querySelectorAll('#column_resizer_name button').length === 1);
    await page.waitForFunction(() => {
      const icons = [...document.querySelectorAll('sf-table .sf-icon')]
        .filter(icon => icon.textContent.trim());
      return icons.length > 0 && icons.every(icon => icon.classList.contains('sf-icon-loaded'));
    });
  };

  for (const theme of ['light', 'dark']) {
    for (const dir of ['ltr', 'rtl']) {
      await load({theme, dir});
      const resizer = page.getByRole('button', {name: 'Изменить ширину столбца: Имя'});
      await resizer.focus();
      const before = await page.locator('sf-table').first().locator('th[data-key="name"]').evaluate(node => node.getBoundingClientRect().width);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      const after = await page.locator('sf-table').first().locator('th[data-key="name"]').evaluate(node => node.getBoundingClientRect().width);
      const geometry = await page.evaluate(() => ({
        noDocumentOverflow: document.documentElement.scrollWidth <= innerWidth,
        loaderComplete: [
          '/smart/table/',
          '/smart/buttons/',
          '/smart/checkbox/',
          '/smart/context-menu/',
          '/smart/datepicker/',
          '/smart/dropdown/',
          '/smart/icon-buttons/',
          '/smart/inputs/',
          '/smart/pagination/',
          '/smart/spinner/',
          '/smart/tabs/',
          '/smart/tags/',
        ].every(fragment => performance.getEntriesByType('resource').some(entry => entry.name.includes(fragment))),
        tableRefConnected: document.querySelector('sf-table').refs.table.value?.isConnected === true,
        settingsActionsRespectProps:
          document.querySelectorAll('button[aria-label="Настройки таблицы"]').length === 1 &&
          document.querySelectorAll('button[aria-label="Дополнительные действия создания"]').length === 1,
        tableNamed: document.querySelector('sf-table table')?.getAttribute('aria-label') === 'Сотрудники',
        iconsRendered: [...document.querySelectorAll('sf-table .sf-icon')]
          .filter(icon => icon.textContent.trim())
          .every(icon => icon.classList.contains('sf-icon-loaded') && parseFloat(getComputedStyle(icon).fontSize) > 0),
        focusPreserved: document.activeElement?.getAttribute('aria-label') === 'Изменить ширину столбца: Имя',
      }));
      await page.getByRole('button', {name: 'Настройки таблицы'}).click();
      await page.waitForFunction(() => document.querySelector('.sf-table-portal sf-context-menu'));
      const overlay = await page.evaluate(() => {
        const menu = document.querySelector('.sf-table-portal sf-context-menu');
        const surface = menu.querySelector('.sf-context-menu') || menu;
        const rect = surface.getBoundingClientRect();
        return {
          named: Boolean(menu.getAttribute('aria-label')),
          fitsInline: rect.left >= -1 && rect.right <= innerWidth + 1,
          fitsBlock: rect.top >= -1 && rect.bottom <= innerHeight + 1,
        };
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      const escapeRestoresFocus = await page.evaluate(() =>
        document.activeElement?.getAttribute('aria-label') === 'Настройки таблицы' &&
        !document.querySelector('.sf-table-portal sf-context-menu')
      );
      const resizeDirectionCorrect = dir === 'rtl' ? after < before : after > before;
      const row = {theme, dir, before, after, resizeDirectionCorrect, escapeRestoresFocus, ...geometry, ...overlay};
      if (Object.entries(row).some(([key, value]) => !['theme', 'dir', 'before', 'after'].includes(key) && value !== true)) {
        failures.push(row);
      }
      results.push(row);
    }
  }

  await load({width: 900, height: 700});
  const stateResult = await page.evaluate(async () => {
    const table = document.querySelectorAll('sf-table')[1];
    let retries = 0;
    table.addEventListener('sf-table-retry', () => retries += 1);
    table.setDataState('loading');
    await new Promise(resolve => setTimeout(resolve, 80));
    const loading = Boolean(table.querySelector('[role="status"]')) && table.querySelector('.sf-table')?.getAttribute('aria-busy') === 'true';
    table.setDataState('empty');
    await new Promise(resolve => setTimeout(resolve, 80));
    const empty = table.textContent.includes('Нет данных');
    table.setDataState('error');
    await new Promise(resolve => setTimeout(resolve, 80));
    table.querySelector('[role="alert"] sf-button button')?.click();
    await new Promise(resolve => setTimeout(resolve, 40));
    return {loading, empty, error: Boolean(table.querySelector('[role="alert"]')), retry: retries === 1};
  });
  if (Object.values(stateResult).some(value => value !== true)) failures.push({stateResult});
  results.push({states: stateResult});

  await load({width: 900, height: 700});
  const lifecycle = await page.evaluate(async () => {
    const tables = [...document.querySelectorAll('sf-table')];
    tables[1].setAttribute('settings', 'true');
    await new Promise(resolve => setTimeout(resolve, 80));
    const triggers = tables.map(table => table.querySelector('button[aria-label="Настройки таблицы"]'));
    const fakeEvent = currentTarget => ({currentTarget, target: currentTarget, preventDefault() {}, stopPropagation() {}});
    tables[0].openContextMenu(fakeEvent(triggers[0]), {menu: 'table-settings'});
    tables[1].openContextMenu(fakeEvent(triggers[1]), {menu: 'table-settings'});
    await new Promise(resolve => setTimeout(resolve, 100));
    const independent = document.querySelectorAll('.sf-table-portal').length === 2 && document.querySelectorAll('.sf-table-portal sf-context-menu').length === 2;
    tables[0].remove();
    await new Promise(resolve => setTimeout(resolve, 80));
    return {
      independent,
      disposed: document.querySelectorAll('.sf-table-portal').length === 1,
      survivorOpen: document.querySelectorAll('.sf-table-portal sf-context-menu').length === 1,
    };
  });
  if (Object.values(lifecycle).some(value => value !== true)) failures.push({lifecycle});
  results.push({lifecycle});

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', {pageScaleFactor: 1});
  await load({width: 1280, height: 900});
  await page.getByRole('button', {name: 'Настройки таблицы'}).click();
  await page.waitForFunction(() => document.querySelector('.sf-table-portal sf-context-menu'));
  await cdp.send('Emulation.setPageScaleFactor', {pageScaleFactor: 2});
  await page.waitForFunction(() => visualViewport?.scale === 2);
  await page.waitForTimeout(150);
  const zoom = await page.evaluate(() => {
    const viewport = visualViewport;
    const menu = document.querySelector('.sf-table-portal sf-context-menu');
    const rect = (menu.querySelector('.sf-context-menu') || menu).getBoundingClientRect();
    return {
      scale: viewport.scale,
      fitsInline: rect.left >= viewport.offsetLeft - 1 && rect.right <= viewport.offsetLeft + viewport.width + 1,
      fitsBlock: rect.top >= viewport.offsetTop - 1 && rect.bottom <= viewport.offsetTop + viewport.height + 1,
    };
  });
  if (zoom.scale !== 2 || !zoom.fitsInline || !zoom.fitsBlock) failures.push({zoom});
  results.push({zoom});
  await cdp.send('Emulation.setPageScaleFactor', {pageScaleFactor: 1});

  return {
    status: errors.length || failures.length ? 'failed' : 'passed',
    cases: 7,
    errors,
    failures,
    results,
  };
}
