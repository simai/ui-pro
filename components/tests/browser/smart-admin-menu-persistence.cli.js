async page => {
  const base = 'http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const dependencies = ['buttons', 'context-menu', 'admin-menu', 'icons', 'icon-buttons', 'inputs', 'badges'];
  const errors = [], failures = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));

  const markup = (id, attributes = '') => `<sf-admin-menu id="${id}" settings collapsible ${attributes} aria-label="Разделы"><sf-admin-menu-item item-id="overview" href="#overview">Обзор</sf-admin-menu-item><sf-admin-menu-item item-id="reports" href="#reports">Отчёты</sf-admin-menu-item></sf-admin-menu>`;
  const waitForMenu = async id => {
    await page.waitForFunction(id => document.getElementById(id)?.querySelector('[data-action="settings"]'), id);
    await page.waitForTimeout(120);
    return page.locator(`#${id}`);
  };
  const draftHidden = async (host, id) => host.evaluate((element, itemId) => {
    element.patchMenuItemSettings(itemId, {hidden: true});
    element._itemsData = element.updateItemByPanelId(itemId, item => ({...item, hidden: true}));
    element.requestComponentUpdate('persistence-test');
  }, id);

  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
    await page.setViewportSize({width, height: 900});
    await page.emulateMedia({forcedColors: 'none', reducedMotion: 'reduce'});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    for (const name of dependencies) await page.addStyleTag({url: `${base}/component/${name}/css/${name}.css`});
    for (const name of dependencies) await page.addScriptTag({url: `${base}/smart/${name}/js/${name}.js`});
    await page.evaluate(({theme, dir, width}) => {
      localStorage.clear();
      document.documentElement.className = `theme-${theme}`;
      document.documentElement.lang = 'ru';
      document.documentElement.dir = dir;
      document.documentElement.style.fontSize = width === 390 ? '20px' : '16px';
    }, {theme, dir, width});

    await page.locator('main').evaluate((main, html) => { main.innerHTML = html; }, markup('local-menu'));
    let local = await waitForMenu('local-menu');
    await local.evaluate(element => element.toggleMenuSettings());
    await draftHidden(local, 'reports');
    await local.evaluate(element => element.saveMenuSettings());
    const localSaved = await local.evaluate(element => ({
      editorClosed: !element.state.menuSettings,
      stored: JSON.parse(localStorage.getItem(element.getMenuSettingsStorageKey()) || '{}').reports?.hidden === true,
    }));

    await page.locator('main').evaluate((main, html) => { main.innerHTML = html; }, markup('local-menu'));
    local = await waitForMenu('local-menu');
    const localReloaded = await local.evaluate(element => element.findItemByPanelId('reports')?.hidden === true);
    await local.evaluate(element => element.toggleMenuSettings());
    await draftHidden(local, 'overview');
    await local.evaluate(element => element.cancelMenuSettings());
    const localCancelled = await local.evaluate(element => !element.findItemByPanelId('overview')?.hidden && element.findItemByPanelId('reports')?.hidden === true);

    await page.locator('main').evaluate((main, html) => { main.insertAdjacentHTML('beforeend', html); }, markup('other-menu'));
    const other = await waitForMenu('other-menu');
    const localScoped = await other.evaluate(element => !element.findItemByPanelId('reports')?.hidden);
    await local.evaluate(element => element.toggleMenuSettings());
    await local.evaluate(element => element.resetMenuSettings());
    const localReset = await local.evaluate(element => ({
      visible: !element.findItemByPanelId('overview')?.hidden && !element.findItemByPanelId('reports')?.hidden,
      cleared: localStorage.getItem(element.getMenuSettingsStorageKey()) === null,
    }));

    await page.locator('main').evaluate((main, html) => { main.innerHTML = html; }, markup('storage-failure'));
    const storageFailure = await waitForMenu('storage-failure');
    const storageState = await storageFailure.evaluate(async element => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
      try {
        element.toggleMenuSettings();
        element.patchMenuItemSettings('reports', {hidden: true});
        element.saveMenuSettings();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          error: element.state.settingsStatus === 'error',
          draftOpen: element.state.menuSettings,
          localized: element.querySelector('[role="alert"]')?.textContent.includes('Не удалось сохранить настройки.'),
          retry: element.querySelector('[role="alert"] sf-button')?.getAttribute('text') === 'Сохранить',
        };
      } finally {
        Storage.prototype.setItem = original;
      }
    });

    await page.locator('main').evaluate((main, html) => { main.innerHTML = html; }, markup('external-menu', 'persistence-mode="external" allow-system-settings settings-revision="7" system-settings-revision="12"'));
    const external = await waitForMenu('external-menu');
    await external.evaluate(element => {
      element.testEvents = [];
      ['sf-admin-menu-settings-refresh', 'sf-admin-menu-settings-save', 'sf-admin-menu-settings-mode-change'].forEach(name => element.addEventListener(name, event => element.testEvents.push({name, detail: structuredClone(event.detail)})));
      element.toggleMenuSettings();
    });
    await page.waitForTimeout(80);
    const initialRefresh = await external.evaluate(element => element.testEvents.at(-1));
    await external.evaluate(element => element.applyExternalSettingsState({
      profiles: {
        user: {revision: 7, profile: {schema_version: 1, items: {}, layout: {}}},
        system: {revision: 12, profile: {schema_version: 1, items: {}, layout: {}}},
      },
      trees: {user: [{id: 'overview', label: 'Обзор', href: '#overview'}, {id: 'reports', label: 'Отчёты', href: '#reports'}]},
    }, 'user'));
    await draftHidden(external, 'reports');
    await external.evaluate(element => element.saveMenuSettings());
    const firstSave = await external.evaluate(element => ({event: element.testEvents.at(-1), saving: element.state.settingsStatus === 'saving', gearDisabled: element.querySelector('[data-admin-menu-settings]')?.disabled === true}));
    await external.evaluate(element => element.applySettingsError({status: 500, error: 'private_backend_code'}));
    await page.waitForTimeout(80);
    const errorState = await external.evaluate(element => ({
      status: element.state.settingsStatus === 'error',
      draft: element.getMenuItemSettings('reports').hidden === true,
      localized: element.querySelector('[role="alert"]')?.textContent.includes('Не удалось сохранить настройки.'),
      noPrivateCode: !element.querySelector('[role="alert"]')?.textContent.includes('private_backend_code'),
      retryText: element.querySelector('[role="alert"] sf-button')?.getAttribute('text') === 'Сохранить',
    }));
    await external.locator('[role="alert"] sf-button').evaluate(element => element.click());
    await page.waitForTimeout(40);
    const retrySave = await external.evaluate(element => element.testEvents.filter(event => event.name === 'sf-admin-menu-settings-save').length === 2);
    await external.evaluate(element => element.applySettingsError({status: 409, error: 'revision_conflict'}));
    await page.waitForTimeout(80);
    const conflictState = await external.evaluate(element => ({
      status: element.state.settingsStatus === 'conflict',
      draft: element.getMenuItemSettings('reports').hidden === true,
      alert: element.querySelector('[role="alert"]')?.textContent.includes('Настройки изменились.'),
      refreshText: element.querySelector('[role="alert"] sf-button')?.getAttribute('text') === 'Обновить состояние',
    }));
    await external.locator('[role="alert"] sf-button').evaluate(element => element.click());
    await page.waitForTimeout(40);
    const conflictRefresh = await external.evaluate(element => element.testEvents.at(-1));
    await external.evaluate(element => element.applyExternalSettingsState({
      profiles: {
        user: {revision: 8, profile: {schema_version: 1, items: {reports: {hidden: true}}, layout: {}}},
        system: {revision: 12, profile: {schema_version: 1, items: {}, layout: {}}},
      },
    }, 'user'));
    await external.evaluate(element => element.selectSettingsMode('system'));
    const modeEvent = await external.evaluate(element => element.testEvents.at(-1));
    await external.evaluate(element => element.applyExternalSettingsState({profiles: {system: {revision: 12, profile: {schema_version: 1, items: {}, layout: {}}}}}, 'system'));
    await draftHidden(external, 'overview');
    await external.evaluate(element => element.saveMenuSettings());
    const systemSave = await external.evaluate(element => element.testEvents.at(-1));
    await external.evaluate(element => element.applySettingsResult({target: 'system', revision: 13, profile: {schema_version: 1, items: {overview: {hidden: true}}, layout: {}}}));
    const successState = await external.evaluate(element => ({
      closed: !element.state.menuSettings,
      success: element.state.settingsStatus === 'success',
      userRevision: element.getProp('settingsRevision') === 8,
      systemRevision: element.getProp('systemSettingsRevision') === 13,
      baseline: element._settingsBaseline.overview?.hidden === true,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    }));

    await page.locator('main').evaluate((main, html) => { main.insertAdjacentHTML('beforeend', html); }, markup('denied-system', 'persistence-mode="external"'));
    const denied = await waitForMenu('denied-system');
    const systemDenied = await denied.evaluate(element => { element.selectSettingsMode('system'); return element.getSettingsMode() === 'user'; });

    if (width === 390 && theme === 'light' && dir === 'ltr') {
      await external.evaluate(element => { element.toggleMenuSettings(); element.applySettingsError({status: 409, error: 'revision_conflict'}); });
      await page.waitForTimeout(80);
      await page.screenshot({path: 'output/playwright/smart-admin-menu-persistence-mobile.png', fullPage: true});
    }
    if (width === 1280 && theme === 'dark' && dir === 'rtl') {
      await external.evaluate(element => { if (!element.state.menuSettings) element.toggleMenuSettings(); element.applySettingsError({status: 500}); });
      await page.waitForTimeout(80);
      await page.screenshot({path: 'output/playwright/smart-admin-menu-persistence-dark-rtl.png', fullPage: true});
    }

    const row = {
      width, theme, dir,
      ...localSaved,
      localReloaded, localCancelled, localScoped,
      localResetVisible: localReset.visible,
      localResetCleared: localReset.cleared,
      storageError: storageState.error,
      storageDraftOpen: storageState.draftOpen,
      storageLocalized: storageState.localized,
      storageRetry: storageState.retry,
      initialRefresh: initialRefresh?.name === 'sf-admin-menu-settings-refresh' && initialRefresh.detail.target === 'user' && initialRefresh.detail.base_revision === 7 && initialRefresh.detail.profile?.schema_version === 1,
      saveContract: firstSave.event?.name === 'sf-admin-menu-settings-save' && firstSave.event.detail.target === 'user' && firstSave.event.detail.base_revision === 7 && firstSave.event.detail.profile?.items?.reports?.hidden === true,
      saving: firstSave.saving,
      gearDisabled: firstSave.gearDisabled,
      errorStatus: errorState.status,
      errorDraft: errorState.draft,
      errorLocalized: errorState.localized,
      errorSanitized: errorState.noPrivateCode,
      errorRetryText: errorState.retryText,
      retrySave,
      conflictStatus: conflictState.status,
      conflictDraft: conflictState.draft,
      conflictAlert: conflictState.alert,
      conflictRefreshText: conflictState.refreshText,
      refreshCarriesDraft: conflictRefresh?.name === 'sf-admin-menu-settings-refresh' && conflictRefresh.detail.target === 'user' && conflictRefresh.detail.base_revision === 7 && conflictRefresh.detail.profile?.items?.reports?.hidden === true,
      modeContract: modeEvent?.name === 'sf-admin-menu-settings-mode-change' && modeEvent.detail.target === 'system',
      systemSaveContract: systemSave?.name === 'sf-admin-menu-settings-save' && systemSave.detail.target === 'system' && systemSave.detail.base_revision === 12 && systemSave.detail.profile?.items?.overview?.hidden === true,
      ...successState,
      systemDenied,
    };
    const ignored = new Set(['width', 'theme', 'dir', 'userRevision', 'systemRevision']);
    if (Object.entries(row).some(([key, value]) => !ignored.has(key) && value !== true)) failures.push(row);
    results.push(row);
  }

  return {status: failures.length || errors.length ? 'failed' : 'passed', cases: results.length, failures, errors, results};
}
