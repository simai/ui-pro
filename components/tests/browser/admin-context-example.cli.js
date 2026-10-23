async page => {
  const base='http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const errors=[],failures=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
  for(const width of [390,1280])for(const theme of ['light','dark'])for(const dir of ['ltr','rtl']){
    await page.emulateMedia({forcedColors:'none',reducedMotion:'reduce'});await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    for(const name of ['buttons','context-menu','admin-menu','icons','icon-buttons','inputs','badges'])await page.addStyleTag({url:`${base}/component/${name}/css/${name}.css`});
    for(const name of ['buttons','context-menu','icons','icon-buttons','inputs','badges','admin-menu'])await page.addScriptTag({url:`${base}/smart/${name}/js/${name}.js`});
    await page.evaluate(async({base,theme,dir})=>{document.documentElement.className=`theme-${theme}`;document.documentElement.dir=dir;document.querySelector('main').innerHTML=await(await fetch(`${base}/examples/admin-context-menu/index.html`)).text();},{base,theme,dir});
    await page.getByRole('button',{name:'Настройки меню',exact:true}).click();
    const opener=page.getByRole('button',{name:'Личные настройки',exact:true});await opener.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('sf-context-menu')?.contains(document.activeElement));
    const row=await page.evaluate(async()=>{
      await document.fonts.load('24px "Material Symbols Outlined"');document.querySelectorAll('.sf-icon').forEach(e=>e.classList.add('sf-icon-loaded'));
      const menu=document.querySelector('sf-context-menu'),surface=menu.querySelector('.sf-context-menu'),r=surface.getBoundingClientRect();
      const positions=[];for(let i=0;i<3;i++){document.querySelector('sf-admin-menu').clampContextMenuToViewport();await new Promise(requestAnimationFrame);const p=surface.getBoundingClientRect();positions.push({left:p.left,top:p.top,right:p.right,bottom:p.bottom});}
      const nav=document.querySelector('.sf-admin-menu-main').getBoundingClientRect();
      const mainItemsVisible=['Руководство','Компоненты'].every(text=>[...document.querySelectorAll('.sf-admin-menu-main a')].some(a=>a.textContent.includes(text)&&a.getBoundingClientRect().top>=nav.top-1&&a.getBoundingClientRect().bottom<=nav.bottom+1));
      return {mainItemsVisible,menuNamed:surface.getAttribute('aria-label')==='Личные настройки',nativeFocused:document.activeElement.matches('button[role="menuitem"]'),insideViewport:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,
        stableClamp:positions.every(p=>Math.abs(p.left-positions[0].left)<1&&Math.abs(p.top-positions[0].top)<1&&p.left>=-1&&p.right<=innerWidth+1&&p.top>=-1&&p.bottom<=innerHeight+1)};
    });
    await page.waitForTimeout(400);
    if(dir==='ltr')await page.screenshot({path:`output/playwright/admin-context-${width}-${theme}.png`,fullPage:true});
    await page.keyboard.press('Escape');row.escapeReturn=await opener.evaluate(e=>e===document.activeElement);
    await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Отменить',exact:true}).waitFor();await page.keyboard.press('End');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.matches('[data-action="settings"]'));
    row.cancelReturn=await page.getByRole('button',{name:'Настройки меню',exact:true}).evaluate(e=>e===document.activeElement);
    row.closed=await page.locator('sf-context-menu').count()===0;
    if(Object.values(row).some(v=>!v))failures.push({width,theme,dir,...row});results.push({width,theme,dir,...row});
  }
  return{status:failures.length||errors.length?'failed':'passed',cases:results.length,failures,errors,results};
}
