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

  for (const rootSize of [16, 20]) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await page.setViewportSize({width: 1280, height: 900});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    await page.addStyleTag({url: `${base}/component/admin-menu/css/admin-menu.css`});
    await page.evaluate(async ({base, rootSize, theme, dir}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      document.documentElement.style.fontSize = `${rootSize}px`;
      document.documentElement.style.setProperty('--sf-radius--ui', '2px');
      document.documentElement.style.setProperty('--sf-radius--surface', '20px');
      document.documentElement.style.setProperty('--sf-px', '2px');
      document.querySelector('main').innerHTML = await (await fetch(`${base}/examples/admin-menu-overview/index.html`)).text();
      const firstWrap = document.querySelector('.sf-admin-menu-item-wrap');
      firstWrap.classList.add('sf-admin-menu-item-segment');
      const divider = document.createElement('div');
      divider.className = 'sf-admin-menu-divider';
      divider.innerHTML = '<span class="block"></span>';
      document.querySelector('.sf-admin-menu-main > ul').append(divider);
    }, {base, rootSize, theme, dir});

    const first = page.getByRole('link', {name: 'Обзор'});
    await first.focus();
    const row = await page.evaluate(() => {
      const panel = document.querySelector('.sf-admin-menu-panel');
      const item = document.querySelector('.sf-admin-menu-item');
      const segment = document.querySelector('.sf-admin-menu-item-segment');
      const bottom = document.querySelector('.sf-admin-menu-bottom');
      const head = document.querySelector('.sf-admin-menu-head');
      const divider = document.querySelector('.sf-admin-menu-divider span');
      const tokenProbe = name => {
        const probe = document.createElement('i');
        probe.style.cssText = `position:absolute;inline-size:var(${name});block-size:0`;
        document.body.append(probe);
        const value = probe.getBoundingClientRect().width;
        probe.remove();
        return value;
      };
      const naturalWidth = panel.getBoundingClientRect().width;
      panel.classList.add('small');
      const compactWidth = panel.getBoundingClientRect().width;
      panel.classList.remove('small');
      return {
        naturalWidth,
        naturalToken: tokenProbe('--sf-g0'),
        compactWidth,
        compactToken: tokenProbe('--sf-e1'),
        itemRadius: getComputedStyle(item).borderStartStartRadius,
        segmentRadius: getComputedStyle(segment).borderStartStartRadius,
        bottomRadius: getComputedStyle(bottom).borderStartStartRadius,
        panelHairline: getComputedStyle(panel).borderTopWidth,
        headHairline: getComputedStyle(head).borderBottomWidth,
        dividerHairline: getComputedStyle(divider).height,
        focusVisible: document.activeElement === item && item.matches(':focus-visible'),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    const verdict = {
      rootSize, theme, dir,
      naturalUsesToken: row.naturalWidth === row.naturalToken,
      compactUsesToken: row.compactWidth === row.compactToken,
      controlUsesUiRadius: row.itemRadius === '2px' && row.segmentRadius === '2px',
      surfaceUsesDefaultRadius: row.bottomRadius === '20px',
      hairlinesUseToken: row.panelHairline === '2px' && row.headHairline === '2px' && row.dividerHairline === '2px',
      keyboardFocusVisible: row.focusVisible,
      noHorizontalOverflow: !row.horizontalOverflow,
      row,
    };
    if (rootSize === 20 && theme === 'dark' && dir === 'rtl') {
      await page.screenshot({path: 'output/playwright/admin-menu-tokens-dark-rtl-enlarged.png', fullPage: true});
    }
    if (Object.entries(verdict).some(([key, value]) => !['rootSize', 'theme', 'dir', 'row'].includes(key) && !value)) failures.push(verdict);
    results.push(verdict);
  }

  for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await page.setViewportSize({width: 390, height: 900});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    await page.addStyleTag({url: `${base}/component/admin-menu/css/admin-menu.css`});
    await page.evaluate(async ({base, theme, dir}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.dir = dir;
      document.querySelector('main').innerHTML = await (await fetch(`${base}/examples/admin-menu-overview/index.html`)).text();
    }, {base, theme, dir});
    const row = await page.evaluate(() => {
      const panel = document.querySelector('.sf-admin-menu-panel');
      const host = document.querySelector('.sf-admin-menu');
      return {
        panelWidth: panel.getBoundingClientRect().width,
        hostWidth: host.getBoundingClientRect().width,
        allItemsVisible: [...document.querySelectorAll('.sf-admin-menu-main > ul > .sf-admin-menu-item-wrap')].every(item => item.getClientRects().length > 0),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    const verdict = {theme, dir, mobileFillsHost: row.panelWidth === row.hostWidth, allItemsVisible: row.allItemsVisible, noHorizontalOverflow: !row.horizontalOverflow, row};
    if (theme === 'light' && dir === 'ltr') await page.screenshot({path: 'output/playwright/admin-menu-tokens-mobile-light.png', fullPage: true});
    if (Object.entries(verdict).some(([key, value]) => !['theme', 'dir', 'row'].includes(key) && !value)) failures.push(verdict);
    results.push(verdict);
  }

  return {status: failures.length || errors.length ? 'failed' : 'passed', cases: results.length, failures, errors, results};
}
