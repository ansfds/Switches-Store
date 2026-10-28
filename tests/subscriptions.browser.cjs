const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'..');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'switches-subscriptions-'));
const baseURL = process.env.STORE_URL || 'http://127.0.0.1:8002';
if (process.env.STORE_URL && process.env.ISOLATED_TEST_SERVER !== '1') throw new Error('CRUD browser tests require an isolated test server.');
const server = process.env.STORE_URL ? null : spawn('python',['-u','local-server.py','8002'],{cwd:root,windowsHide:true,env:{...process.env,SWITCHES_OFFLINE_CATALOG:'1',SWITCHES_DB_PATH:path.join(output,'test.db')}});
if(server) { server.stdout.resume(); server.stderr.resume(); }
const notice='السعر يتغير كل لحظة ويتم احتساب السعر النهائي وقت الشراء فقط';
const priceKeys=/price|cost|margin|secret|password|token|cookie|reference/i;
function publicKeys(value) {
  if(Array.isArray(value))value.forEach(publicKeys);
  else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(key!=='priceOnRequest')assert.equal(priceKeys.test(key),false,`Private key: ${key}`);publicKeys(child);}
}
async function ready(page,route='/subscriptions') {
  await page.goto(baseURL+route,{waitUntil:'domcontentloaded'});
  if(route.startsWith('/subscriptions'))await page.waitForFunction(()=>!document.querySelector('#digitalStoreContent [aria-busy="true"]')&&document.querySelector('#digitalStoreContent .digital-product-card[data-digital-id],#digitalStoreContent [data-product-detail],#digitalStoreContent .digital-empty'));
}
async function noPrices(page) {
  const text=await page.locator('#digitalStoreContent').textContent();
  assert.equal(/\$|USD|د\.ل|\b(?:2\.46|13\.25|31\.01|17\.93|13\.78)\b/.test(text),false,'No selling price in subscriptions');
  assert.equal(await page.locator('#digitalStoreContent .digital-price,#digitalStoreContent .digital-discount,#digitalStoreContent del').count(),0);
  assert.equal(await page.locator('#digitalStoreContent .dynamic-price-notice').first().textContent(),notice);
}
async function layout(page,width,columns,name='subscriptions') {
  await page.setViewportSize({width,height:1000});
  await page.waitForTimeout(430);
  const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('#digitalProducts .digital-grid')||document.querySelector('.digital-grid')).gridTemplateColumns.split(' ').length,contain:[...document.querySelectorAll('.digital-card-art img,.digital-detail-image')].every(image=>getComputedStyle(image).objectFit==='contain')}));
  assert.equal(result.overflow,false,`${width}px overflow`);assert.equal(result.contain,true);
  if(columns)assert.equal(result.columns,columns);
  await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:width===1440});
}
async function main() {
  let browser;
  try {
    let online=false;
    for(let index=0;index<80;index++){try{const result=await fetch(baseURL+'/api/public/subscriptions');if(result.ok){online=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(online,'isolated API starts');
    const catalog=await(await fetch(baseURL+'/api/public/subscriptions')).json();
    assert.equal(catalog.products.length,20);publicKeys(catalog.products);assert.equal(catalog.settings.dynamic_price_notice,notice);
    const gifts=await(await fetch(baseURL+'/api/public/gift-cards')).json();publicKeys(gifts);
    assert.equal((await fetch(baseURL+'/api/local-admin/subscriptions')).status,403);
    assert.equal((await fetch(baseURL+'/api/local-admin/session',{headers:{'X-Switches-Local':'1',Origin:'https://example.com'}})).status,403);
    for(const privatePath of ['/.env','/data/switches.db','/data/subscriptions-seed.json'])assert.equal((await fetch(baseURL+privatePath)).status,404);
    publicKeys(await(await fetch(baseURL+'/DATA/GIFT-CARDS.JSON')).json());
    publicKeys(await(await fetch(baseURL+'/data//gift-cards.json')).json());
    assert.equal((await fetch(baseURL+'/data/gift-cards.json::$DATA')).status,404);
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    // Built catalog tests exercise same-origin data and local Admin; optional
    // external auth/email SDKs and CDN fonts are verified by the live smoke test.
    if(process.env.LOCAL_CATALOG_TEST==='1')for(const host of ['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com']){
      await context.route(`https://${host}/**`,route=>route.fulfill({contentType:route.request().resourceType()==='stylesheet'?'text/css':'application/javascript',body:''}));
    }
    const errors=[];let externalWrites=0;
    await context.addInitScript(()=>{window.capturedOrders=[];window.open=(url)=>{capturedOrders.push(String(url));return null;};});
    await context.route('**/*.supabase.co/**',route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method()))externalWrites++;return route.abort();});
    // PC/Minecraft fixtures live only in intercepted public responses.
    await context.route('**/api/public/bootstrap',async route=>{
      try {
      const response=await route.fetch();const body=await response.json();
      body.products.push({id:700001,name:'Existing PC Part',category:'PC',brand:'Test Brand',price:55,oldPrice:75,images:['/assets/ui/pc-parts-mode.webp'],availability:'available',slug:'test-pc',specs:{}},{id:700002,name:'Minecraft Test Edition',price:25,images:['/assets/sections/minecraft-java-bedrock.webp'],availability:'available',slug:'test-minecraft',specs:{_switchesDigital:{categoryType:'MINECRAFT',featured:true,productType:'KEY',region:'GLOBAL'}}});
      body.settings.popup_enabled=false;
      await route.fulfill({json:body});
      } catch { await route.abort().catch(()=>{}); }
    });
    const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.error('Browser:',error.stack);});
    page.on('requestfailed',request=>{if(request.url().startsWith(baseURL)&&request.resourceType()==='script')console.error('Local script failed:',request.url(),request.failure()?.errorText);});
    await ready(page);
    assert.equal(await page.locator('#digitalStoreContent .digital-product-card').count(),20,await page.locator('#digitalStoreContent').textContent());
    assert.equal(await page.locator('.digital-catalog-sidebar').count(),1);
    for(const [width,columns]of [[1440,3],[1024,3],[768,2],[600,2],[390,1],[320,1]])await layout(page,width,columns);
    await noPrices(page);
    await page.setViewportSize({width:1440,height:1000});
    for(const platform of ['Canva','CapCut']){
      const checkbox=page.locator(`[data-facet-key="platform"][value="${platform}"]`);
      await checkbox.check();assert.equal(await page.locator('#digitalProducts .digital-product-card').count(),catalog.products.filter(product=>product.specs._switchesDigital.platform===platform).length,platform);
      await checkbox.uncheck();
    }
    await page.locator('#digitalSearch').fill('Gemini');assert.equal(await page.locator('#digitalProducts .digital-product-card').count(),9);
    await page.locator('#digitalSearch').fill('Canva');assert.equal(await page.locator('#digitalProducts .digital-product-card').count(),5);
    await page.locator('#digitalSearch').fill('no-such-product');assert.equal(await page.locator('.digital-empty').count(),1);
    await page.locator('#digitalSearch').fill('');
    await page.locator('[data-facet-key="region"][value="BRAZIL"]').check();assert.equal(await page.locator('#digitalProducts .digital-product-card').count(),1);assert.equal(await page.locator('.region-brazil').textContent(),'BRAZIL');
    await page.locator('[data-facet-key="region"][value="BRAZIL"]').uncheck();
    await page.locator('[data-facet-key="duration"][value="6 أشهر"]').check();assert.equal(await page.locator('#digitalProducts .digital-product-card').count(),3);
    await page.locator('[data-facet-key="duration"][value="6 أشهر"]').uncheck();
    await ready(page,'/subscriptions/google-gemini-pro-3-months');
    await noPrices(page);assert.match(await page.locator('.digital-facts').textContent(),/Activation Link/);assert.match(await page.locator('.digital-facts').textContent(),/3 أشهر/);
    assert.equal(await page.locator('.digital-related [data-digital-id="1000001"]').count(),0);
    const related=await page.locator('.digital-related h3').allTextContents();assert.ok(related.every(name=>/Gemini|Google AI/.test(name)));
    await page.locator('.digital-purchase .subscription-order').click();
    let message=await page.evaluate(()=>new URL(capturedOrders.at(-1)).searchParams.get('text'));
    assert.match(message,/طلب اشتراك جديد/);assert.match(message,/Activation Link/);assert.match(message,/🌍/);assert.match(message,/\*/);assert.equal(message.includes('�'),false);assert.equal(/\$|USD|د\.ل/.test(message),false);
    for(const width of [1440,768,390,320])await layout(page,width,null,'subscription-detail');
    for(const slug of ['canva-pro-1-year-invitation','capcut-pro-6-months','windows-11-pro-pc','office-2024-ltsc-professional-plus','chatgpt-plus-1-month','claude-service-reference-100']){
      await ready(page,'/subscriptions/'+slug);await noPrices(page);
      if(/windows|office|chatgpt|claude/.test(slug))assert.equal(await page.locator('.digital-purchase .subscription-order').isDisabled(),true);
      if(slug.startsWith('capcut'))assert.match(await page.locator('.digital-facts').textContent(),/6 أشهر/);
    }
    await ready(page,'/subscriptions/gemini-pro-18-months-canva-pro');assert.equal(await page.locator('.subscription-bundle-services article').count(),2);assert.equal(/lifetime/i.test(await page.locator('#digitalStoreContent').textContent()),false);
    const schema=await page.locator('script[type="application/ld+json"]').allTextContents();for(const json of schema)assert.equal(/"price"|"lowPrice"|"highPrice"/.test(json),false);
    await ready(page,'/gift-cards/playstation?region=us&value=50');await page.locator('.gift-detail-view').waitFor();
    assert.match(await page.locator('[data-detail-option="denomination"][aria-pressed="true"] bdi').textContent(),/\$50/);
    assert.equal(await page.locator('.gift-price-notice').textContent(),notice);
    assert.equal(/د\.ل/.test(await page.locator('#giftCardsContent').textContent()),false);
    await page.locator('.gift-whatsapp-buy').click();message=await page.evaluate(()=>new URL(capturedOrders.at(-1)).searchParams.get('text'));
    assert.match(message,/\$50/);assert.equal(message.includes('السعر الحالي:'),false);assert.equal(message.includes('�'),false);
    await ready(page,'/gift-cards/shein');await page.locator('.gift-detail-view').waitFor();
    const values=await page.locator('[data-detail-option="denomination"] bdi').allTextContents();assert.deepEqual(values,['$300','$500','$1000']);
    assert.equal(/285|460|920/.test(await page.locator('#giftCardsContent').textContent()),false);
    await page.screenshot({path:path.join(output,'shein.png'),fullPage:true});
    await ready(page,'/checkout?product=playstation&region=us&value=50');await page.waitForURL('**/gift-cards/playstation?region=us&value=50');assert.equal(await page.locator('.gift-price-notice').textContent(),notice);

    const admin=await context.newPage();admin.on('pageerror',error=>errors.push(error.message));
    await admin.goto(baseURL+'/admin/',{waitUntil:'domcontentloaded'});await admin.locator('#localCatalogAdminBtn').click();await admin.locator('#subscriptionsBody tr').first().waitFor();
    assert.equal(await admin.locator('#subscriptionsBody tr').count(),20);
    await admin.locator('#addSubscriptionBtn').click();
    await admin.locator('[name="productName"]').fill('Browser Test Subscription');await admin.locator('[name="productSlug"]').fill('browser-test-subscription');
    await admin.locator('[name="family"]').selectOption('canva');await admin.locator('[name="productType"]').selectOption('ACCOUNT');
    await admin.locator('[name="platform"]').fill('Canva');await admin.locator('[name="duration"]').fill('شهر');await admin.locator('[name="activationMethod"]').fill('Invitation Link');await admin.locator('[name="region"]').fill('EUROPE');
    await admin.locator('[name="imageUrl"]').fill('/assets/subscriptions/canva.svg');await admin.locator('[name="availability"]').selectOption('available');await admin.locator('[name="sortOrder"]').fill('-50');await admin.locator('[name="featured"]').check();
    await admin.locator('[name="internalCost"]').fill('1234.56');await admin.locator('[name="internalReferencePrice"]').fill('9876.54');
    await admin.locator('#modalForm button[type="submit"]').click();await admin.locator('#modal').waitFor({state:'hidden'});
    let apiCatalog=await(await fetch(baseURL+'/api/public/subscriptions')).json();let added=apiCatalog.products.find(item=>item.slug==='browser-test-subscription');assert.ok(added);publicKeys(apiCatalog.products);assert.equal(JSON.stringify(apiCatalog).includes('9876.54'),false);
    await ready(page,'/subscriptions/browser-test-subscription');assert.match(await page.locator('.digital-facts').textContent(),/شهر/);assert.match(await page.locator('.digital-facts').textContent(),/EUROPE/);await noPrices(page);
    await admin.locator(`[data-subscription-edit="${added.id}"]`).click();assert.equal(await admin.locator('[name="internalCost"]').inputValue(),'1234.56');
    await admin.locator('[name="duration"]').fill('6 أشهر');await admin.locator('[name="region"]').fill('BRAZIL');await admin.locator('[name="activationMethod"]').fill('Activation Link');await admin.locator('[name="availability"]').selectOption('comingSoon');await admin.locator('[name="imageUrl"]').fill('/assets/subscriptions/missing-test-image.svg');
    await admin.locator('#modalForm button[type="submit"]').click();await admin.locator('#modal').waitFor({state:'hidden'});
    await ready(page,'/subscriptions/browser-test-subscription');assert.equal(await page.locator('.digital-purchase .subscription-order').isDisabled(),true);assert.match(await page.locator('.digital-facts').textContent(),/BRAZIL/);await page.locator('.store-product-media.image-unavailable').waitFor();
    await admin.evaluate(async id=>{const rows=await SwitchesLocalAdmin.request('/api/local-admin/subscriptions');const item=rows.find(row=>row.id===id);item.images=['/assets/subscriptions/missing-test-image.svg','/assets/subscriptions/canva.svg'];await SwitchesLocalAdmin.request('/api/local-admin/subscriptions/'+id,{method:'PUT',body:JSON.stringify(item)});},added.id);
    await ready(page,'/subscriptions/browser-test-subscription');await page.locator('.store-product-media.image-unavailable').waitFor();await page.locator('[data-detail-image]').nth(1).click();await page.waitForFunction(()=>!document.querySelector('.store-product-media img').hidden&&document.querySelector('.store-product-media img').naturalWidth>0);
    await admin.locator(`[data-subscription-hide="${added.id}"]`).click();await admin.waitForTimeout(250);apiCatalog=await(await fetch(baseURL+'/api/public/subscriptions')).json();assert.equal(apiCatalog.products.some(item=>item.id===added.id),false);
    await admin.locator(`[data-subscription-delete="${added.id}"]`).click();await admin.waitForTimeout(200);
    assert.equal(await admin.locator(`[data-subscription-edit="${added.id}"]`).count(),0);
    await admin.screenshot({path:path.join(output,'admin-subscriptions.png'),fullPage:true});
    await admin.locator('[data-section="gift-cards"]').click();const sheinRow=admin.locator('#giftCardsBody tr').filter({hasText:'SHEIN'});await sheinRow.getByText('تعديل',{exact:true}).click();
    const selling=admin.locator('#giftDenomRows [name="sellingPriceLYD"]');for(let index=0;index<3;index++)await selling.nth(index).fill(String([285,460,920][index]));
    await admin.getByText('حفظ الفئات',{exact:true}).click();await admin.waitForTimeout(350);
    const publicGifts=await(await fetch(baseURL+'/api/public/gift-cards')).json();publicKeys(publicGifts);const shein=publicGifts.platforms.find(item=>item.id==='shein');assert.deepEqual(shein.regions[0].denominations.map(item=>item.value),[300,500,1000]);assert.equal(/285|460|920/.test(JSON.stringify(shein)),false);
    await admin.locator('.modal-close[data-close]').click();await admin.locator('[data-section="subscriptions"]').click();await admin.locator('#dynamicPriceNoticeForm textarea').fill('نص سعر مشترك للاختبار');const noticeSaved=admin.waitForResponse(response=>response.url().endsWith('/api/local-admin/settings')&&response.request().method()==='PUT');await admin.locator('#dynamicPriceNoticeForm button').click();await noticeSaved;
    await ready(page,'/subscriptions/google-gemini-pro-3-months');assert.equal(await page.locator('.digital-purchase .dynamic-price-notice').textContent(),'نص سعر مشترك للاختبار');
    await ready(page,'/gift-cards/shein');await page.locator('.gift-price-notice').waitFor();assert.equal(await page.locator('.gift-price-notice').textContent(),'نص سعر مشترك للاختبار');
    await admin.locator('#dynamicPriceNoticeForm textarea').fill(notice);await admin.locator('#dynamicPriceNoticeForm button').click();
    // Existing PC Parts and Minecraft still show their own prices and use the cart.
    await ready(page,'/?view=products');await page.waitForFunction(()=>window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__);assert.equal(await page.locator('#allProductsGrid .marketplace-product').count(),1);
    await page.locator('#allProductsGrid .btn-add-cart').click();assert.equal(await page.evaluate(()=>cart.length),1);
    await ready(page,'/minecraft');await page.locator('.digital-product-card .digital-price').waitFor();assert.match(await page.locator('.digital-product-card .digital-price').textContent(),/\$/);
    assert.equal(externalWrites,0,'No Supabase writes');assert.deepEqual(errors,[]);
    console.log('PASS: 20 products; responsive 320-1440px; search/family/duration/region/status filters; quotations and Unicode WhatsApp; denominations and SHEIN values; real local Admin CRUD and internal-price privacy; placeholders; related/bundle/SEO; PC/Minecraft regression.');
    console.log(`Screenshots: ${output}`);
  } finally {if(browser)await browser.close();if(server)server.kill();}
}
module.exports={main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
