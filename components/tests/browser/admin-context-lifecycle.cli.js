async page => {
  const base='http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const errors=[], results=[], failures=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error') errors.push(e.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
  for(const width of [390,1280]) for(const theme of ['light','dark']) {
    await page.emulateMedia({forcedColors:'none',reducedMotion:'reduce'});
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    for(const name of ['buttons','context-menu','admin-menu','icons','icon-buttons','inputs','badges']) await page.addStyleTag({url:`${base}/component/${name}/css/${name}.css`});
    for(const name of ['buttons','context-menu','icons','icon-buttons','inputs','badges','admin-menu']) await page.addScriptTag({url:`${base}/smart/${name}/js/${name}.js`});
    await page.evaluate(theme=>{
      document.documentElement.className=`theme-${theme}`;
      document.querySelector('main').innerHTML='<sf-admin-menu settings collapsible persistence-mode="external" aria-label="Разделы"><sf-admin-menu-item item-id="docs" href="#docs">Документы</sf-admin-menu-item></sf-admin-menu><button id="outside">Внешняя кнопка</button>';
      document.querySelector('sf-admin-menu').set({menuSettings:true});
      window.adminScrollEvents=[];
      document.addEventListener('scroll',event=>{const t=event.target===document?document.scrollingElement:event.target;window.adminScrollEvents.push({tag:t?.tagName,class:t?.className,top:t?.scrollTop,left:t?.scrollLeft,menuOpen:!!document.querySelector('sf-context-menu')});},true);
    },theme);
    const opener=page.locator('[data-admin-menu-settings]');
    await opener.waitFor();await opener.focus();await page.keyboard.press('Enter');
    await page.waitForSelector('sf-context-menu button');
    await page.waitForTimeout(150);
    const focusedOnOpen=await page.evaluate(()=>document.querySelector('sf-context-menu')?.contains(document.activeElement));
    const openerSemantics=await opener.evaluate(e=>e.getAttribute('aria-haspopup')==='menu'&&e.getAttribute('aria-expanded')==='true'&&!!e.getAttribute('aria-label'));
    // Baseline lacks entry focus; move explicitly so closing is tested independently.
    await page.locator('sf-context-menu button').first().focus();
    await page.keyboard.press('Escape');
    const escapeClosed=await page.locator('sf-context-menu').count()===0;
    const escapeRestored=await opener.evaluate(e=>e===document.activeElement);
    await page.evaluate(()=>document.querySelector('sf-admin-menu').closeContextMenu());
    await opener.click();await page.waitForSelector('sf-context-menu button');
    await page.locator('sf-context-menu button').first().focus();await page.keyboard.press('Tab');
    const tabClosed=await page.locator('sf-context-menu').count()===0;
    const tabContinues=await page.locator('#outside').evaluate(e=>e===document.activeElement);
    await page.evaluate(()=>document.querySelector('sf-admin-menu').closeContextMenu());
    await opener.click();await page.waitForSelector('sf-context-menu button');
    await page.locator('#outside').click();
    const outsideClosed=await page.locator('sf-context-menu').count()===0;
    const outsideKeptFocus=await page.locator('#outside').evaluate(e=>e===document.activeElement);
    const itemSettings=page.locator('sf-icon-button[id="docs_settings"] button');
    await itemSettings.click();await page.waitForSelector('sf-context-menu button');
    await page.waitForTimeout(100);
    const smartOpener=await itemSettings.evaluate(e=>document.querySelector('sf-admin-menu')._contextReturnFocus===e&&e.getAttribute('aria-expanded')==='true');
    const hide=page.getByRole('menuitem',{name:'Скрыть',exact:true});
    if(await hide.count()){await hide.focus();await page.keyboard.press('Enter');await page.waitForTimeout(150);}
    const hideAction=await page.evaluate(()=>!document.querySelector('sf-context-menu')&&document.querySelector('sf-admin-menu')._itemsData[0].hidden===true&&document.querySelector('sf-admin-menu').contains(document.activeElement));
    const scrollEvents=await page.evaluate(()=>window.adminScrollEvents);
    await opener.click();await page.waitForSelector('sf-context-menu button');
    await page.locator('sf-context-menu button').first().focus();await page.keyboard.press('Shift+Tab');
    const reverseTab=await opener.evaluate(e=>e.previousElementSibling===document.activeElement)&&await page.locator('sf-context-menu').count()===0;
    await opener.click();await page.getByRole('menuitem',{name:'Отменить',exact:true}).waitFor();
    await page.getByRole('menuitem',{name:'Отменить',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const cancelReturnsToMenu=await page.evaluate(()=>!document.querySelector('sf-context-menu')&&!document.querySelector('sf-admin-menu').state.menuSettings&&document.querySelector('sf-admin-menu').contains(document.activeElement));
    await page.evaluate(()=>document.querySelector('sf-admin-menu').set({menuSettings:true}));await opener.waitFor();
    const edge=await page.evaluate(async()=>{
      const a=document.querySelector('sf-admin-menu'), opener=a.querySelector('[data-admin-menu-settings]'), outside=document.querySelector('#outside');
      const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const click=e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));
      click(opener.querySelector('sf-icon'));await tick();
      const iconTarget=a.contextTarget===opener&&a._contextReturnFocus===opener;
      opener.setAttribute('aria-haspopup','dialog');a.closeContextMenu();
      const authorAria=opener.getAttribute('aria-haspopup')==='dialog';opener.setAttribute('aria-haspopup','menu');
      click(opener);a.closeContextMenu();outside.focus();await tick();
      const staleCancelled=!document.querySelector('sf-context-menu')&&document.activeElement===outside;
      click(opener);await tick();click(opener);await tick();
      const sameOpenerCloses=!document.querySelector('sf-context-menu');
      const b=document.createElement('sf-admin-menu');b.setAttribute('settings','');b.setAttribute('collapsible','');b.setAttribute('persistence-mode','external');
      document.querySelector('main').append(b);b.set({menuSettings:true});await tick();
      click(opener);await tick();
      const second=b.querySelector('[data-admin-menu-settings]');click(second);await tick();
      const secondMenu=b.refs.contextMenu.value;
      a.closeContextMenu();
      const sharedPortal=!!secondMenu&&secondMenu.isConnected&&b.refs.contextMenu.value===secondMenu&&a.refs.contextMenu.value===null;
      a.remove();await tick();
      const disconnectSafe=secondMenu.isConnected&&b.refs.contextMenu.value===secondMenu;
      b.closeContextMenu();b.remove();
      return {iconTarget,authorAria,staleCancelled,sameOpenerCloses,sharedPortal,disconnectSafe};
    });
    const row={width,theme,focusedOnOpen,openerSemantics,escapeClosed,escapeRestored,tabClosed,tabContinues,outsideClosed,outsideKeptFocus,smartOpener,hideAction,scrollEvents,reverseTab,cancelReturnsToMenu,...edge};
    if(Object.entries(row).some(([k,v])=>!['width','theme'].includes(k)&&!v))failures.push(row);results.push(row);
  }
  return {status:failures.length||errors.length?'failed':'passed',cases:results.length,failures,errors,results};
}
