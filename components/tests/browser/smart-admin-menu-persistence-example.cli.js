async page => {
  const base = 'http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const dependencies = ['buttons', 'context-menu', 'admin-menu', 'icons', 'icon-buttons', 'inputs', 'badges'];
  const errors = [], failures = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));

  for (const setup of [
    {width: 390, theme: 'light', dir: 'ltr'},
    {width: 1280, theme: 'dark', dir: 'rtl'},
  ]) {
    await page.setViewportSize({width: setup.width, height: 900});
    await page.goto(`${base}/examples/smart-admin-menu-external-settings/index.html`);
    await page.evaluate(({theme, dir, width}) => {
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.lang = 'ru';
      document.documentElement.dir = dir;
      document.documentElement.style.fontSize = width === 390 ? '20px' : '16px';
    }, setup);
    for (const name of dependencies) await page.addStyleTag({url: `${base}/component/${name}/css/${name}.css`});
    for (const name of dependencies) await page.addScriptTag({url: `${base}/smart/${name}/js/${name}.js`});
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.querySelector('[data-action="settings"]'));
    const host = page.locator('sf-admin-menu');
    await host.evaluate(element => element.toggleMenuSettings());
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.state?.settingsStatus === 'idle');
    await host.evaluate(element => {
      element.patchMenuItemSettings('reports', {hidden: true});
      element._itemsData = element.updateItemByPanelId('reports', item => ({...item, hidden: true}));
      element.saveMenuSettings();
    });
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.state?.settingsStatus === 'conflict');
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.querySelector('[role="alert"] sf-button'));
    const conflict = await host.evaluate(element => ({
      alert: Boolean(element.querySelector('[role="alert"]')),
      action: Boolean(element.querySelector('[role="alert"] sf-button')?.getAttribute('text')),
      draft: element.getMenuItemSettings('reports').hidden === true,
    }));
    await host.locator('[role="alert"] sf-button').evaluate(element => element.click());
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.state?.settingsStatus === 'idle');
    await host.evaluate(element => element.saveMenuSettings());
    await page.waitForFunction(() => document.querySelector('sf-admin-menu')?.state?.settingsStatus === 'success');
    const success = await host.evaluate(element => ({
      editorClosed: !element.state.menuSettings,
      revisionAdvanced: element.getProp('settingsRevision') === 6,
      accepted: element._settingsBaseline.reports?.hidden === true,
      noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    }));
    const row = {...setup, ...conflict, ...success};
    const ignored = new Set(['width', 'theme', 'dir']);
    if (Object.entries(row).some(([key, value]) => !ignored.has(key) && value !== true)) failures.push(row);
    results.push(row);
  }

  return {status: failures.length || errors.length ? 'failed' : 'passed', cases: results.length, failures, errors, results};
}
