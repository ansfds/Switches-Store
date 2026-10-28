const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const model = require('../shared/product-sections.js');
const baseURL = process.env.STORE_URL || 'http://127.0.0.1:8000';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'switches-digital-'));
const clientSource = fs.readFileSync(path.join(__dirname, '../shared/supabase-client.js'), 'utf8');
const makeProduct = (id, section, extra = {}) => ({
  id, name: section === 'MINECRAFT' ? `Minecraft Edition ${id}` : section === 'SUBSCRIPTION' ? `Digital Software ${id}` : 'Existing PC Part',
  slug: `product-${id}`, images: [section === 'MINECRAFT' ? '/assets/sections/minecraft-java-bedrock.webp' : '/assets/sections/digital-subscriptions.svg'],
  price: 20 + id, oldPrice: 40 + id, availability: 'available', status: 'published', isActive: true, sortOrder: id,
  specs: model.storeMetadata({}, { categoryType: section, platform: 'Test Platform', productType: 'KEY', region: 'GLOBAL', ...extra.digital }),
  description: `وصف المنتج ${id}\nمعلومات المنتج من الإدارة.`, ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'digital')),
});
const fixtures = [makeProduct(1,'PC_PART'), ...Array.from({length:11}, (_,i) => makeProduct(i+2,'MINECRAFT',{digital:{featured:i<3,region:['GLOBAL','EUROPE','UNITED STATES',''][i%4]}})), makeProduct(20,'SUBSCRIPTION'), makeProduct(21,'SUBSCRIPTION',{digital:{productType:'SUBSCRIPTION',duration:'3 أشهر',deliveryMethod:'Email',region:'EUROPE'}}), makeProduct(22,'SUBSCRIPTION',{availability:'unavailable'}), makeProduct(23,'SUBSCRIPTION',{availability:'comingSoon'}), makeProduct(24,'SUBSCRIPTION',{specs:model.storeMetadata({}, {categoryType:'SUBSCRIPTION'})})];

async function mockContext(browser, products, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ products, options }) => { window.digitalFixtures = products; window.digitalOptions = options; }, { products, options });
  await context.route('**/shared/supabase-client.js', route => route.fulfill({ contentType: 'application/javascript', body: clientSource + `
    window.SwitchesSupabaseStore = {
      configured: () => true,
      loadProductHomepageBootstrap: async () => { await new Promise(resolve => setTimeout(resolve, window.digitalOptions.delay || 0)); if(window.digitalOptions.fail) throw new Error('Test offline'); return { products: window.digitalFixtures, homepageSections: [] }; },
      loadSettings: async () => ({ popup_enabled: false, cart_discount_enabled: false }),
      loadGiftCards: async () => [],
    };
    window.SwitchesSupabaseAdmin = { hasSession: async () => false };
  ` }));
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({ contentType:'application/javascript', body:'window.supabase = {};' }));
  // Tests never send writes, authentication, or order messages to external services.
  await context.route('**/*.supabase.co/**', route => route.abort());
  await context.route('**/api/auth/me', route => route.fulfill({json:{authenticated:false,user:null}}));
  return context;
}
async function ready(page, pathName) {
  await page.goto(baseURL + pathName, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__ === true);
}
async function inspect(page, name, width, expectedColumns) {
  await page.setViewportSize({width,height:1000});
  await page.waitForTimeout(450);
  const result = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    columns: document.querySelector('.digital-grid') ? getComputedStyle(document.querySelector('.digital-grid')).gridTemplateColumns.split(' ').length : 0,
    navCount: document.querySelector('#digitalSectionNavigation .section-navigation').children.length,
    allImagesContain: [...document.querySelectorAll('.digital-card-art img,.digital-detail-image')].every(image => getComputedStyle(image).objectFit === 'contain'),
    mainHidden: getComputedStyle(document.querySelector('.main-content')).display === 'none',
  }));
  assert.equal(result.overflow,false,`${name} ${width}px overflow`);
  assert.equal(result.navCount,4);
  assert.equal(result.allImagesContain,true);
  assert.equal(result.mainHidden,true);
  if (expectedColumns) assert.equal(result.columns,expectedColumns);
  await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:width===1440});
}

