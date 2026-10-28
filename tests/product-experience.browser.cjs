const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'switches-experience-'));
const base = 'http://127.0.0.1:8004';
const server = spawn('python',['-u','local-server.py','8004'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,env:{...process.env,SWITCHES_OFFLINE_CATALOG:'1',SWITCHES_DB_PATH:path.join(output,'test.db')}});
server.stdout.resume(); server.stderr.resume();
const image = '/assets/ui/pc-parts-mode.webp';
const pc = {id:710001,name:'ATK Neptune N9 eSports Wireless',shortDescription:'خيارات المنتج والمخزون من بيانات الاختبار المعزولة.',category:'سماعات',brand:'ATK',price:365,oldPrice:380,images:[image,'/assets/sections/minecraft-java-bedrock.webp'],availability:'available',stockQty:3,trackStock:true,specs:{variants:[
  {id:'white',options:{color:'White',connection:'Wireless'},stockQty:2,price:365,oldPrice:380},
  {id:'black',options:{color:'Black',connection:'Wireless'},stockQty:2,price:350,oldPrice:350},
  {id:'red',options:{color:'Red',connection:'Wireless'},stockQty:0,price:360},
],reviews:[{author:'عميل اختبار',rating:4,text:'مراجعة موجودة في البيانات.'}]}};
const ordinary = {id:710002,name:'Plain product without options',price:20,images:[image],specs:{},availability:'unavailable'};
const games = [1,2,3,4].map(index=>({id:720000+index,name:`Minecraft Edition ${index}`,price:25,oldPrice:30,images:['/assets/sections/minecraft-java-bedrock.webp'],availability:'available',specs:{_switchesDigital:{categoryType:'MINECRAFT',platform:'Microsoft Store',productType:'KEY',region:'GLOBAL',edition:`Edition ${index}`}}}));
async function setup(browser,options={}) {
  const context = await browser.newContext({viewport:{width:1440,height:1000},...options});
  await context.addInitScript(()=>{window.capturedOrders=[];window.open=url=>{capturedOrders.push(String(url));return null;};});
  await context.route('**/*.supabase.co/**',route=>route.abort());
  await context.route('**/api/public/bootstrap',async route=>{
    const response=await route.fetch(),body=await response.json();
    body.products.push(pc,ordinary,...games); body.settings.popup_enabled=false;
    await route.fulfill({json:body});
  });
  const page=await context.newPage(),errors=[]; page.on('pageerror',error=>errors.push(error.message));
  return {context,page,errors};
}
async function open(page,url,selector) {
  await page.goto(base+url,{waitUntil:'domcontentloaded'});
  await page.locator(selector).first().waitFor({state:'visible',timeout:30000});
  await page.evaluate(()=>{window.closePromoPopup?.();});
}
async function checkGrid(page,selector,columns) {
  const result=await page.locator(selector).evaluate(grid=>({columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(result.columns,columns); assert.equal(result.overflow,false);
}
async function facet(page,key,value) {
  const input=page.locator(`.digital-catalog-sidebar input[data-facet-key="${key}"][value=${JSON.stringify(value)}]`);
  if(!await input.count()) await page.locator(`[data-facet-more="${key}"]`).click();
  await input.check();
}
async function main() {
  let browser;
  try {
    let online=false;
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/public/subscriptions')).ok){online=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(online,'isolated server ready');
    console.log(`Preview artifacts: ${output}`);
    const catalog=await(await fetch(base+'/api/public/subscriptions')).json();
    browser=await chromium.launch({channel:'chrome',headless:true});
    const run=await setup(browser),{page}=run;
    await open(page,'/subscriptions','.digital-product-card[data-digital-id]');
    assert.equal(await page.locator('.digital-product-card[data-digital-id]').count(),20);
    for(const [width,columns] of [[1920,3],[1440,3],[1024,3],[768,2],[540,2],[390,1],[320,1]]) {await page.setViewportSize({width,height:1000});await checkGrid(page,'.digital-catalog-results .digital-grid',columns);}
    await page.setViewportSize({width:1440,height:1000});
    const meta=product=>product.specs._switchesDigital;
    const platform=meta(catalog.products.find(row=>/Gemini/.test(row.name))).platform;
    await facet(page,'platform',platform); await facet(page,'type','Activation Link'); await facet(page,'region','GLOBAL');
    const expected=catalog.products.filter(row=>meta(row).platform===platform&&meta(row).activationMethod==='Activation Link'&&meta(row).region==='GLOBAL');
    assert.ok(expected.length); assert.equal(await page.locator('.digital-product-card').count(),expected.length);
    await page.locator('[data-filter-reset]').click();
    await page.locator('[data-facet-search="platform"]').fill('Canva');
    assert.ok((await page.locator('input[data-facet-key="platform"]').inputValue()).includes('Canva'));
    await page.locator('[data-facet-search="platform"]').fill('');
    await page.locator('#digitalSearch').fill('not-a-product'); assert.equal(await page.locator('.digital-product-card').count(),0);
    await page.locator('#digitalSearch').fill(''); assert.equal(await page.locator('.digital-product-card').count(),20);
    assert.equal(await page.locator('.digital-price,.digital-discount').count(),0);
    await page.locator('#digitalCatalog').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,'digital-desktop.png')});
    console.log('PASS: three-column digital catalogs, combined facets, facet search, result counts, responsive grids and quote policy.');

    await open(page,'/?view=products','#allProductsGrid .marketplace-product');
    const card=page.locator('#allProductsGrid .marketplace-product').first();
    const styles=()=>card.evaluate(card=>[card,...card.querySelectorAll('*')].map(node=>{const s=getComputedStyle(node);return Array.from(s).sort().map(key=>[key,s.getPropertyValue(key)]);}));
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>document.querySelector('link[href="/product-experience.css"]').sheet.disabled=true); const before=await styles();
    await page.evaluate(()=>document.querySelector('link[href="/product-experience.css"]').sheet.disabled=false); assert.deepEqual(await styles(),before,'PC listing computed styles unchanged');
    await page.locator('[data-product-link="710001"]').first().click();
    const detail=page.locator('[data-product-detail="710001"]'); await detail.waitFor();
    assert.match(await detail.locator('h1').textContent(),/ATK Neptune/);
    assert.equal(await detail.locator('[data-detail-option="color"][aria-pressed="true"]').getAttribute('data-value'),'White');
    await detail.locator('[data-detail-quantity="1"]').click();
    assert.match(await detail.locator('[data-detail-purchase]').textContent(),/\(2\)/);
    assert.equal(await detail.locator('[data-detail-quantity="1"]').isDisabled(),true);
    await detail.locator('[data-detail-purchase]').click();
    assert.equal(await page.evaluate(()=>cart[0].quantity),2);
    assert.equal(await page.evaluate(()=>cart[0].selectedVariantId),'white');
    await detail.locator('[data-detail-purchase]').click(); assert.equal(await page.evaluate(()=>cart[0].quantity),2,'repeated add cannot overrun stock');
    await detail.locator('[data-detail-option="color"][data-value="Red"]').click(); assert.equal(await detail.locator('[data-detail-purchase]').isDisabled(),true);
    await detail.locator('[data-detail-option="color"][data-value="Black"]').click();
    assert.equal(await detail.locator('.store-product-price del').count(),0,'no false discount');
    await detail.locator('[data-detail-quantity="-1"]').click(); await detail.locator('[data-detail-purchase]').click();
    assert.equal(await page.evaluate(()=>cart.length),2,'separate cart lines per variant');
    await page.evaluate(()=>updateQuantity(cart[0].cartKey,1)); assert.equal(await page.evaluate(()=>cart[0].quantity),2);
    assert.equal(await detail.locator('.store-product-reviews article').count(),1,'real reviews only');
    await page.screenshot({path:path.join(output,'detail-desktop.png')});
    await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,'detail-mobile.png'),fullPage:true});
    await open(page,'/?product=710002','[data-product-detail="710002"]');
    assert.equal(await page.locator('.store-product-options').count(),0); assert.equal(await page.locator('[data-detail-purchase]').isDisabled(),true);
    assert.equal(await page.locator('.store-product-reviews').count(),0);
    console.log('PASS: shared detail, dynamic options/prices/stock, quantity bounds, variant cart keys, unavailable products and real reviews.');

    await page.setViewportSize({width:1440,height:1000});
    await open(page,'/gift-cards','.gift-platform-card'); await checkGrid(page,'.gift-grid',3);
    await page.screenshot({path:path.join(output,'gift-desktop.png')});
    await facet(page,'platform','Steam'); assert.equal(await page.locator('.gift-platform-card').count(),1);
    await open(page,'/gift-cards/playstation?region=us&value=50','.gift-detail-view');
    assert.match(await page.locator('[data-detail-option="denomination"][aria-pressed="true"] bdi').textContent(),/50/);
    await page.locator('[data-detail-quantity="1"]').click(); await page.locator('[data-detail-quantity="1"]').click(); await page.locator('.gift-whatsapp-buy').click();
    let message=await page.evaluate(()=>new URL(capturedOrders.at(-1)).searchParams.get('text'));
    assert.match(message,/\$50/); assert.match(message,/الكمية:\* 3/); assert.equal(/د\.ل/.test(message),false);
    await open(page,'/subscriptions/google-gemini-pro-3-months','[data-product-detail]');
    await page.locator('[data-detail-quantity="1"]').click(); await page.locator('[data-detail-purchase]').click();
    message=await page.evaluate(()=>new URL(capturedOrders.at(-1)).searchParams.get('text')); assert.match(message,/الكمية:\* 2/);
    await page.screenshot({path:path.join(output,'subscription-detail.png')});
    await run.context.route('**/api/public/subscriptions',async route=>{
      const response=await route.fetch(),body=await response.json(),product=body.products.find(row=>row.slug==='google-gemini-pro-3-months');
      product.name='Google AI flexible subscription';
      product.specs._productOptions={variants:[{id:'global',options:{region:'GLOBAL',duration:'3 أشهر'},stockQty:3},{id:'europe',options:{region:'EUROPE',duration:'6 أشهر'},stockQty:2}]};
      await route.fulfill({json:body});
    });
    await open(page,'/subscriptions/google-gemini-pro-3-months','[data-detail-option="region"]');
    await page.locator('[data-detail-option="region"][data-value="EUROPE"]').click();
    assert.equal(await page.locator('[data-detail-purchase]').isDisabled(),true,'invalid option combinations cannot be bought');
    await page.locator('[data-detail-option="duration"][data-value="6 أشهر"]').click();
    await page.locator('[data-detail-purchase]').click();
    message=await page.evaluate(()=>new URL(capturedOrders.at(-1)).searchParams.get('text'));
    assert.match(message,/EUROPE/); assert.match(message,/6 أشهر/); assert.equal(message.includes('GLOBAL'),false,'order uses the selected region');
    assert.equal((await page.locator('.digital-facts').textContent()).includes('GLOBAL'),false,'base facts do not contradict selected options');
    await open(page,'/minecraft','.digital-product-card'); await checkGrid(page,'.digital-catalog-results .digital-grid',3);
    await facet(page,'platform','Microsoft Store'); assert.equal(await page.locator('.digital-product-card').count(),4);
    await page.locator('.digital-card-art').first().click(); await page.locator('[data-detail-purchase]').click();
    assert.ok(await page.evaluate(()=>cart.some(item=>item.id>=720001)),'Minecraft cart route preserved');
    assert.deepEqual(run.errors,[]); await run.context.close();
    console.log('PASS: Gift Cards selection/WhatsApp quantities, subscription orders, Minecraft filters and cart routes.');

    const touch=await setup(browser,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    for(const route of ['/subscriptions','/gift-cards','/minecraft']) {
      await open(touch.page,route,'.digital-filter-toggle'); await touch.page.locator('.digital-filter-toggle').click();
      assert.equal(await touch.page.locator('.digital-catalog-sidebar').getAttribute('aria-modal'),'true');
      assert.equal(await touch.page.evaluate(()=>document.body.style.overflow),'hidden');
      await touch.page.keyboard.press('Escape'); assert.equal(await touch.page.locator('.digital-filter-toggle').getAttribute('aria-expanded'),'false');
      assert.equal(await touch.page.evaluate(()=>document.body.style.overflow),'');
      assert.equal(await touch.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await touch.page.locator('.digital-filter-toggle').click(); await touch.page.locator('.digital-filter-apply').click();
    }
    await touch.page.screenshot({path:path.join(output,'digital-mobile.png'),fullPage:true});
    assert.deepEqual(touch.errors,[]); await touch.context.close();
    const reduced=await setup(browser,{reducedMotion:'reduce'});
    await open(reduced.page,'/subscriptions','.digital-product-card'); const first=reduced.page.locator('.digital-product-card').first(); await first.hover();
    assert.equal(await first.evaluate(el=>getComputedStyle(el).scale),'1');
    await reduced.page.evaluate(()=>document.body.dataset.theme='dark'); await reduced.page.screenshot({path:path.join(output,'digital-dark.png')});
    assert.deepEqual(reduced.errors,[]); await reduced.context.close();
    console.log('PASS: mobile drawers, focus/scroll cleanup, reduced motion and dark theme.');
    console.log(`Screenshots: ${output}`);
  } finally { if(browser)await browser.close(); server.kill(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
