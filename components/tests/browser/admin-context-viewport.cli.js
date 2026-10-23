async page => {
  const base='http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const errors=[],results=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
  for(const theme of ['light','dark'])for(const dir of ['ltr','rtl'])for(const motion of ['reduce','no-preference']){
    await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:motion,forcedColors:'none'});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    for(const name of ['buttons','context-menu','admin-menu','icons','icon-buttons','inputs','badges'])await page.addStyleTag({url:`${base}/component/${name}/css/${name}.css`});
    for(const name of ['buttons','context-menu','icons','icon-buttons','inputs','badges','admin-menu'])await page.addScriptTag({url:`${base}/smart/${name}/js/${name}.js`});
    await page.evaluate(async({base,theme,dir})=>{document.documentElement.className=`theme-${theme}`;document.documentElement.dir=dir;document.querySelector('main').innerHTML=await(await fetch(`${base}/examples/admin-context-menu/index.html`)).text();},{base,theme,dir});
    await page.getByRole('button',{name:'Настройки меню',exact:true}).click();await page.getByRole('button',{name:'Личные настройки',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('sf-context-menu')?.contains(document.activeElement));
    await page.setViewportSize({width:320,height:480});await page.waitForTimeout(150);
    const resized=await page.evaluate(()=>{const r=document.querySelector('sf-context-menu .sf-context-menu').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    await page.evaluate(()=>{
      const menu=document.querySelector('sf-context-menu'),root=menu.querySelector('.sf-context-menu');
      root.style.setProperty('--sf-context-menu-viewport-space','calc(1rem + 8px)');
      const content=menu.querySelector('.sf-context-menu-content');
      for(let i=0;i<20;i++){const button=document.createElement('button'),label=document.createElement('span');label.className='sf-button-text-container';label.textContent=`Дополнительное действие ${i}`;button.append(label);button.className='sf-button sf-button--link sf-button--on-surface sf-button--size-1 flex';content.append(button);}
    });await page.waitForTimeout(200);
    const grown=await page.evaluate(()=>{const menu=document.querySelector('sf-context-menu'),root=menu.querySelector('.sf-context-menu'),content=root.querySelector('.sf-context-menu-content'),r=root.getBoundingClientRect(),gap=parseFloat(getComputedStyle(document.documentElement).fontSize)+8;return {contentFits:r.left>=gap-1&&r.top>=gap-1&&r.right<=innerWidth-gap+1&&r.bottom<=innerHeight-gap+1,scrollable:content.scrollHeight>content.clientHeight,instantScroll:getComputedStyle(content).scrollBehavior==='auto',focusPreserved:menu.contains(document.activeElement),rulerRemoved:!root.querySelector(':scope > span[aria-hidden="true"]')};});
    await page.keyboard.press('End');await page.waitForTimeout(100);
    const endState=await page.evaluate(()=>{const root=document.querySelector('sf-context-menu .sf-context-menu'),content=root.querySelector('.sf-context-menu-content'),r=root.getBoundingClientRect(),f=document.activeElement.getBoundingClientRect();return {text:document.activeElement.textContent.trim(),top:f.top,bottom:f.bottom,rootTop:r.top,rootBottom:r.bottom,scrollTop:content.scrollTop,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,visible:document.activeElement.textContent.includes('19')&&f.top>=r.top&&f.bottom<=r.bottom+1};});
    const endVisible=endState.visible;
    if(dir==='ltr')await page.screenshot({path:`output/playwright/admin-viewport-320-${theme}.png`,fullPage:true});
    await page.evaluate(()=>{const content=document.querySelector('sf-context-menu .sf-context-menu-content');content.scrollTop=60;content.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(100);
    const internalScrollKeepsMenu=await page.locator('sf-context-menu').count()===1;
    await page.evaluate(()=>document.querySelector('.sf-admin-menu-panel').dispatchEvent(new Event('scroll')));
    const queuedScrollIgnored=await page.locator('sf-context-menu').count()===1;
    await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='1400px';document.body.append(spacer);window.scrollTo(0,100);});await page.waitForTimeout(150);
    const externalScrollCloses=await page.locator('sf-context-menu').count()===0;
    const cleaned=await page.evaluate(()=>{const a=document.querySelector('sf-admin-menu');return a._contextGeometryFrame===null&&a._contextSizeObserver===null&&a._contextSizeTarget===null&&a._contextScrollPositions.size===0;});
    const row={theme,dir,motion,resized,...grown,endVisible,endState,internalScrollKeepsMenu,queuedScrollIgnored,externalScrollCloses,cleaned};
    if(Object.entries(row).some(([k,v])=>!['theme','dir'].includes(k)&&!v))failures.push(row);results.push(row);
  }
  return{status:errors.length||failures.length?'failed':'passed',cases:results.length,failures,errors,results};
}
