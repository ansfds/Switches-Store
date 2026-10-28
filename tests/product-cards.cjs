const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseURL = process.env.STORE_URL || 'http://127.0.0.1:8000';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'switches-product-cards-'));

async function inspectLayout(page, width, columns, name) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === (document.body.dataset.theme === 'dark' ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)'));
  await page.locator('#allProductsGrid').evaluate(grid => {
    window.scrollTo({ top: window.scrollY + grid.getBoundingClientRect().top - 100, behavior: 'instant' });
  });
  const layout = await page.locator('#allProductsGrid').evaluate(grid => {
    const cards = [...grid.querySelectorAll('.marketplace-product')];
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      imageBackground: document.body.dataset.theme === 'dark' ? 'rgb(232, 232, 232)' : 'rgb(240, 240, 241)',
      cards: cards.map(card => {
        const box = card.getBoundingClientRect();
        const imageContainer = card.querySelector('.product-image-container');
        const imageBox = imageContainer.getBoundingClientRect();
        const imageStyle = getComputedStyle(imageContainer);
        const controls = [...card.querySelectorAll('button')];
        return {
          color: getComputedStyle(card).backgroundColor,
          imageFit: getComputedStyle(card.querySelector('img')).objectFit,
          imageWidth: imageBox.width,
          imageHeight: imageBox.height,
          cardWidth: box.width,
          imageBackground: imageStyle.backgroundColor,
          imagePadding: imageStyle.paddingTop,
          imageBorder: imageStyle.borderTopWidth,
          imageRadius: imageStyle.borderTopLeftRadius,
          imageShadow: imageStyle.boxShadow,
          imageCentered: Math.abs((imageBox.left + imageBox.right) - (box.left + box.right)) < 2,
          controlsFit: controls.every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= box.left && rect.right <= box.right &&
              button.scrollWidth <= button.clientWidth + 1 && rect.height <= 35;
          }),
          actionsBottom: card.querySelector('.product-actions').getBoundingClientRect().bottom,
          controls: controls.map(button => ({ text: button.textContent.trim(), width: button.clientWidth, scrollWidth: button.scrollWidth, height: button.getBoundingClientRect().height })),
        };
      }),
    };
  });
  assert.equal(layout.columns, columns, `${width}px grid columns`);
  assert.equal(layout.overflow, false, `${width}px page overflow`);
  layout.cards.forEach(card => {
    assert.equal(card.color, 'rgba(0, 0, 0, 0)');
    assert.equal(card.imageFit, 'contain');
    assert.ok(Math.abs(card.imageWidth - card.cardWidth) < 1, `${width}px full-width image area`);
    assert.ok(Math.abs(card.imageHeight - card.imageWidth * 3 / 4) < 1, `${width}px 4:3 image area`);
    assert.equal(card.imageBackground, layout.imageBackground);
    assert.equal(card.imagePadding, '5px');
    assert.equal(card.imageBorder, '0px');
    assert.equal(card.imageRadius, '6px');
    assert.equal(card.imageShadow, 'none');
    assert.equal(card.imageCentered, true);
    assert.equal(card.controlsFit, true, `${width}px controls fit: ${JSON.stringify(card.controls)}`);
  });
  for (let index = 0; index < layout.cards.length; index += columns) {
    const row = layout.cards.slice(index, index + columns);
    assert.ok(Math.max(...row.map(card => card.actionsBottom)) - Math.min(...row.map(card => card.actionsBottom)) < 2);
  }
  await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const imageResponses = new Map();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.request().resourceType() === 'image' && response.ok()) {
        const bytes = response.body().then(body => ({ body, contentType: response.headers()['content-type'] })).catch(() => null);
        for (let request = response.request(); request; request = request.redirectedFrom()) imageResponses.set(request.url(), bytes);
      }
    });
    // Keep every test write inside this browser context.
    await context.route('**/*.supabase.co/**', route => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue();
      return route.abort();
    });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__ === true, { timeout: 30000 });
    await page.evaluate(() => { closePromoPopup(); showAllProducts(); });
    const products = await page.evaluate(() => allProducts.map(product => ({ ...product })));
    assert.ok(products.length > 0, 'real catalog loaded');
    await page.locator('#allProductsGrid img').first().waitFor();
    await page.locator('#allProductsGrid img').evaluateAll(images => images.slice(0, 12).forEach(image => image.loading = 'eager'));
    await page.waitForFunction(() => [...document.querySelectorAll('#allProductsGrid img')].filter(img => img.complete && img.naturalWidth > 0).length >= 4);
    await page.screenshot({ path: path.join(output, 'catalog-desktop.png') });
    await page.evaluate(() => document.body.setAttribute('data-theme', 'dark'));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(18, 18, 18)');
    await page.screenshot({ path: path.join(output, 'catalog-dark-wide.png') });
    await inspectLayout(page, 1920, 5, 'catalog-live-dark');
    console.log(`Live catalog: ${products.length} products; four real product images verified.`);

    const exampleIds = await page.locator('#allProductsGrid .marketplace-product').evaluateAll(cards => cards.filter(card => card.querySelector('img').naturalWidth > 0).slice(0, 4).map(card => Number(card.dataset.id)));
    const examples = exampleIds.map(id => products.find(product => product.id === id));
    // Reuse the exact downloaded bytes so CDN latency cannot affect fixture screenshots.
    for (const product of examples) {
      const url = new URL(product.images[0],baseURL).href.split('#')[0];
      const response = await imageResponses.get(url);
      assert.ok(response,`Verified image bytes are cached: ${url}`);
      await page.route(requestUrl => requestUrl.href === url, route => route.fulfill(response));
    }
    const fixtures = examples.map((product, index) => ({
      ...product,
      id: 900001 + index,
      condition: ['NEW', 'REFURBISHED', 'USED', 'OPEN_BOX'][index],
      availability: ['AVAILABLE', 'OUT_OF_STOCK', 'available', 'COMING_SOON'][index],
      freeShipping: index === 0,
      oldPrice: index === 0 ? product.price + 20 : null,
      tags: (product.tags || []).filter(tag => tag !== 'freeShipping'),
    }));
    await page.evaluate(rows => {
      const products = rows.map(normalizePublicProduct);
      allProducts.splice(0, allProducts.length, ...products);
      sortedProducts.splice(0, sortedProducts.length, ...products);
      cart = [];
      saveCart();
      renderProductsGrid('allProductsGrid', products);
    }, fixtures);
    const cards = page.locator('#allProductsGrid .marketplace-product');
    await cards.locator('img').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
    await page.waitForFunction(() => [...document.querySelectorAll('#allProductsGrid img')].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 30000 });
    const labels = ['جديد', 'مجدد', 'مستعمل', 'شبه جديد'];
    const statuses = ['متوفر', 'غير متوفر', 'متوفر', 'قريبًا'];
    for (let index = 0; index < 4; index++) {
      const card = cards.nth(index);
      assert.equal(await card.locator('.product-condition').textContent(), labels[index]);
      assert.equal(await card.locator('.product-availability').textContent(), statuses[index]);
      assert.equal(await card.locator('.btn-add-cart').isDisabled(), index === 1 || index === 3);
      assert.equal(await card.locator('.product-shipping').count(), index === 0 ? 1 : 0);
      assert.equal(await card.locator('.old-price').count(), index === 0 ? 1 : 0);
      assert.equal(await card.locator('img').getAttribute('src'), fixtures[index].images[0]);
      assert.equal(await card.locator('bdi.current-price').textContent(), await page.evaluate(price => formatPrice(price), fixtures[index].price));
    }
    assert.equal(await cards.first().locator('.favorite-btn').isDisabled(), true);
    assert.match(await cards.first().locator('.favorite-btn').getAttribute('title'), /غير مفعلة/);

    await inspectLayout(page, 1920, 5, 'cases');
    await page.evaluate(() => document.body.removeAttribute('data-theme'));
    await inspectLayout(page, 1440, 5, 'cases-light');
    await inspectLayout(page, 1360, 5, 'cases-light');
    await cards.first().locator('.product-image-container').hover();
    assert.equal(await cards.first().locator('img').evaluate(image => getComputedStyle(image).transform), 'none');
    await page.evaluate(() => document.body.setAttribute('data-theme', 'dark'));
    await inspectLayout(page, 1200, 4, 'cases');
    await inspectLayout(page, 1024, 3, 'cases');
    await inspectLayout(page, 768, 3, 'cases');
    await inspectLayout(page, 390, 2, 'cases');
    await inspectLayout(page, 320, 2, 'cases');

    await cards.first().locator('.btn-add-cart').click();
    assert.equal(await page.evaluate(() => cart.length), 1);
    assert.equal(await page.evaluate(() => cart[0].price), fixtures[0].price);
    assert.equal(await page.evaluate(() => document.getElementById('productModal').classList.contains('active')), false);
    assert.equal(await page.evaluate(() => addToCart(900002)), false);
    assert.equal(await page.evaluate(() => addToCart(900004)), false);
    assert.equal(await page.evaluate(() => cart.length), 1);
    await cards.nth(2).locator('.btn-add-cart').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => cart.length), 2);
    assert.equal(await page.evaluate(() => document.getElementById('productModal').classList.contains('active')), false);

    let favoriteIds = [];
    const favoriteMethods = [];
    await page.route('**/api/favorites**', async route => {
      const method = route.request().method();
      favoriteMethods.push(method);
      if (method === 'POST') favoriteIds.push(String(route.request().postDataJSON().product_id));
      if (method === 'DELETE') favoriteIds = [];
      await route.fulfill({ json: { favorites: favoriteIds } });
    });
    await page.evaluate(() => {
      window.SwitchesFeatureFlags.AUTH_UI_ENABLED = true;
      window.SwitchesAuth = { getCachedUser: () => ({ id: 'card-test-user' }) };
      syncFavoriteButtons();
    });
    const heart = cards.first().locator('.favorite-btn');
    await heart.click();
    await page.waitForFunction(() => isFavorite(900001));
    assert.equal(await heart.getAttribute('aria-pressed'), 'true');
    assert.ok((await heart.locator('i').getAttribute('class')).includes('fa-solid'));
    await heart.click();
    await page.waitForFunction(() => !isFavorite(900001));
    assert.equal(await heart.getAttribute('aria-pressed'), 'false');
    assert.ok((await heart.locator('i').getAttribute('class')).includes('fa-regular'));
    assert.deepEqual(favoriteMethods, ['POST', 'DELETE']);
    await cards.first().locator('.product-title a').focus();
    await page.keyboard.press('Enter');
    assert.match(page.url(), /product=900001/);
    assert.equal(await page.locator('.store-product-summary h1').textContent(), fixtures[0].name);
    assert.equal(await page.locator('.store-product-media img').getAttribute('src'), fixtures[0].images[0]);
    assert.equal(await page.locator('.store-product-summary .store-product-delivery').count(), 1);
    assert.equal(await page.locator('#relatedProductsGrid .marketplace-product').count(), 3);
    assert.equal(await page.locator('#relatedProductsGrid [data-id="900001"]').count(), 0);
    await page.locator('.store-product-summary .store-product-buy').click();
    assert.equal(await page.evaluate(() => cart.find(item => item.id === 900001).quantity), 2);
    assert.match(page.url(), /product=900001/);
    await page.locator('.store-product-summary .favorite-btn').click();
    await page.waitForFunction(() => isFavorite(900001));
    assert.equal(await page.locator('.store-product-summary .favorite-btn').getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: path.join(output, 'detail-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(output, 'detail-desktop.png'), fullPage: true });
    const nextId = await page.locator('#relatedProductsGrid .product-image-container').first().getAttribute('data-product-link');
    await page.locator('#relatedProductsGrid .product-image-container').first().click();
    assert.match(page.url(), new RegExp(`product=${nextId}`));
    await page.goBack({waitUntil:'domcontentloaded'});
    assert.match(page.url(), /product=900001/);
    assert.equal(await page.locator('.store-product-summary h1').textContent(), fixtures[0].name);
    await page.locator('[data-catalog-listing]').click();

    await page.locator('#allProductsConditionFilter input[value="مستعمل"]').check();
    assert.equal(await cards.count(), 1);
    assert.equal(await cards.first().getAttribute('data-id'), '900003');
    assert.equal(await page.locator('.catalog-filter-chip').count(), 1);
    await cards.first().locator('.product-image-container').click();
    await page.goBack({waitUntil:'domcontentloaded'});
    assert.equal(await cards.count(), 1);
    assert.equal(await page.locator('#allProductsConditionFilter input[value="مستعمل"]').isChecked(), true);
    await page.locator('[data-remove-filter=condition]').click();
    assert.equal(await cards.count(), 4);
    await page.locator('#allProductsSearchInput').fill('no-such-product-12345');
    assert.equal(await cards.count(), 0);
    await page.locator('[data-reset-filters]').click();
    assert.equal(await cards.count(), 4);
    const brand = await page.locator('#allProductsBrandFilter input').first().inputValue();
    await page.locator('#allProductsBrandFilter input').first().check();
    assert.equal(await cards.count(), fixtures.filter(product => product.brand.trim() === brand).length);
    await page.locator('[data-reset-filters]').click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.catalog-filter-toggle').click();
    assert.equal(await page.locator('#catalogFilters').getAttribute('aria-modal'), 'true');
    await page.locator('#allProductsConditionFilter input[value="جديد"]').check();
    await page.screenshot({ path: path.join(output, 'filters-mobile.png') });
    await page.locator('.catalog-apply-filters').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.catalog-close-filters').evaluate(button => button === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.catalog-filter-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await cards.count(), 1);
    await page.locator('[data-reset-filters]').click();

    await page.evaluate(() => {
      storeBootstrapPending = true;
      window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__ = false;
      SwitchesCatalog.showListing();
    });
    assert.equal(await page.locator('#allProductsGrid .product-card-skeleton').count(), 12);
    assert.equal(await page.locator('#allProductsGrid .product-title').count(), 0);
    await page.evaluate(() => SwitchesCatalog.showProduct(900001));
    assert.equal(await page.locator('.detail-loading').count(), 1);
    assert.equal(await page.locator('.store-product-summary h1').count(), 0);
    await page.evaluate(() => {
      storeBootstrapPending = false;
      window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__ = true;
      SwitchesCatalog.refresh();
    });
    assert.equal(await page.locator('.store-product-summary h1').textContent(), fixtures[0].name);
    await page.evaluate(() => SwitchesCatalog.showProduct('missing-product'));
    assert.equal(await page.locator('.catalog-not-found').count(), 1);

    for (let index = 1; index < fixtures.length; index++) {
      await page.evaluate(id => SwitchesCatalog.showProduct(id), fixtures[index].id);
      assert.equal(await page.locator('.store-product-summary .store-product-condition').textContent(), labels[index]);
      assert.equal(await page.locator('.store-product-summary .store-product-stock').textContent(), statuses[index]);
      assert.equal(await page.locator('.store-product-summary .store-product-buy').isDisabled(), index === 1 || index === 3);
      assert.equal(await page.locator('.store-product-summary .store-product-delivery').count(), 1);
    }

    const colorProduct = products.find(product => product.colorSelectionEnabled && product.colors.some(color => color.available) && product.availability === 'available');
    if (colorProduct) {
      await page.evaluate(({ products, id }) => {
        allProducts.splice(0, allProducts.length, ...products);
        sortedProducts.splice(0, sortedProducts.length, ...products);
        selectedModalColors[id] = null;
        addToCart(id);
      }, { products, id: colorProduct.id });
      assert.match(page.url(), new RegExp(`product=${colorProduct.id}`));
      await page.locator('.store-product-summary [data-detail-option="color"]:not(.option-unavailable)').first().click();
      await page.locator('.store-product-summary .store-product-buy').click();
      assert.equal(await page.evaluate(id => cart.find(product => product.id === id)?.selectedColor, colorProduct.id), colorProduct.colors.find(color => color.available).name);
      console.log('Existing color-selection cart flow passed.');
    }

    const realProduct = examples[0];
    await page.goto(`${baseURL}/?product=${realProduct.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__ === true);
    assert.equal(await page.locator('.store-product-summary h1').textContent(), realProduct.name);
    assert.equal(await page.locator('.store-product-media img').getAttribute('src'), realProduct.images[0]);
    const relatedIds = await page.locator('#relatedProductsGrid .marketplace-product').evaluateAll(cards => cards.map(card => Number(card.dataset.id)));
    assert.equal(relatedIds.length, 6);
    assert.ok(!relatedIds.includes(realProduct.id));
    const expectedRelated = products.filter(product => product.id !== realProduct.id).sort((a, b) =>
      Number(b.category === realProduct.category) - Number(a.category === realProduct.category) ||
      Number(b.brand === realProduct.brand) - Number(a.brand === realProduct.brand) ||
      Math.abs(a.price - realProduct.price) - Math.abs(b.price - realProduct.price)).slice(0, 6).map(product => product.id);
    assert.deepEqual(relatedIds, expectedRelated);
    await page.waitForFunction(() => typeof showGiftCards === 'function');
    await page.evaluate(() => showGiftCards());
    assert.equal(await page.locator('#allProductsPage').isVisible(), false);
    assert.equal(await page.locator('#giftCardsPage').isVisible(), true);
    await page.evaluate(() => showAllProducts());
    assert.match(page.url(), /view=products/);
    assert.equal(await page.locator('#giftCardsPage').isVisible(), false);
    await page.evaluate(() => showMainPage());
    assert.equal(new URL(page.url()).search, '');
    assert.equal(await page.locator('.main-content').isVisible(), true);
    assert.deepEqual(errors, [], 'storefront runtime errors');

    const admin = await context.newPage();
    await admin.goto(`${baseURL}/admin/`, { waitUntil: 'domcontentloaded' });
    await admin.waitForFunction(() => typeof openProductEditor === 'function');
    await admin.evaluate(product => {
      state.products = [{ ...product, tags: ['featured'], condition: 'جديد' }];
      state.categories = [{ name: product.category }];
      state.brands = [{ name: product.brand }];
      window.savedCardPayloads = [];
      window.SwitchesSupabaseAdmin.request = async (url, options = {}) => {
        if (options.method === 'PUT') {
          const payload = JSON.parse(options.body);
          window.savedCardPayloads.push(payload);
          Object.assign(state.products[0], payload);
          return {};
        }
        if (url.endsWith('/products')) return state.products;
        if (url.endsWith('/overview')) return {};
        return [];
      };
      openProductEditor(product.id);
    }, products[0]);
    await admin.locator('[name=condition]').selectOption({ label: 'مجدد' });
    await admin.locator('[name=availability]').selectOption('comingSoon');
    await admin.locator('[name=freeShipping]').check();
    await admin.locator('#modalForm button[type=submit]').click();
    await admin.waitForFunction(() => window.savedCardPayloads.length === 1);
    let payload = await admin.evaluate(() => window.savedCardPayloads[0]);
    assert.equal(payload.condition, 'مجدد');
    assert.equal(payload.availability, 'comingSoon');
    assert.deepEqual(payload.tags, ['featured', 'freeShipping']);
    assert.equal(payload.price, products[0].price);
    assert.deepEqual(payload.images, products[0].images);
    await admin.evaluate(id => openProductEditor(id), products[0].id);
    assert.equal(await admin.locator('[name=freeShipping]').isChecked(), true);
    await admin.locator('[name=freeShipping]').uncheck();
    await admin.locator('[name=condition]').selectOption({ label: 'شبه جديد' });
    await admin.locator('#modalForm button[type=submit]').click();
    await admin.waitForFunction(() => window.savedCardPayloads.length === 2);
    payload = await admin.evaluate(() => window.savedCardPayloads[1]);
    assert.deepEqual(payload.tags, ['featured']);
    assert.equal(payload.condition, 'علبة مفتوحة');
    console.log('PASS: product states, 320-1920px layouts, filters/drawer/history, detail links, related ranking, loading states, cart/favorites, gift navigation, and admin save round trip.');
    console.log(`Product detail example: ${baseURL}/?product=${realProduct.id}`);
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