async function main() {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const errors=[];
  try {
    const context = await mockContext(browser, fixtures);
    const page=await context.newPage(); page.on('pageerror', error => { errors.push(error.message); console.error('Browser JavaScript:',error.message); });
    await ready(page,'/minecraft');
    await page.locator('.digital-hero-image').waitFor();
    await page.waitForFunction(() => document.querySelector('.digital-hero-image')?.naturalWidth > 0);
    assert.equal(await page.locator('.digital-featured-grid .digital-product-card').count(),3);
    assert.equal(await page.locator('#digitalProducts .digital-product-card').count(),8);
    assert.match(await page.title(),/Minecraft/);
    for (const [width,cols] of [[1440,6],[1024,5],[768,4],[600,3],[390,2],[320,2]]) await inspect(page,'minecraft',width,cols);
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-digital-id="2"] h3 a').click();
    await page.waitForURL('**/minecraft/product-2');
    assert.equal(await page.locator('.digital-purchase').count(),1);
    assert.equal(await page.locator('.digital-related [data-digital-id="2"]').count(),0);
    assert.equal(await page.locator('.digital-related .digital-product-card').count(),6);
    assert.match(await page.locator('link[rel="canonical"]').getAttribute('href'),/\/minecraft\/product-2$/);
    assert.match(await page.locator('meta[property="og:image"]').getAttribute('content'),/minecraft-java-bedrock/);
    for (const width of [1440,768,390,320]) await inspect(page,'minecraft-detail',width);
    await page.locator('.digital-purchase [data-digital-cart]').click();
    assert.equal(await page.evaluate(()=>cart.length),1);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__);
    assert.equal(await page.evaluate(()=>cart[0].name),fixtures[1].name);
    await page.evaluate(()=>SwitchesDigitalStore.navigate('/subscriptions'));
    assert.equal(await page.locator('.digital-product-card').count(),5);
    for (const width of [1440,768,390,320]) await inspect(page,'subscriptions',width);
    assert.equal(await page.locator('[data-digital-id="22"] button').isDisabled(),true);
    assert.equal(await page.locator('[data-digital-id="23"] button').isDisabled(),true);
    assert.equal(await page.locator('[data-digital-id="24"] .digital-region').count(),0);
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-digital-id="21"] h3 a').click();
    assert.match(await page.locator('.digital-facts').textContent(),/3 أشهر/);
    assert.match(await page.locator('.digital-facts').textContent(),/Email/);
    await page.locator('.digital-purchase [data-digital-cart]').click();
    const message=await page.evaluate(()=>buildProductWhatsappMessage());
    assert.match(message,/Minecraft Edition 2/); assert.match(message,/Digital Software 21/); assert.match(message,/Switches Store/);
    assert.equal(await page.evaluate(()=>cart.length),2);
    await page.goBack(); await page.waitForURL('**/subscriptions');
    assert.equal(await page.locator('.digital-hero-subscriptions').isVisible(),true);
    await page.locator('#digitalSectionNavigation [data-section-route="gift-cards"]').click();
    await page.waitForURL('**/gift-cards');
    assert.equal(await page.locator('#digitalStorePage').isVisible(),false);
    assert.equal(await page.locator('#giftCardsPage').isVisible(),true);
    await page.locator('#giftCardsTopSwitch [data-section-route="products"]').click();
    await page.waitForURL('**/?view=products');
    assert.equal(await page.locator('#allProductsGrid .marketplace-product').count(),1);
    await page.locator('#allProductsStoreModeSwitch [data-section-route="minecraft"]').click();
    await page.waitForURL('**/minecraft');
    await page.locator('#logoLink').click();
    await page.waitForURL(baseURL+'/');
    assert.equal(await page.locator('#digitalStorePage').isVisible(),false);
    assert.equal(await page.locator('#homeStoreModeSwitch [data-section-route]').count(),4);
    assert.equal((await page.title()).includes('Minecraft'),false,'Home SEO is restored after leaving a section');
    await page.screenshot({path:path.join(output,'homepage-sections.png'),fullPage:false});
    console.log('PASS: storefront layouts, details, cart, history, and section isolation.');
    await ready(page,'/?product=21');
    await page.waitForURL('**/subscriptions/product-21');
    await ready(page,'/minecraft/product-20');
    assert.match(await page.locator('#digitalStoreContent').textContent(),/المنتج غير موجود/);
    await ready(page,'/subscriptions/product-24');
    assert.equal(await page.locator('.digital-facts').count(),0);

    // Exercise real Admin form handlers, then reload their saved data through the storefront.
    const admin=await context.newPage(); admin.on('pageerror', error=>errors.push(error.message));
    await admin.goto(baseURL+'/admin/',{waitUntil:'domcontentloaded'});
    await admin.evaluate(products=>{
      window.savedDigitalProducts=[];
      state.me={role:'owner',username:'Local Test'}; state.products=products; state.categories=[{name:'Existing Category'}]; state.brands=[];
      showApp(); switchSection('products');
      api=async (url,options={})=>{
        if(options.method==='POST'||options.method==='PUT') {
          const payload=JSON.parse(options.body); const id=Number(url.match(/products\/(\d+)/)?.[1]||100+savedDigitalProducts.length);
          const item={...payload,id,slug:payload.slug||`product-${id}`};
          state.products=state.products.filter(row=>row.id!==id).concat(item); savedDigitalProducts.push(item); return {id};
        }
        if(url==='/api/admin/products') return state.products;
        if(url==='/api/admin/overview') return {};
        if(url==='/api/admin/categories') return state.categories;
        if(url==='/api/admin/brands') return state.brands;
        if(url==='/api/admin/homepage') return [];
        throw new Error('Unexpected test request: '+url);
      };
      openProductEditor();
    },fixtures);
    assert.equal(await admin.locator('[data-digital-fields]').isVisible(),false);
    await admin.locator('[name=categoryType]').selectOption('MINECRAFT');
    assert.equal(await admin.locator('[name=condition]').isVisible(),false);
    assert.equal(await admin.locator('[name=digitalDuration]').isVisible(),false);
    await admin.locator('[name=name]').fill('Minecraft Admin Product');
    await admin.locator('[name=images]').fill('/assets/sections/minecraft-java-bedrock.webp');
    await admin.locator('[name=price]').fill('17.10');
    await admin.locator('[name=oldPrice]').fill('33.71');
    await admin.locator('[name=slug]').fill('admin-minecraft');
    await admin.locator('[name=digitalType]').selectOption('KEY');
    await admin.locator('[name=digitalPlatform]').fill('Microsoft Store');
    await admin.locator('[name=digitalFeatured]').check();
    await admin.locator('#modalForm button[type=submit]').click();
    await admin.waitForFunction(()=>savedDigitalProducts.length===1);
    let saved=await admin.evaluate(()=>savedDigitalProducts[0]);
    assert.equal(model.metadata(saved).categoryType,'MINECRAFT'); assert.equal(model.metadata(saved).region,''); assert.equal(model.metadata(saved).featured,true);
    await admin.evaluate(()=>openProductEditor(100));
    assert.equal(await admin.locator('[name=digitalFeatured]').isChecked(),true);
    await admin.locator('[name=images]').fill('/assets/sections/minecraft-banner.webp');
    await admin.locator('[name=availability]').selectOption('unavailable');
    await admin.locator('#modalForm button[type=submit]').click();
    await admin.waitForFunction(()=>savedDigitalProducts.length===2);
    saved=await admin.evaluate(()=>savedDigitalProducts[1]);
    await page.evaluate(saved=>{ allProducts.push(normalizePublicProduct(saved)); sortedProducts.push(normalizePublicProduct(saved)); SwitchesDigitalStore.navigate('/minecraft'); },saved);
    assert.equal(await page.locator('.digital-featured-grid [data-digital-id="100"]').count(),1);
    assert.match(await page.locator('[data-digital-id="100"] img').getAttribute('src'),/minecraft-banner/);
    assert.equal(await page.locator('[data-digital-id="100"] button').isDisabled(),true);
    await admin.evaluate(()=>openProductEditor());
    await admin.locator('[name=categoryType]').selectOption('SUBSCRIPTION');
    await admin.locator('[name=digitalType]').selectOption('SUBSCRIPTION');
    assert.equal(await admin.locator('[name=digitalDuration]').isVisible(),true);
    await admin.locator('[name=name]').fill('Admin Subscription');
    await admin.locator('[name=images]').fill('/assets/sections/digital-subscriptions.svg');
    await admin.locator('[name=digitalDuration]').fill('12 شهر');
    await admin.locator('[name=digitalDeliveryMethod]').fill('WhatsApp');
    await admin.locator('#modalForm button[type=submit]').click();
    await admin.waitForFunction(()=>savedDigitalProducts.length===3);
    const subscription=await admin.evaluate(()=>savedDigitalProducts[2]);
    assert.equal(model.metadata(subscription).duration,'12 شهر');
    await page.evaluate(saved=>{ allProducts.push(normalizePublicProduct(saved)); sortedProducts.push(normalizePublicProduct(saved)); SwitchesDigitalStore.navigate('/subscriptions'); },subscription);
    assert.equal(await page.locator(`[data-digital-id="${subscription.id}"]`).count(),1);

    for(const [name,options] of [['loading',{delay:1700}],['empty',{}],['failure',{fail:true}]]) {
      const c=await mockContext(browser,[],options); const p=await c.newPage();
      await p.goto(baseURL+'/minecraft',{waitUntil:'domcontentloaded'});
      if(name==='loading') { await p.locator('.digital-skeletons').waitFor(); assert.equal(await p.locator('[data-digital-id]').count(),0); }
      if(name==='empty') { await p.locator('.digital-empty').waitFor(); assert.equal(await p.locator('[data-digital-id]').count(),0); }
      if(name==='failure') { await p.locator('#digitalProducts .product-load-error').waitFor(); }
      await c.close();
    }
    assert.deepEqual(errors,[],'No browser JavaScript errors');
    console.log('PASS: 320-1440px responsive layouts, four navigation cards, hero, Featured/grid ordering, detail routes, related products, empty/loading/error states, cart persistence + WhatsApp text, PC/Gift isolation, Admin add/edit/image/Featured/availability/duration.');
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
