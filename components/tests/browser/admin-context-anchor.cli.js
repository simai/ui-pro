async page => {
  const base='http://127.0.0.1:8766/ui-source/source/output/action-focus-browser';
  const errors=[],results=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
  for(const theme of ['light','dark'])for(const dir of ['ltr','rtl'])for(const side of ['left','right']){
    await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce',forcedColors:'none'});
    await page.goto('http://127.0.0.1:8766/ui-source/tests/fixtures/modal-loader-lab.html');
    for(const name of ['buttons','context-menu','admin-menu','icons','icon-buttons','inputs','badges'])await page.addStyleTag({url:`${base}/component/${name}/css/${name}.css`});
    for(const name of ['buttons','context-menu','icons','icon-buttons','inputs','badges','admin-menu'])await page.addScriptTag({url:`${base}/smart/${name}/js/${name}.js`});
    await page.evaluate(async({base,theme,dir})=>{document.documentElement.className=`theme-${theme}`;document.documentElement.dir=dir;document.querySelector('main').innerHTML=await(await fetch(`${base}/examples/admin-context-menu/index.html`)).text();},{base,theme,dir});
    await page.getByRole('button',{name:'Настройки меню',exact:true}).click();
    const opener=page.locator('sf-icon-button[id$="_settings"] button').first();await opener.waitFor({state:'attached'});
    await opener.evaluate((e,side)=>{e.id='anchor-test-opener';e.style.cssText=`position:fixed;inset:auto;left:${side==='left'?25:75}vw;top:45vh;opacity:1;visibility:visible;`;},side);
    await opener.click();await page.waitForFunction(()=>document.querySelector('sf-context-menu')?.contains(document.activeElement));await page.waitForTimeout(120);
    const measure=()=>page.evaluate(()=>{const a=document.querySelector('#anchor-test-opener'),host=a.closest('sf-icon-button'),root=document.querySelector('sf-context-menu .sf-context-menu');const r=root.getBoundingClientRect(),b=a.getBoundingClientRect();const goesRight=b.left<innerWidth/2;const gap=goesRight?r.left-b.right:b.left-r.right;return{hostWidth:host.getBoundingClientRect().width,button:b.toJSON(),popup:r.toJSON(),gap,attached:gap>=0&&gap<=16,centered:Math.abs((r.top+r.bottom-b.top-b.bottom)/2)<2,inside:r.left>=0&&r.right<=innerWidth,focused:root.contains(document.activeElement)};});
    const opened=await measure();
    await page.setViewportSize({width:1000,height:700});await page.waitForTimeout(500);const resized=await measure();
    const settled=await page.evaluate(()=>document.querySelector('sf-admin-menu')._contextGeometryFrame===null);
    if(theme==='dark'&&side==='right')await page.screenshot({path:`output/playwright/admin-anchor-${dir}.png`,fullPage:true});
    await page.keyboard.press('Escape');const returned=await opener.evaluate(e=>e===document.activeElement);
    const row={theme,dir,side,opened,resized,settled,returned};results.push(row);
    if(!returned||!settled||[opened,resized].some(r=>!r.attached||!r.centered||!r.inside||!r.focused))failures.push(row);
  }
  return{status:failures.length||errors.length?'failed':'passed',cases:results.length,failures,errors,results};
}
