(function () {
  'use strict';
  const model = window.SwitchesProductSections;
  const nav = window.SwitchesSectionNavigation;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const config = {
    minecraft: { section: 'MINECRAFT', name: 'Minecraft', eyebrow: 'عالمك، على طريقتك', description: 'اكتشف ألعاب Minecraft وإصداراتها، واختر النسخة المناسبة لمنصتك ومنطقة التفعيل.', icon: 'fa-cube' },
    subscriptions: { section: 'SUBSCRIPTION', name: 'الاشتراكات والمنتجات الرقمية', eyebrow: 'كل ما تحتاجه رقميًا', description: 'مفاتيح البرامج والاشتراكات والخدمات الرقمية في مكان واحد. تفاصيل واضحة لاختيار ما يناسبك.', icon: 'fa-layer-group' },
  };
  let visuals = {};
  let page;
  let seoSnapshot;
  let searchValue = '';
  let currentSection = '';
  let subscriptions = [];
  let subscriptionPending = true;
  let subscriptionError = false;
  let listingFilters;
  function busy(info) { return info.key === 'subscriptions' ? subscriptionPending : isProductBootstrapPending(); }
  function failed(info) { return info.key === 'subscriptions' ? subscriptionError : hasProductBootstrapFailed(); }
  function sectionProducts(info) { return model.inSection(info.key === 'subscriptions' ? subscriptions : allProducts, info.section); }

  function routeInfo() {
    const parts = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (!Object.hasOwn(config, parts[0])) return null;
    let ref = '';
    try { ref = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : ''; } catch { ref = '\uFFFD'; }
    return { key: parts[0], ref, ...config[parts[0]] };
  }
  function isRoute() { return Boolean(routeInfo()); }
  function hide() {
    listingFilters?.close();
    if (page) { page.hidden = true; page.classList.remove('active'); }
    restoreSeo();
  }
  function ensurePage() {
    if (page) return page;
    page = document.createElement('main');
    page.id = 'digitalStorePage';
    page.className = 'digital-store-page';
    page.hidden = true;
    page.innerHTML = '<div class="container"><div id="digitalSectionNavigation"></div><div id="digitalStoreContent"></div></div>';
    const footer = document.querySelector('footer');
    if (footer) footer.before(page); else document.body.append(page);
    page.addEventListener('click', event => {
      const orderButton = event.target.closest('[data-subscription-order]');
      if (orderButton && !orderButton.disabled) {
        const product = subscriptions.find(item => String(item.id) === orderButton.dataset.subscriptionOrder);
        if (product) window.SwitchesDynamicPricing.order(product);
        return;
      }
      const link = event.target.closest('[data-digital-link]');
      if (link && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); navigate(link.getAttribute('href')); return;
      }
      const cartButton = event.target.closest('[data-digital-cart]');
      if (cartButton && !cartButton.disabled) {
        if (window.addToCart(Number(cartButton.dataset.digitalCart))) {
          const label = cartButton.querySelector('span');
          if (label) { label.textContent = 'تمت الإضافة'; window.setTimeout(() => { if (label.isConnected) label.textContent = 'ضع في السلة'; }, 1300); }
        }
      }
      const thumbnail = event.target.closest('[data-digital-thumbnail]');
      if (thumbnail) {
        const mainImage = page.querySelector('#digitalMainImage');
        mainImage.hidden = false;
        if (mainImage.nextElementSibling?.classList.contains('digital-image-placeholder')) mainImage.nextElementSibling.remove();
        mainImage.src = thumbnail.dataset.digitalThumbnail;
        page.querySelectorAll('[data-digital-thumbnail]').forEach(button => button.setAttribute('aria-pressed', String(button === thumbnail)));
      }
    });
    page.addEventListener('input', event => {
      if (!event.target.matches('#digitalSearch')) return;
      searchValue = event.target.value;
      listingFilters?.setSearch(searchValue);
    });
    page.addEventListener('digital:search-reset', () => { searchValue = ''; page.querySelector('#digitalSearch').value = ''; });
    page.addEventListener('error', event => {
      const image = event.target;
      if (image.closest?.('[data-product-detail]')) return;
      if (!image.matches?.('.digital-card-art img,.digital-detail-image,.digital-thumbnails img')) return;
      image.hidden = true;
      const placeholder = document.createElement('span'); placeholder.className = 'digital-image-placeholder';
      placeholder.innerHTML = '<i class="fas fa-image" aria-hidden="true"></i>'; placeholder.setAttribute('role','img'); placeholder.setAttribute('aria-label','صورة المنتج غير متاحة');
      image.after(placeholder);
    }, true);
    return page;
  }
  function activate() {
    ensurePage();
    window.SwitchesCatalog?.closeFilters();
    closePromoPopup();
    document.querySelector('.main-content').style.display = 'none';
    ['allProductsPage', 'giftCardsPage', 'favoritesPage', 'accountPage'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    page.hidden = false;
    page.classList.add('active');
    document.getElementById('digitalSectionNavigation').innerHTML = nav.render(visuals);
    nav.sync();
  }
  function navigate(path, { push = true, scroll = true } = {}) {
    if (push && `${location.pathname}${location.search}` !== path) history.pushState({ page: 'digital-store' }, '', path);
    readRoute();
    if (scroll) { window.scrollTo({ top: 0, behavior: 'instant' }); page?.querySelector('h1')?.focus({ preventScroll: true }); }
  }
  function available(product) {
    const status = SwitchesProductCardData.availabilityValue(product.availability);
    if (status !== 'available') return status;
    const options = SwitchesProductOptions, variants = options.variants(product);
    return options.live(product) && (!variants.length || variants.some(variant => options.inventory(product,variant).available)) ? 'available' : 'unavailable';
  }
  function statusLabel(product) { return { available: 'متوفر', comingSoon: 'قريبًا', unavailable: 'غير متوفر' }[available(product)]; }
  function regionHtml(data) { return data.region ? `<bdi class="digital-region region-${model.regionClass(data.region)}">${esc(data.region)}</bdi>` : ''; }
  function priceHtml(product) {
    if (window.SwitchesDynamicPricing.isQuote(product)) return window.SwitchesDynamicPricing.html();
    const discount = model.discount(product);
    return `<div class="digital-price"><strong><bdi>${formatPrice(product.price)}</bdi></strong>${discount ? `<span class="digital-discount" dir="ltr">-${discount}%</span><del><bdi>${formatPrice(product.oldPrice ?? product.old_price)}</bdi></del>` : ''}</div>`;
  }
  function cartHtml(product, compact = false) {
    if (window.SwitchesDynamicPricing.isQuote(product)) return `<button class="digital-cart subscription-order ${compact ? 'digital-cart-compact' : ''}" type="button" data-subscription-order="${Number(product.id)}" aria-label="طلب ${esc(product.name)} عبر واتساب" ${available(product) !== 'available' ? 'disabled' : ''}><i class="fab fa-whatsapp" aria-hidden="true"></i><span>${available(product) === 'available' ? 'اطلب الآن' : statusLabel(product)}</span></button>`;
    return `<button class="digital-cart ${compact ? 'digital-cart-compact' : ''}" type="button" data-digital-cart="${Number(product.id)}" ${available(product) !== 'available' ? 'disabled' : ''} aria-label="${esc(available(product) === 'available' ? `ضع ${product.name} في السلة` : `${product.name}: ${statusLabel(product)}`)}"><i class="fas fa-cart-plus" aria-hidden="true"></i><span>${available(product) === 'available' ? 'ضع في السلة' : statusLabel(product)}</span></button>`;
  }
  function cardHtml(product, index = 0, featured = false) {
    const data = model.metadata(product);
    const image = product.images?.[0];
    const href = model.route(product);
    return `<article class="digital-product-card ${featured ? 'digital-product-featured' : ''}" data-digital-id="${Number(product.id)}">
      <a class="digital-card-art" href="${esc(href)}" data-digital-link aria-label="${esc(product.name)}">${image ? `<img src="${esc(image)}" alt="${esc(product.name)}" loading="${featured && index === 0 ? 'eager' : 'lazy'}" decoding="async">` : '<span class="digital-image-placeholder"><i class="fas fa-image" aria-hidden="true"></i></span>'}${data.edition ? `<span class="digital-edition">${esc(data.edition)}</span>` : ''}</a>
      <div class="digital-card-body">${product.topSellingRank?`<span class="store-product-rank">#${product.topSellingRank} الأكثر مبيعًا</span>`:''}<h3><a href="${esc(href)}" data-digital-link><bdi>${esc(product.name)}</bdi></a></h3>
        ${data.platform || data.activationMethod || data.productType || data.region ? `<p class="digital-card-meta">${[data.platform && `<bdi>${esc(data.platform)}</bdi>`,(data.activationMethod || model.TYPES[data.productType]) && `<bdi>${esc(data.activationMethod || model.TYPES[data.productType])}</bdi>`,regionHtml(data)].filter(Boolean).join('<span aria-hidden="true">·</span>')}</p>` : ''}
        ${available(product) !== 'available' ? `<p class="digital-stock availability-${available(product)}"><span></span>${statusLabel(product)}</p>` : ''}
        <div class="digital-card-bottom">${priceHtml(product)}<div class="digital-card-actions">${cartHtml(product,true)}${typeof renderFavoriteButton === 'function' ? renderFavoriteButton(product) : ''}</div></div>
      </div></article>`;
  }
  function skeleton(count = 6) {
    return `<div class="digital-grid digital-skeletons" aria-hidden="true">${Array.from({ length: count }, () => '<div class="digital-product-card"><div class="skeleton-block digital-art-skeleton"></div><div class="digital-card-body"><div class="skeleton-block digital-line-skeleton"></div><div class="skeleton-block digital-line-skeleton short"></div><div class="skeleton-block digital-price-skeleton"></div></div></div>').join('')}</div><span class="digital-sr-only" role="status">جارٍ تحميل المنتجات</span>`;
  }
  function emptyHtml(search = false) {
    return `<div class="digital-empty"><i class="fas ${search ? 'fa-magnifying-glass' : 'fa-box-open'}" aria-hidden="true"></i><h2>${search ? 'لا توجد نتائج مطابقة' : 'المنتجات ستتوفر هنا قريبًا'}</h2><p>${search ? 'جرّب البحث باسم منتج آخر.' : 'تصفّح أقسام المتجر الأخرى إلى حين إضافة المنتجات.'}</p>${search ? '' : '<a href="/?view=products" data-section-route="products">تصفّح PC PARTS <i class="fas fa-arrow-left" aria-hidden="true"></i></a>'}</div>`;
  }
  function heroHtml(info) {
    const image = nav.imageUrl(visuals[info.key]?.heroBackground);
    return `<section class="digital-hero digital-hero-${info.key}">${image ? `<img class="digital-hero-image" src="${esc(image)}" alt="" fetchpriority="high" loading="eager" decoding="async">` : ''}<div class="digital-hero-overlay"></div><div class="digital-hero-copy"><span class="digital-eyebrow"><i class="fas ${info.icon}" aria-hidden="true"></i> ${info.eyebrow}</span><h1 tabindex="-1" ${info.key === 'minecraft' ? 'lang="en" dir="ltr"' : ''}>${info.name}</h1><p>${info.description}</p><a class="digital-hero-link" href="#digitalCatalog">استكشف المنتجات <i class="fas fa-arrow-down" aria-hidden="true"></i></a></div></section>`;
  }
  function renderListing(info) {
    listingFilters?.destroy();
    const root = document.getElementById('digitalStoreContent');
    page.classList.toggle('is-subscriptions', info.key === 'subscriptions');
    root.innerHTML = `${heroHtml(info)}<section id="digitalCatalog" class="digital-catalog"><div class="digital-catalog-heading"><div><span class="digital-eyebrow">تصفّح القسم</span><h2>${info.key === 'minecraft' ? 'جميع منتجات Minecraft' : 'الاشتراكات والبرامج الرقمية'}</h2></div><label class="digital-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span class="digital-sr-only">البحث في ${info.name}</span><input id="digitalSearch" type="search" placeholder="ابحث عن منتج..." value="${esc(searchValue)}" autocomplete="off"></label></div><div id="digitalProducts" aria-live="polite"></div></section>`;
    renderListingProducts(info);
    setSeo({ title: `${info.name} | Switches Store`, description: info.description, path: `/${info.key}`, image: visuals[info.key]?.heroBackground || visuals.sections?.[info.key] });
  }
  function renderListingProducts(info) {
    listingFilters?.destroy(); listingFilters = null;
    const root = document.getElementById('digitalProducts');
    if (!root) return;
    root.setAttribute('aria-busy',String(busy(info)));
    document.getElementById('digitalSearch').disabled = busy(info);
    if (busy(info)) { root.innerHTML = skeleton(); return; }
    if (failed(info)) { root.innerHTML = '<div class="digital-error" role="alert"><h2>تعذر تحميل المنتجات</h2><button type="button" onclick="SwitchesDigitalStore.reloadSubscriptions()">إعادة المحاولة</button></div>'; return; }
    const data = product => model.metadata(product);
    const statusLabels = {available:'المتوفر فقط',comingSoon:'قريبًا',unavailable:'غير متوفر'};
    listingFilters = SwitchesDigitalFilters.create(root,{
      id:info.key,products:sectionProducts(info),
      facets:[
        {key:'availability',label:'التوفر',value:available,optionLabel:value => statusLabels[value]},
        {key:'country',label:'بلد التفعيل',value:product => data(product).activationCountry},
        {key:'platform',label:'المنصة',search:true,value:product => data(product).platform},
        {key:'type',label:'النوع',value:product => [model.TYPES[data(product).productType],data(product).activationMethod].filter(Boolean)},
        {key:'region',label:'المنطقة',value:product => data(product).region},
        {key:'duration',label:'المدة',value:product => data(product).duration},
        {key:'category',label:'التصنيف',value:product => data(product).catalogCategory},
      ],
      searchText:product => [product.name,product.description,product.brand,data(product).platform,data(product).activationMethod,...data(product).bundleServices.map(item => item.name)].join(' '),
      render:(products,filtering) => products.length ? `<div class="digital-grid">${products.map((product,index) => cardHtml(product,index)).join('')}</div>` : emptyHtml(filtering),
      afterRender:() => { if (typeof syncFavoriteButtons === 'function') syncFavoriteButtons(); },
    });
    if (searchValue) listingFilters.setSearch(searchValue);
    document.getElementById('digitalSearch').value = listingFilters.search;
    root.querySelector('.digital-filter-count').id = 'digitalResultCount';
  }
  function factsHtml(data) {
    const facts = [
      ['fa-display', 'المنصة', data.platform], ['fa-circle-check', 'يمكن التفعيل في', data.activationCountry],
      ['fa-key', 'نوع المنتج', model.TYPES[data.productType]], ['fa-globe', 'الريجن', data.region],
      ['fa-clock', 'مدة الاشتراك', data.duration], ['fa-box-open', 'طريقة التسليم', data.deliveryMethod],
      ['fa-link', 'طريقة التفعيل', data.activationMethod],
      ['fa-layer-group', 'الإصدار', data.edition],
    ].filter(([, , value]) => value);
    return facts.length ? `<dl class="digital-facts">${facts.map(([icon, title, value]) => `<div><i class="fas ${icon}" aria-hidden="true"></i><div><dt>${title}</dt><dd>${title === 'الريجن' ? regionHtml(data) : `<bdi>${esc(value)}</bdi>`}</dd></div></div>`).join('')}</dl>` : '';
  }
  function renderDetail(info) {
    listingFilters?.destroy(); listingFilters = null;
    const root = document.getElementById('digitalStoreContent');
    page.classList.toggle('is-subscriptions', info.key === 'subscriptions');
    if (busy(info)) { root.innerHTML = `<div class="digital-detail-loading" aria-busy="true">${skeleton(3)}</div>`; setSeo({ title: `${info.name} | Switches Store`, description: info.description, path: `/${info.key}/${encodeURIComponent(info.ref)}` }); return; }
    if (failed(info)) { root.innerHTML = '<div class="digital-error" role="alert"><h2>تعذر تحميل المنتج</h2></div>'; return; }
    const products = sectionProducts(info);
    const product = products.find(item => String(item.id) === info.ref || item.slug === info.ref);
    if (!product) {
      root.innerHTML = `<div class="digital-empty"><i class="fas fa-box-open" aria-hidden="true"></i><h1 tabindex="-1">المنتج غير موجود</h1><p>قد يكون المنتج غير متاح حاليًا.</p><a href="/${info.key}" data-digital-link>العودة إلى ${info.name}</a></div>`;
      setSeo({ title: `المنتج غير موجود | Switches Store`, description: 'هذا المنتج غير متاح حاليًا.', path: `/${info.key}/${encodeURIComponent(info.ref)}` });
      return;
    }
    const data = model.metadata(product);
    const related = products.filter(item => item.id !== product.id).sort((a,b) => Number(model.metadata(b).family === data.family) - Number(model.metadata(a).family === data.family) || model.compare(a,b)).slice(0, 6);
    const facts = {...data};
    // Selected variant values already have their own controls; don't repeat a
    // different base value beside them in the static facts.
    SwitchesProductOptions.groups(product).forEach(group => { if (Object.hasOwn(facts,group.key)) facts[group.key] = ''; });
    const options = { digital:true, quote:SwitchesDynamicPricing.isQuote(product), category:data.catalogCategory || info.name, factsHtml:factsHtml(facts), actionClass:SwitchesDynamicPricing.isQuote(product) ? 'digital-cart subscription-order' : 'digital-cart' };
    root.innerHTML = `<nav class="digital-breadcrumb" aria-label="مسار المنتج"><a href="/${info.key}" data-digital-link>${info.name}</a><i class="fas fa-chevron-left" aria-hidden="true"></i><span><bdi>${esc(product.name)}</bdi></span></nav>
      ${SwitchesProductDetail.html(product,options)}
      ${data.productType === 'BUNDLE' && data.bundleServices.length ? `<section class="digital-description"><h2>الخدمات داخل الباقة</h2><div class="subscription-bundle-services">${data.bundleServices.map(item => `<article><i class="fas fa-layer-group" aria-hidden="true"></i><h3>${esc(item.name)}</h3>${item.duration ? `<p>${esc(item.duration)}</p>` : ''}</article>`).join('')}</div></section>` : ''}
      ${related.length ? `<section class="digital-related"><div class="digital-catalog-heading"><h2>منتجات مشابهة</h2><a href="/${info.key}" data-digital-link>عرض الكل <i class="fas fa-arrow-left" aria-hidden="true"></i></a></div><div class="digital-grid">${related.map((item,index) => cardHtml(item,index)).join('')}</div></section>` : ''}`;
    SwitchesProductDetail.mount(root.querySelector('[data-product-detail]'),product,options);
    if (typeof syncFavoriteButtons === 'function') syncFavoriteButtons();
    setSeo({ title: product.seoTitle || `${product.name} | Switches Store`, description: product.metaDescription || product.description || product.name, path: model.route(product), image: product.images?.[0], product });
  }
  function setSeo({ title, description, path, image, product }) {
    const selectors = ['meta[name="description"]', 'link[rel="canonical"]', ...['title', 'description', 'image', 'image:secure_url', 'image:alt', 'url', 'type'].map(key => `meta[property="og:${key}"]`), ...['title', 'description', 'image'].map(key => `meta[name="twitter:${key}"]`)];
    if (!seoSnapshot) seoSnapshot = {
      title: document.querySelector('title')?.getAttribute('data-home-title') || document.title,
      nodes: selectors.map(selector => {
        let node = document.querySelector(selector)?.cloneNode(true) || null;
        if (node?.hasAttribute('data-home-content')) node.content = node.getAttribute('data-home-content');
        if (node?.hasAttribute('data-section-entry')) node = null;
        return { selector, node };
      }),
    };
    function update(selector, attribute, value) {
      let element = document.querySelector(selector);
      if (!value) { element?.remove(); return; }
      if (!element) {
        element = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
        const match = selector.match(/\[(name|property|rel)="([^"]+)"\]/);
        element.setAttribute(match[1], match[2]); document.head.append(element);
      }
      element.setAttribute(attribute, value);
    }
    const origin = new URL(seoSnapshot.nodes.find(item => item.selector === 'meta[property="og:url"]')?.node?.content || location.origin).origin;
    const url = new URL(path, origin).href;
    const absoluteImage = image ? new URL(image, origin).href : '';
    document.title = title;
    update('meta[name="description"]', 'content', description);
    update('link[rel="canonical"]', 'href', url);
    for (const [key, value] of Object.entries({ title, description, image: absoluteImage, 'image:secure_url': absoluteImage.startsWith('https:') ? absoluteImage : '', 'image:alt': image ? title : '', url, type: product ? 'product' : 'website' })) update(`meta[property="og:${key}"]`, 'content', value);
    for (const [key, value] of Object.entries({ title, description, image: absoluteImage })) update(`meta[name="twitter:${key}"]`, 'content', value);
  }
  function restoreSeo() {
    if (!seoSnapshot) return;
    document.title = seoSnapshot.title;
    for (const { selector, node } of seoSnapshot.nodes) { document.querySelector(selector)?.remove(); if (node) document.head.append(node); }
    seoSnapshot = null;
  }
  function readRoute() {
    const info = routeInfo();
    if (!info) { hide(); nav.sync(); return; }
    if (currentSection !== info.key) { searchValue = ''; currentSection = info.key; }
    activate();
    if (info.ref) renderDetail(info); else renderListing(info);
  }
  function refresh() { if (isRoute()) readRoute(); }
  async function reloadSubscriptions() {
    subscriptionPending = true; subscriptionError = false;
    refresh();
    try {
      const result = await window.SwitchesPublicCatalog.loadSubscriptions();
      subscriptions = result.products || [];
      window.SwitchesStoreSettings = { ...(window.SwitchesStoreSettings || {}), ...result.settings };
      window.dispatchEvent(new CustomEvent('switches:settings-changed'));
    } catch { subscriptionError = true; }
    subscriptionPending = false;
    refresh();
  }
  async function initialize() {
    ensurePage();
    readRoute();
    reloadSubscriptions();
    window.addEventListener('popstate', readRoute);
    try {
      const response = await fetch('/data/store-visuals.json');
      if (!response.ok) throw new Error(`Images: ${response.status}`);
      visuals = await response.json();
      refresh();
    } catch (error) { console.warn('Switches Store: section images unavailable.', error); }
  }
  window.SwitchesDigitalStore = Object.freeze({ navigate, readRoute, refresh, hide, isRoute, reloadSubscriptions, renderCard: cardHtml });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize); else initialize();
})();
